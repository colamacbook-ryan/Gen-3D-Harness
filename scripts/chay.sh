#!/usr/bin/env bash
# Gen-Stage — MỘT LỆNH bật tất cả: cầu nối (ws + giọng Việt + MCP), sân khấu, não agy, rồi mở Firefox.
# Dùng:  bash scripts/chay.sh                          # bật
#        bash scripts/chay.sh --khong-mo-trinh-duyet   # bật, không mở Firefox
#        bash scripts/chay.sh tat                      # tắt hết
#
# CNS-002 (e): dịch vụ nào đã có (kể cả do extension VS Code bật) được dò theo CỔNG
# đang nghe, không theo chuỗi dòng lệnh (`pgrep -f` không khớp tiến trình extension
# spawn). Đã có sân khấu nối bridge (panel VS Code / tab cũ) thì KHÔNG mở thêm Firefox.
#
# Biến môi trường (chủ yếu cho kiểm thử, mặc định = chạy thật):
#   GEN_STAGE_PORT / _TTS_PORT / _MCP_PORT / _STT_PORT   cổng bridge (8787–8790)
#   GEN_STAGE_DEV_PORT          cổng vite (5173)
#   GEN_STAGE_MO_TRINH_DUYET    lệnh mở trình duyệt (mặc định: firefox, rồi xdg-open)
#   GEN_STAGE_KHONG_TAI_ASSET=1 bỏ qua các script tải asset
set -u
cd "$(dirname "$0")/.."
LOG=".cache/log"; mkdir -p "$LOG"

MO_TRINH_DUYET=1
LENH=""
for a in "$@"; do
  case "$a" in
    tat) LENH=tat ;;
    --khong-mo-trinh-duyet) MO_TRINH_DUYET=0 ;;
    *) echo "Tham số lạ: $a (dùng: tat | --khong-mo-trinh-duyet)" >&2; exit 64 ;;
  esac
done

P_WS="${GEN_STAGE_PORT:-8787}"
P_TTS="${GEN_STAGE_TTS_PORT:-8788}"
P_MCP="${GEN_STAGE_MCP_PORT:-8789}"
P_STT="${GEN_STAGE_STT_PORT:-8790}"
P_DEV="${GEN_STAGE_DEV_PORT:-5173}"

# Cổng có ai đang NGHE không? Thử lần lượt công cụ có sẵn (Fedora: iproute `ss`
# luôn có; lsof/fuser tuỳ máy), cuối cùng là tự nối thử bằng /dev/tcp của bash.
cong_dang_nghe() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    [ -n "$(ss -H -ltn "sport = :$p" 2>/dev/null)" ]
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$p" -sTCP:LISTEN -t >/dev/null 2>&1
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$p/tcp" >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null
  fi
}

# Giải phóng cổng (giết tiến trình đang nghe).
giai_phong_cong() {
  local p="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$p/tcp" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null
  elif command -v ss >/dev/null 2>&1; then
    ss -H -ltnp "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u | xargs -r kill 2>/dev/null
  fi
  return 0
}

if [ "$LENH" = "tat" ]; then
  pkill -f "scripts/nao-agy.mjs" 2>/dev/null     # driver não (chạy nền, không có cổng nên dò cổng không thấy)
  tmux kill-session -t gen-stage-nao 2>/dev/null  # agy đang ấm trong tmux
  for p in "$P_WS" "$P_TTS" "$P_MCP" "$P_STT" "$P_DEV"; do giai_phong_cong "$p"; done
  echo "Đã tắt Gen-Stage."; exit 0
fi
[ -d node_modules ] || pnpm install --silent
# C3 (#40): Boss từng thấy model owner CŨ sau khi merge vì chay.sh BỎ QUA
# fetch-assets.sh khi file đã tồn tại — URL đổi mà không ai gọi lại script thì
# không bao giờ tải lại. Giờ LUÔN gọi cả 3 script mỗi lần chạy; mỗi script tự
# quyết có tải lại hay không bằng stamp `<file>.url` (xem fetch-assets.sh).
if [ "${GEN_STAGE_KHONG_TAI_ASSET:-0}" != "1" ]; then
  bash scripts/fetch-assets.sh >/dev/null 2>&1
  bash scripts/fetch-lab-assets.sh >/dev/null 2>&1
  bash scripts/fetch-anim.sh >/dev/null 2>&1
  bash scripts/fetch-stt.sh >/dev/null 2>&1   # C1 (#31): nhận dạng giọng Việt, tải 1 lần
fi
# bridge: dò theo CỔNG. Đủ ws + tts đang nghe (kể cả do extension VS Code bật) → dùng lại.
# Chỉ một nửa số cổng có người giữ (bridge chết dở / tiến trình lạ) → giải phóng rồi bật lại cho sạch.
VUA_BAT_BRIDGE=0
if cong_dang_nghe "$P_WS" && cong_dang_nghe "$P_TTS"; then
  echo "bridge đã chạy (cổng $P_WS) — dùng lại"
