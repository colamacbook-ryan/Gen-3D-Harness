#!/usr/bin/env bash
# cai-vscode.sh — CÀI GEN-STAGE VÀO VS CODE BẰNG MỘT LỆNH (MVP, 27/10).
#
#   bash scripts/cai-vscode.sh            # cài đủ: lõi + extension + chỗ đặt repo
#   bash scripts/cai-vscode.sh --hook     # … và gắn hook Claude Code (đội ngũ agent INT-07)
#   bash scripts/cai-vscode.sh --chi-goi  # chỉ build + đóng gói .vsix (không cài gì)
#
# Làm 6 việc, chạy lại bao nhiêu lần cũng được (bước nào đủ rồi thì bỏ qua):
#   1. kiểm máy: Node ≥ 22.18, pnpm, lệnh `code` (hoặc codium); ffmpeg/ollama chỉ nhắc
#   2. cài lõi một lần (`scripts/cai-dat.sh`: deps + asset 3D + model giọng) — bỏ qua nếu đã cài
#   3. build extension VS Code
#   4. đóng gói `dist/gen-stage-vscode-<bản>.vsix` (@vscode/vsce chạy qua npx, không thêm vào repo)
#   5. cài .vsix vào VS Code
#   6. ghi chỗ đặt repo vào ~/.config/gen-stage/root → extension tìm thấy bridge + sân khấu
#      ở BẤT KỲ dự án nào, không phải tự đặt `genStage.root`
#
# Không cần quyền root, không đụng gì ngoài: node_modules + asset trong repo, extension VS Code,
# ~/.config/gen-stage/root, và (chỉ khi có --hook) ~/.claude/settings.json (có sao lưu).
set -euo pipefail
cd "$(dirname "$0")/.."
GOC="$PWD"
VSCE="@vscode/vsce@4.0.0"

HOOK=0
CHI_GOI=0
for a in "$@"; do
  case "$a" in
    --hook) HOOK=1 ;;
    --chi-goi) CHI_GOI=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Không hiểu tham số: $a (xem --help)"; exit 64 ;;
  esac
done

buoc() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$1"; }
nhac() { printf '  \033[33m!\033[0m %s\n' "$1"; }
hong() { printf '  \033[31m✘\033[0m %s\n' "$1"; exit 1; }

buoc "1/6 · kiểm máy"
command -v node >/dev/null || hong "Chưa có Node. Cài Node ≥ 22.18 (vd: sudo dnf install nodejs22) rồi chạy lại."
NODE_V="$(node -p 'process.versions.node')"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || hong "Node $NODE_V quá cũ — cần ≥ 22.18 (giọng nói chạy file .ts trực tiếp)."
ok "Node $NODE_V"
command -v pnpm >/dev/null || hong "Chưa có pnpm. Cài: npm i -g pnpm   (hoặc: corepack enable)"
ok "pnpm $(pnpm -v)"
CODE=""
if [ "$CHI_GOI" = 0 ]; then
  for c in code codium code-insiders; do
    if command -v "$c" >/dev/null; then CODE="$c"; break; fi
  done
  [ -n "$CODE" ] || hong "Không thấy lệnh \`code\`. Trong VS Code: Ctrl+Shift+P → \"Shell Command: Install 'code' command in PATH\", rồi chạy lại."
  VSC_V="$("$CODE" --version 2>/dev/null | head -1)"
  node -e 'const [a,b]=process.argv[1].split(".").map(Number);process.exit(a>1||(a===1&&b>=106)?0:1)' "$VSC_V" \
    || hong "VS Code $VSC_V quá cũ — cần ≥ 1.106 (cột phải cho chatroom)."
  ok "VS Code $VSC_V ($CODE)"
fi
command -v ffmpeg >/dev/null && ok "ffmpeg (giọng nói)" || nhac "Chưa có ffmpeg → chưa nói bằng mic được (sudo dnf install ffmpeg). Gõ chat vẫn chạy."
if command -v ollama >/dev/null; then
  ok "Ollama (não local)"
else
  nhac "Chưa có Ollama → chưa có não local. Muốn có: https://ollama.com rồi \`ollama pull qwen2.5:7b\`."
fi

buoc "2/6 · lõi Gen-Stage (deps + asset 3D + model giọng — lần đầu lâu, có thể vài phút)"
if [ -f .cache/da-cai-dat ] && [ -d node_modules ] && [ -d public/models ]; then
  ok "đã cài từ $(cat .cache/da-cai-dat) — bỏ qua (xoá .cache/da-cai-dat để cài lại)"
  pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install
else
  bash scripts/cai-dat.sh
fi

buoc "3/6 · build extension"
pnpm -C vscode build >/dev/null
ok "vscode/out + vscode/out-web"

buoc "4/6 · đóng gói .vsix"
BAN="$(node -p 'require("./vscode/package.json").version')"
mkdir -p dist
VSIX="$GOC/dist/gen-stage-vscode-$BAN.vsix"
(cd vscode && npx --yes "$VSCE" package --no-dependencies --allow-missing-repository --out "$VSIX" >/dev/null)
ok "$VSIX ($(du -h "$VSIX" | cut -f1))"
if [ "$CHI_GOI" = 1 ]; then
  printf '\n\033[1mXong (chỉ đóng gói).\033[0m Cài tay: code --install-extension "%s"\n' "$VSIX"
  exit 0
fi

buoc "5/6 · cài vào VS Code"
"$CODE" --install-extension "$VSIX" --force >/dev/null
ok "đã cài gen-labs.gen-stage-vscode $BAN"

buoc "6/6 · ghi chỗ đặt repo"
CFG="${XDG_CONFIG_HOME:-$HOME/.config}"
case "$CFG" in /*) ;; *) CFG="$HOME/.config" ;; esac
mkdir -p "$CFG/gen-stage"
printf '%s\n' "$GOC" > "$CFG/gen-stage/root"
ok "$CFG/gen-stage/root → $GOC"

if [ "$HOOK" = 1 ]; then
  buoc "+ · hook Claude Code (đội ngũ agent hiện hình)"
  node scripts/gan-hook-claude.mjs
fi

cat <<KET

$(printf '\033[1mXong.\033[0m') Kiểm 5 phút (chi tiết: docs/CAI-DAT-VSCODE.md):
  1. Tải lại VS Code (Ctrl+Shift+P → "Developer: Reload Window"), mở dự án bất kỳ.
  2. Ctrl+Shift+P → "Gen-Stage: Mở sân khấu" → văn phòng búp bê hiện trong tab (lần đầu chờ ~10–20 s).
  3. Ctrl+Alt+B mở cột phải → chatroom Gen-Stage → gõ "Nhi ơi, chào em" → Nhi quay lại, có bong bóng.
  4. Lưu một file / chạy test → chatroom hiện dòng 👁, Nhi phản ứng.
KET
[ "$HOOK" = 1 ] && echo "  5. Mở phiên Claude Code MỚI, giao một việc có subagent → nhân viên búp bê vào văn phòng, họp, nộp bài."
[ "$HOOK" = 0 ] && echo "  (Muốn thấy đội ngũ agent khi dùng Claude Code: bash scripts/cai-vscode.sh --hook)"
exit 0