else
  for p in "$P_WS" "$P_TTS" "$P_MCP" "$P_STT"; do giai_phong_cong "$p"; done; sleep 1
  (nohup pnpm bridge > "$LOG/bridge.log" 2>&1 &)
  VUA_BAT_BRIDGE=1
  for i in $(seq 1 20); do cong_dang_nghe "$P_WS" && break; sleep 1; done
fi
if cong_dang_nghe "$P_DEV"; then
  echo "vite đã chạy (cổng $P_DEV) — dùng lại"
else
  (nohup pnpm exec vite --host --port "$P_DEV" > "$LOG/dev.log" 2>&1 &)
  for i in $(seq 1 30); do cong_dang_nghe "$P_DEV" && break; sleep 1; done
fi
# ------------------------------------------------------------------- não của Gen
#
# Bản cũ (GEN_STAGE_NAO=tmux) bật agy TƯƠNG TÁC rồi bỏ đó: agy chào một lượt
# rồi về dấu nhắc `>` chờ người gõ **trong terminal**, nên Sếp gõ trong Firefox
# thì không ai nghe. Mặc định bây giờ là DRIVER (`scripts/nao-agy.mjs`): nó
# nghe `user.text` qua ws, bắn phản xạ trong ≤300 ms, rồi bơm một dòng vào agy
# đang ấm trong tmux. Boss không phải chạm terminal.
if command -v agy >/dev/null; then
  if [ "${GEN_STAGE_NAO:-driver}" = "tmux" ]; then
    # CHẾ ĐỘ CŨ — chỉ để so sánh, Sếp phải tự gõ trong tmux
    if ! tmux has-session -t gen-stage-nao 2>/dev/null; then
      tmux new-session -d -s gen-stage-nao -c "$PWD" \
        "agy --dangerously-skip-permissions --prompt-interactive \"\$(cat skills/gen-stage-nao/SKILL.md)\"; echo; echo '[não đã tắt — Enter để đóng]'; read"
      for i in $(seq 1 20); do
        sleep 1
        if tmux capture-pane -pt gen-stage-nao 2>/dev/null | grep -q "trust"; then tmux send-keys -t gen-stage-nao Enter; break; fi
      done
    fi
  else
    # WATCHDOG (Refs #37): nếu tiến trình driver chết (crash, bị kill ngoài ý
    # muốn…) thì vòng `while true` nhẹ này tự bật lại ngay, không cần Sếp chạy
    # lại chay.sh. `pkill -f "scripts/nao-agy.mjs"` (ở nhánh "tat" trên) khớp
    # CẢ dòng lệnh của vòng lặp này lẫn tiến trình node con — tắt là tắt thật,
    # không tự sống lại.
    pgrep -f "scripts/nao-agy.mjs" >/dev/null || (nohup bash -c '
      while true; do
        echo "[watchdog $(date +%T)] bật driver não — scripts/nao-agy.mjs"
        node scripts/nao-agy.mjs
        ma=$?
        # mã 3 = khoá driver (đã có driver não khác đang chạy, xem scripts/khoa-nao.mjs):
        # bật lại cũng bị khoá tiếp → DỪNG vòng lặp, không quay vô hạn.
        if [ "$ma" -eq 3 ]; then
          echo "[watchdog $(date +%T)] driver não thoát vì BỊ KHOÁ (đã có driver khác, xem .cache/nao-driver.lock) — dừng watchdog, không bật lại"
          break
        fi
        echo "[watchdog $(date +%T)] driver não thoát (mã $ma) — bật lại sau 2 s"
        sleep 2
      done
    ' > "$LOG/nao.log" 2>&1 &)
  fi
fi
URL="http://localhost:$P_DEV/"
# Đã có sân khấu nối bridge (panel VS Code, tab cũ…) thì mở thêm Firefox chỉ để có HAI sân
# khấu (bridge đá bản cũ ra, CNS-002). Hỏi bridge; không hỏi được thì thà mở (như trước).
if [ "$MO_TRINH_DUYET" = "1" ] && [ "$VUA_BAT_BRIDGE" = "0" ]; then
  node scripts/hoi-san-khau.mjs >/dev/null 2>&1; kq=$?
  if [ "$kq" -eq 0 ]; then
    MO_TRINH_DUYET=0
    echo "Đã có sân khấu nối bridge — không mở thêm trình duyệt."
  fi
fi
if [ "$MO_TRINH_DUYET" = "1" ]; then
  if [ -n "${GEN_STAGE_MO_TRINH_DUYET:-}" ]; then
    $GEN_STAGE_MO_TRINH_DUYET "$URL"
  else
    (firefox "$URL" >/dev/null 2>&1 &) || (xdg-open "$URL" >/dev/null 2>&1 &)
  fi
fi
echo "Gen-Stage đã bật: $URL"
echo "  não: $LOG/nao.log  ·  xem agy nghĩ gì: tmux attach -t gen-stage-nao  ·  tắt: bash scripts/chay.sh tat"
