# Gen-3D-Harness (nền: Gen-Stage)

> Bộ não (SSOT) của Ryan × Gen nằm ở repo **colamacbook-ryan/Second-Brain**. Nếu phiên này chưa có Second-Brain:
> gắn thêm repo đó vào phiên, đọc `CLAUDE.md` + `claude/START-HERE.md` của nó trước khi làm việc.
> Ghi nhớ, quyết định, journal luôn viết vào Second-Brain (dự án `01-projects/gen-stage-vscode/`: INTENT, kiến trúc, audit CNS);
> repo này chỉ chứa code + tài liệu của chính nó.
>
> **Nguồn gốc:** nhập toàn bộ từ `Genesis-ryan-84-0567536339/gen-stage` (giữ lịch sử) ngày 2026-10-26 theo lệnh Ryan
> ("clone hết về repo Gen-3D-Harness để làm thành dự án độc lập trọn bộ"). Từ đây Gen-3D-Harness là dự án độc lập;
> đồng bộ thêm từ repo cũ chỉ khi Ryan yêu cầu (`git fetch genstage main` rồi merge).
> **License:** © 2026 Gen Labs — All rights reserved (xem `LICENSE`).
> **Thư mục `vscode/`** (đang làm): extension VS Code — sân khấu trong tab editor + chatroom cột phải + não LLM local.

## Gen-Stage (lõi sân khấu)

Sân khấu 3D chạy trong trình duyệt, điều khiển bằng **một bộ lệnh cố định**
(Actor API v0.1 — `docs/spec/actor-api.md`). Mọi đường vào (nút trên giao diện,
ô kịch bản, bridge WebSocket, sau này là MCP cho agent) đi qua **cùng một
dispatcher**, nên Boss bấm tay được gì thì agent gọi được đúng cái đó.

Stack: Vite + TypeScript (strict) + Three.js + `@pixiv/three-vrm`, không
framework UI. Đợt A (`docs/du-phong-dot-A.md`): A1 lõi điều khiển (Issue #5) →
A2 bộ hành vi → A3 lab viễn tưởng.

## Lệnh

```bash
pnpm install              # cài phụ thuộc
pnpm assets                # tải asset (VRM + Kenney Furniture Kit CC0) — 1 lần sau khi clone
pnpm assets:lab             # tải Kenney Space Kit CC0 cho lab A3 (public/kenney-sci-fi/)
pnpm dev                  # chạy dev, mở http://localhost:5173
pnpm dev --host           # cho điện thoại cùng wifi vào xem
pnpm build                # tsc + vite build, phải không lỗi trước khi mở PR
pnpm test                 # vitest: dispatcher, hàng đợi, kịch bản, stage.describe, A3 screen/module/fx
pnpm bridge               # bridge: ws lệnh (8787) + giọng Việt (8788) + MCP HTTP (8789) + nhận giọng (8790)
pnpm mcp                  # MCP qua stdio cho agy CLI (`agy mcp add gen-stage …`)
pnpm nao                  # DRIVER não: nghe user.text qua ws → nuôi agy đang ấm trong tmux
pnpm nao-local            # V1 — DRIVER NÃO LOCAL: user.text qua ws → Ollama /v1 (tools) → Gen trả lời
pnpm tai-nghe --to gen    # V2 — TAI NGHE: thu mic (ffmpeg) một lượt → POST /stt → stage.hear; stdout JSON lines (hợp đồng đầu file scripts/tai-nghe.mjs)
pnpm nao-demo             # não mẫu rule-based (không LLM) nối MCP stdio — vòng kín khi không có agy
pnpm preview              # xem thử bản build

node scripts/kiem-a1.mjs      # bằng chứng A1: bấm từng lệnh + chụp ảnh vào docs/a1/
node scripts/kiem-a3.mjs      # bằng chứng A3: screen/module/fx/preset + kịch bản mẫu + FPS vào docs/a3/
node scripts/kiem-lab2.mjs    # bằng chứng lab rộng-sáng-gọn + điều khiển phím vào docs/lab2/
node scripts/kiem-bridge.mjs  # bằng chứng bridge: moveTo qua ws → nhận actor.arrived
node scripts/kiem-b2.mjs      # bằng chứng B2: giọng tiếng Việt + nhép miệng theo âm vào docs/b2/
node scripts/kiem-a2.mjs      # bằng chứng A2: 15 emote + 13 clip + say + idleStyle, ảnh/video/log số vào docs/a2/
node scripts/kiem-a2.mjs --chi-anh  # bản NHANH lúc đang làm (chỉ ảnh + số đo, không quay video, không đo FPS)
node scripts/kiem-b1.mjs      # bằng chứng B1: bố cục 3 vùng + steer mượt + owner/gen vào docs/b1/ (CHẠY MỘT LẦN)
node scripts/kiem-b3.mjs      # bằng chứng B3: Owner gõ → MCP → Gen diễn + nói, vào docs/b3/ (CHẠY MỘT LẦN)
node scripts/kiem-nao.mjs     # bằng chứng DRIVER: Sếp gõ → driver → agy thật → Gen nói, đo độ trễ, vào docs/nao/ (CHẠY MỘT LẦN)
node scripts/kiem-tai-nghe.mjs   # bằng chứng V2: bridge THẬT (token) + sân khấu giả + STT GIẢ + tai-nghe thật, ca a–i (cổng 8924–8929, đổi bằng `GEN_STAGE_KIEM_CONG_TAI`), vào docs/v2/nhat-ky-kiem-tai-nghe.json
node scripts/kiem-nao-local.mjs  # bằng chứng V1: bridge thật + Ollama GIẢ + driver thật (cổng 8863–8868, đổi bằng `GEN_STAGE_KIEM_CONG`), vào docs/v1/nhat-ky-kiem-nao-local.json
node scripts/kiem-mo-phong-loi-cu.mjs  # mô phỏng nguyên nhân gốc #37 (naoHttpDen hết hạn, ws không hề rớt) vào docs/nao/mo-phong-loi-cu.*
node scripts/kiem-reconnect.mjs        # bằng chứng heartbeat + backoff + watchdog (#37): driver sống 10 phút, giết bridge giữa chừng, vào docs/nao/reconnect.* (CHẠY MỘT LẦN)
node scripts/kiem-c0.mjs      # bằng chứng C0: phản xạ xã hội + nhân vật nam anime, vào docs/c0/ (CHẠY MỘT LẦN)
node scripts/kiem-nen.mjs     # bằng chứng V1 chế độ nền (INT-06): fps thường/nền + durationMs ở nền, vào docs/v1/ (cần `pnpm -C vscode build`)
node scripts/kiem-c1.mjs      # bằng chứng C1: giữ V nói → bridge nhận chữ → user.speech → Gen phản ứng, vào docs/c1/ (CHẠY MỘT LẦN)
bash scripts/fetch-anim.sh    # tải bộ chuyển động CC0 (Quaternius) về public/anim/ — chạy 1 lần sau khi clone
bash scripts/fetch-stt.sh     # C1: venv + model PhoWhisper-small ct2 vào .cache/stt/ — chạy 1 lần (chay.sh gọi sẵn)
```

## Quy ước

- **Không commit asset.** Mọi file 3D (`public/models/`, `public/kenney/`) đều nằm
  trong `.gitignore`; chỉ commit `scripts/fetch-assets.sh`. Không commit file > 5 MB.
- **Nguồn + giấy phép asset** ghi trong `assets/LICENSES.md`. Thêm asset mới thì
  phải thêm vào cả script tải lẫn file này.
- **Tiếng Việt**: giao diện, comment, commit, PR, báo cáo đều bằng tiếng Việt có dấu.
  Tên biến/hàm tiếng Việt không dấu cho phần nghiệp vụ cảnh (`phong`, `nhanVat`…);
  **tên lệnh, tên tham số, khoá JSON trong Actor API giữ nguyên tiếng Anh** theo
  spec (`actor.moveTo`, `durationMs`, `distances`) — đổi là phá hợp đồng với agent.
- **Hiệu năng**: pixel ratio ≤ 2, shadow map 2048, chạy mượt trên điện thoại.
  Khung bóng của đèn chính phải **bó sát cảnh** (`shadow.camera.near/far`): để
  khoảng near/far rộng quá thì depth loãng và cả mặt sàn tự che bóng chính mình.
- **Không viết số euler cho xương tay.** Mọi cử chỉ dùng tay đi qua
  `huongTay(ben, doCao, raTruoc)` / `tay(...)` trong `src/behavior/cu-chi.ts`:
  `doCao` 0 = buông, 0.5 = ngang vai, 1 = quá đầu. Hướng gốc của xương tay
  **đo trên chính model** (`doHuongGoc`), không giả định T-pose. Vòng 1 đoán
  dấu `rotation.z` nên 4 emote giơ tay thành ép tay vào hông.
- **Kích thước asset tính bằng mét, không bằng hệ số scale chung**: `phong.ts`
  chuẩn hoá mỗi model Kenney về chiều cao/bề ngang thật (`layCao`/`layRong`).
  Một hệ số chung cho mọi model làm kệ/cột phình lên 6–8 m chắn khung hình.
- **Vật liệu không nhân màu hai lần**: `map` đã mang màu thì đừng đặt thêm
  `color` tối — tường từng đen kịt vì map × color.
- **Thời gian là lời hứa**: mọi hành động có thời lượng nội suy theo đồng hồ
  thật (không cộng dồn `dt`) và dùng hẹn giờ **huỷ được**, để `durationMs` trả
  cho agent luôn đúng kể cả khi máy tụt xuống vài khung hình/giây.
- **Một nguồn sự thật cho trạng thái**: `NhanVat.viec` (hành động đang chiếm
  thân) quyết định `state`; `Dispatcher.dangChay` quyết định `busy`/`queued`.
  Không nơi nào khác được tự ghi `trangThai`, và mọi hẹn giờ phải kiểm "mình còn
  là hành động hiện tại không" trước khi ghi.
- **Nhận diện hành động bằng token, không bằng tên lệnh** — cắt `actor.play`
  bằng đúng `actor.play` là chuyện thường ở A2.
- **Bố cục cảnh nằm trong BẢNG, không trong code dựng** (`src/stage/bo-cuc.ts`).
  `phong.ts` chỉ đọc bảng rồi dựng. Mọi toạ độ trên lưới nửa ô 0,5 m, có test
  canh lưới + canh hành lang ≥ 3 m. Thêm đồ = thêm một dòng vào bảng.
- **Chuẩn hoá model Kenney phải kẹp CẢ HAI chiều.** Chỉ chuẩn theo chiều cao
  thì model bè ngang (`structure`, `desk_computerCorner`) phình ra 3–4 m — dùng
  `rongToiDa` trong bảng bố cục.
- **Chibi hoá phải đặt scale lên XƯƠNG RAW** (`getRawBoneNode`), và vì xương
  raw là cây thật nên bảng tỉ lệ là **tuyệt đối**, chia cho tổ tiên gần nhất mới
  ra scale cục bộ. Scale rig normalized là **no-op** (Issue #17). Scale xong
  phải gọi `springBoneManager.setInitState()` không thì tóc bung thành chùm gai.
- **`at` là câu trả lời dứt khoát**: chỉ mang tên place khi actor đã đứng yên
  tại đó; đang `walking` thì luôn `null`, kể cả khi đi ngang qua place khác.
  Muốn biết "đang gần cái gì" thì đọc `nearest: { place, distance }` (luôn có).
- Quy trình: Issue → branch → PR (`Refs #N`) → tự kiểm kèm bằng chứng → merge.
  Không merge khi chưa có ảnh/log chạy thật trong PR.

## Bố cục mã

Ba tầng, không được gọi ngược: **lệnh** không biết Three.js, **sân khấu** không
biết registry, **giao diện** không gọi thẳng vào sân khấu.

| Thư mục / file | Việc |
| --- | --- |
| `src/api/types.ts` | Khuôn dữ liệu duy nhất: `Command`, `Result`, `StageEvent`, `StageState`, và giao diện `StageWorld` |
| `src/api/registry.ts` | Sổ đăng ký lệnh (tên, mô tả, tham số, ví dụ) → nguồn cho `stage.bootstrap` và bảng lệnh UI |
| `src/api/validate.ts` | Kiểm + chuẩn hoá tham số trước khi chạm sân khấu |
| `src/api/dispatcher.ts` | **Một hàm `run(cmd, args)`** cho mọi đường vào: kiểm tham số, hàng đợi khi actor bận, `interrupt`, nhật ký |
| `src/api/commands/*.ts` | Mỗi nhóm một file: `stage`, `actor`, `prop`, `scene`, `camera`, `script`, `screen`, `module`, `fx` (A3), `stubs` (rỗng — mọi lệnh v0.1 đã thi công thật) |
| `src/stage/world.ts` | Thi công `StageWorld` bằng Three.js: renderer, camera, đèn, bloom (A3), actor, prop, màn hình hologram, bong bóng chữ, vòng lặp |
| `src/stage/nhanvat.ts` | Một nhân vật VRM: máy trạng thái + 3 lớp chuyển động (clip thật → cử chỉ → vi mô) + nhép miệng |
| `src/behavior/chuyen-dong.ts` | Nạp bộ clip CC0, **retarget sang `vrm.humanoid`**, `AnimationMixer` + crossfade 0,25 s; bảng `DANG_NEN`/`NEN_CLIP`/`NEN_EMOTE` |
| `src/behavior/cu-chi.ts` | Lớp cử chỉ thủ tục trộn lên clip thật; **hướng tay khai bằng hình học** (`huongTay(doCao, raTruoc)`), không viết số euler |
| `src/stage/bo-cuc.ts` | **BẢNG BỐ CỤC** (B1): cái gì đặt ở đâu theo lưới 1 m (3 vùng), hộp chắn đường + `truotVaCham` cho `actor.steer`. Dữ liệu thuần, KHÔNG import three |
| `src/stage/phong.ts` | Dựng LAB VIỄN TƯỞNG (A3): phòng 16 × 16 m, trần 5,6 m, sàn vân sáng, bục trung tâm, bàn điều khiển cong, kệ module, máy phát, trần đèn dải (Kenney Space Kit chuẩn hoá theo mét, hoặc fallback geometry emissive) |
| `src/stage/man-hinh.ts` | Màn hình hologram A3: CanvasTexture + scan-line, stream chữ chạy dần |
| `src/fx/*.ts` | A3: hiệu ứng kết tinh module (`hat-ket-tinh.ts`) + `fx.play` (`hieu-ung.ts`) |
| `src/stage/noi-dung.ts` | Dữ liệu cảnh v0.1: places (gồm `ban-dieu-khien` A3), clips, biểu cảm, emote, preset đèn/máy quay (gồm `truoc-mat` A2) |
| `src/stage/che-do-nen.ts` | **V1 (INT-06)** — CHẾ ĐỘ NỀN, thuần (không three): ngưỡng có tên (`FPS_NEN` 15, `TY_LE_PIXEL_NEN` 1), `quyetCheDo` (ẩn/focus/tin vỏ VS Code), `docTinVo` (lọc `postMessage`), `nenVeKhung` (bỏ khung theo mốc rAF), `theoDoiCheDoNen` (nối DOM, `main.ts` gọi) |
| `src/stage/hanh-dong.ts` | Tiện ích `Action` (hành động có `durationMs` + `done` + `cancel`) |
| `src/ui/panel.ts` | Bảng lệnh **tự sinh** từ `stage.bootstrap` — không viết tay nút nào |
| `src/ui/script-box.ts` | Ô kịch bản: JSON hoặc dạng ngắn `gen moveTo ban-2` |
| `src/ui/log-view.ts` | Nhật ký cuộn + Sao chép / Xuất JSON |
| `src/ui/phim.ts` | Điều khiển bằng phím (WASD/1–0/Space/C/E/R/?) — **mọi phím gọi `dispatcher.run`**, tắt khi con trỏ đang ở ô nhập. B1: WASD gửi `actor.steer` mỗi 100 ms cho actor `controlledBy: "owner"` |
| `src/events.ts` · `src/log.ts` | Bus sự kiện · nhật ký JSON mọi lệnh và sự kiện |
| `src/bridge-client.ts` | Nối trình duyệt với bridge (mặc định bật, tắt bằng `?bridge=0`) |
| `bridge/server.ts` | Bridge WebSocket Node — mặc định chỉ nghe `127.0.0.1`; mở ra ngoài phải có `--host` + `GEN_STAGE_TOKEN`. Bật luôn TTS (8788) và MCP HTTP (8789) |
| `bridge/mcp.ts` | **B3** — MCP server: tool **sinh tự động** từ registry (`a.b` → `a_b`) + `stage_events` (long-poll). Hai cửa: stdio (`pnpm mcp`) và HTTP streamable `127.0.0.1:8789/mcp`. Cả hai nói với sân khấu bằng **vai client ws** của bridge |
| `src/behavior/phan-xa.ts` | **C0** — PHẢN XẠ XÃ HỘI: máy trạng thái chạy trong trình duyệt, không chờ não. Mọi hành động đi qua dispatcher, nguồn `phan-xa`, ưu tiên thấp nhất |
| `src/behavior/so-nao.ts` | **C0** — sổ "có mấy client MCP đang nối" (bridge ghi vào, `stage.describe` đọc ra) |
| `src/ui/o-chat.ts` | **B3** — ô chat dưới màn hình: Enter = `actor.say` lên nhân vật `owner`, y như `Space` |
| `skills/gen-stage-nao/SKILL.md` | **B3** — skill cho agy CLI: vòng `stage_events` → `stage_describe` → 1–3 lệnh → `actor_say` |
| `scripts/nao-agy.mjs` | **DRIVER NÃO** — vòng lặp nằm ở đây, không ở agy: nghe `user.text` qua ws, phản xạ ≤300 ms, gộp câu 800 ms, hàng đợi 1 lượt, bơm một dòng vào agy đang ấm trong tmux |
| `scripts/nao-local.mjs` | **V1 — DRIVER NÃO LOCAL** (Ollama): cùng khung `nao-agy.mjs` (import, không chép), 10 tool danh sách trắng sinh bằng `toolTuLenh`, mọi tool_call qua `lyDoCamNao`; persona `scripts/nao-local/<actor>.md` (ghi đè bằng `.cache/nao-local/<actor>.md`) |
| `vscode/src/thuan/giac-quan.ts` | **V3 — GIÁC QUAN IDE** (thuần): lưu file (gộp 5 s) / lỗi biên dịch 0⇄>0 (debounce 3 s) / task-test exit code / git commit → `stage.notice`; lọc đường dẫn, setting, workspace trust |
| `scripts/tai-nghe.mjs` | **V2 — TAI NGHE** (thu giọng NGOÀI trình duyệt): ffmpeg → PCM qua pipe → RMS/VAD (`timDaiNoi` của `src/audio/vad.ts`) → `POST /stt` → `stage.hear` qua ws (vai client). Bán song công CNS-004. CLI là hợp đồng với extension `vscode/` |
| `scripts/nao-demo.mjs` | **B3** — não mẫu rule-based (không LLM) chạy qua MCP stdio thật, làm bằng chứng vòng kín khi không có agy |
| `bridge/tts.ts` | **B2** — giọng tiếng Việt: `GET /tts` (cổng 8788) gọi thẳng WebSocket Edge, trả mp3, cache `.cache/tts/<sha1>.mp3` |
| `src/audio/tts-client.ts` | **B2** — tải + giải mã mp3, đo `durationMs` thật, phát bằng Web Audio, đẩy biên độ RMS mỗi 50 ms sang nhân vật |
| `src/audio/so-tieng.ts` | **B2** — sổ nối sân khấu ↔ lớp tiếng (không phụ thuộc gì): sổ miệng, thời lượng thật, cờ chặn Web Speech |
| `src/audio/nut-tieng.ts` | **B2** — nút "🔊 Bật tiếng" mở khoá autoplay, nhớ bằng `localStorage` |
| `bridge/stt.ts` | **C1** — nhận dạng giọng Việt: `POST /stt` (cổng 8790) → ffmpeg 16 kHz mono → thợ python (PhoWhisper-small ct2 int8) → `{ text, confidence, durationMs, goiGen }`, cache `.cache/stt/cache/<sha1>.json` |
| `bridge/stt-worker.py` | **C1** — thợ nhận dạng chạy mãi: nạp model + hâm máy một lần lúc bật bridge, mỗi dòng stdin là một wav |
| `src/audio/so-tu.ts` | **C1** — SỔ TỪ NHÀ: sửa tên riêng (`Gen`, `connector`, `Baserow`, `module`, `Kho Ryan`) sau nhận dạng. Hạ WER 47 % → 5 %; khớp mờ cho tên dài, đồng âm khai tay cho tên ngắn |
| `src/audio/mic.ts` | **C1** — giữ phím **V** (hoặc giữ nút 🎤) để nói: `MediaRecorder` + đo RMS → `POST /stt` → chữ vào ô chat 1,5 s cho Boss sửa |
| `src/audio/vad.ts` | **C1** — cắt im lặng đầu/cuối theo RMS (ngưỡng tương đối theo đỉnh, chừa 120 ms mỗi đầu). Không phụ thuộc DOM |
| `src/audio/so-giong.ts` | **C1** — sổ nối mic ↔ `commands/actor.ts`: phiếu dùng một lần để `actor.say` biết câu này Boss NÓI chứ không gõ |
| `scripts/do-stt.mjs` | **C1** — bàn đo: sinh 20 wav bằng TTS của bridge, chấm WER/độ trễ từng engine (`docs/c1/so-sanh.md`) |
| `src/api/__tests__/` | `san-khau-gia.ts` (sân khấu giả, không WebGL) + test dispatcher/describe/script/A3 |

### Thêm một lệnh mới

1. Viết `CommandSpec` trong đúng file `src/api/commands/<nhóm>.ts` (có `desc`,
   `params`, `example`; khai `chiemActor: 'actor'` nếu lệnh có thời lượng; khai
   `events: [...]` cho mọi sự kiện lệnh bắn ra — `stage.bootstrap` gom từ đây).
2. Nếu cần động tới cảnh: thêm phương thức vào `StageWorld` (`src/api/types.ts`),
   thi công ở `src/stage/world.ts`, và thêm bản giả ở `san-khau-gia.ts`.
3. Hết. `stage.bootstrap`, bảng lệnh UI, ô kịch bản dạng ngắn và bridge tự biết.

## Phạm vi đã làm / chưa làm

- **A1 (xong)**: dispatcher, `stage.*`, `actor.*` (trừ `emote`/`idleStyle`),
  `prop.*`, `scene.light`, `camera.*`, `script.*`, bảng lệnh tự sinh, nhật ký,
  bridge WebSocket. `actor.say` = bong bóng + nhép miệng giả + Web Speech nếu có.
- **A2 (xong, vòng 2)**: `actor.emote` (15 emote, `src/behavior/emotes.ts`) +
  `actor.idleStyle` (4 kiểu, `src/behavior/idle-styles.ts`) thi công thật —
  không còn là stub. Lớp hành vi nhỏ luôn chạy khi idle (thở, đổi chân, nhìn
  quanh) + khi nói (gật/nghiêng đầu, cử chỉ nhịp tay) trong `NhanVat.capNhat`.
  `actor.say` có `emotion` → mặt + **4 nhóm cử chỉ** theo cảm xúc (giữ nguyên
  hành vi A1 khi không truyền `emotion`). Nhân vật chibi bằng bone scale (không
  đổi model mặc định, không tìm được VRM chibi CC0 nguồn rõ — xem `TY_LE_CHIBI`
  trong `nhanvat.ts`), tỉ lệ đầu/người ~1/2,9. **Chuyển động nền là clip CC0
  THẬT đã retarget** (`src/behavior/chuyen-dong.ts`), cử chỉ bộ CC0 không có
  thì bù bằng lớp thủ tục (`src/behavior/cu-chi.ts`) — xem "Quyết định A2 vòng
  2" bên dưới.
- **A3 (xong)**: cảnh lab viễn tưởng (`phong.ts`, Kenney Space Kit CC0 hoặc
  fallback emissive), `UnrealBloomPass` nửa độ phân giải + tự tắt khi FPS thấp,
  `screen.*` (hologram, CanvasTexture, stream theo `chunks` hoặc `source:"agent"`
  qua `window.stage.feed`), `module.build` (kết tinh hạt `src/fx/hat-ket-tinh.ts`
  + tự `actor.hold` qua dispatcher) + `module.open`/`module.store`, `fx.play`
  (`src/fx/hieu-ung.ts`), `camera.preset` thêm `ban-dieu-khien`.
- **Lab vòng 2 — rộng/sáng/gọn + phím (xong, #11 #14)**: phòng **16 × 16 m**,
  trần 5,6 m, `buc-trung-tam` về đúng gốc toạ độ, camera `toan-canh` lùi ra,
  bỏ bàn gỗ + ghế văn phòng cũ (place `ban-*`/`ghe-*` giữ nguyên làm mốc test),
  Kenney chuẩn hoá theo mét, và **điều khiển bằng phím** (`src/ui/phim.ts`:
  WASD/1–0/Space/C/E/R/?) — mọi phím đi qua `dispatcher.run`.

- **B1 (xong, #18)**: `src/stage/bo-cuc.ts` (bảng bố cục 3 vùng theo lưới 1 m,
  hành lang 3,2 m, dãy tủ sát tường sau), **`actor.steer`** (lái bằng vận tốc,
  KHÔNG xếp hàng, kẹp 1,6 m/s, lerp 0,15 s, trượt dọc bàn/kệ), phím WASD gửi
  steer mỗi 100 ms qua dispatcher, camera preset **`theo-owner`**, hai nhân vật
  mặc định **`owner` (VRM nam CC0) + `gen`** (nữ, `idleStyle: cham-chu` ở bàn
  điều khiển), `stage.describe` thêm **`controlledBy`**, và chibi hoá xương raw
  (Issue #17 — tỉ lệ đầu/người đo thật ~1/2,5–1/2,8).

- **B3 (xong, #21)**: `bridge/mcp.ts` — **số tool = số lệnh + 1** (đếm từ registry 26/10: 44 lệnh → 45 tool sau V3 `stage.notice`; test b3-mcp giữ công thức, đừng viết cứng số),
  sinh thẳng từ registry nên thêm lệnh là có tool mới; `stage_bootstrap` qua MCP
  trả thêm `huongDanAgent` (vai diễn của Gen); `actor.say` lên nhân vật
  `controlledBy: "owner"` bắn **`user.text`** → vòng hội thoại Owner ⇄ Gen;
  **ô chat** dưới màn hình (`src/ui/o-chat.ts`); `docs/BOOTSTRAP-AGENT.md` +
  `skills/gen-stage-nao/SKILL.md` cho agy; `scripts/nao-demo.mjs` (não mẫu
  không LLM). Đã chạy thật **cả hai não**: agy CLI (8 tool call MCP, log
  `docs/b3/agy-tool-calls.json`) và nao-demo (16 tool call,
  `docs/b3/nao-demo-log.json`).

- **C0 (xong, #28)**: `src/behavior/phan-xa.ts` — Sếp gõ là Gen **quay lại + đáp
  trong ≤ 300 ms**, không chờ não; câu đệm ở mốc 1,5 s, bị cắt khi não nói;
  Owner vào 2,5 m thì nhìn theo, > 4 s thì chào nhẹ một lần; não không nối thì
  trả lời bằng **não rule-based tối thiểu trong app**. Thêm emote `chu-y`
  (tổng 16), lệnh **`actor.faceTo`** (quay người không chiếm thân), tham số
  **`actor.say { to }`** (nói với ai; mặc định `camera` = Sếp đang xem), và
  `stage.describe` thêm **`brainConnected`**, **`facingTarget`**, **`camera`**.
  Nhân vật nam đổi sang **VRoid HairSample_Male (CC0)** — nam, anime, cùng gu
  với Gen; tên hiện là **Javis** (avatar của Sếp trong phòng).

`src/api/commands/stubs.ts` giờ **rỗng**: cả A2 lẫn A3 đã thi công thật, không
còn lệnh nào trả `ok:false` kiểu "chưa làm". File được giữ lại làm chỗ khai
lệnh mới cho các đợt sau — `stage.bootstrap` vẫn liệt kê đủ bộ v0.1.

## Quyết định A2 vòng 2 (25/10 — sau review PR #10)

- **Chuyển động là clip THẬT.** Bộ CC0 Quaternius "Universal Animation Library"
  (mirror `J-Ponzo/gltf-universal-animation-library`) tải về `public/anim/`
  bằng `scripts/fetch-anim.sh`, retarget sang `vrm.humanoid` normalized trong
  `src/behavior/chuyen-dong.ts` (dùng clip `A_TPose` làm tư thế gốc), phát bằng
  `THREE.AnimationMixer`, **crossfade 0,25 s**. Thiếu file thì app tự rơi về
  chuyển động thủ tục, không lỗi. Clip spec bộ CC0 không có (wave, clap, nod,
  shake, think, point, sleep, type và các cử chỉ emote) = **clip gần nhất làm
  nền + lớp cử chỉ thủ tục**, bảng ghép trong `NEN_CLIP` / `NEN_EMOTE`.
- **Hông không tự quay.** Khi bake, phần xoay quanh trục đứng của `hips` bị bỏ:
  hướng mặt là việc của `actor.turnTo`, nếu để clip quay thì `facing` trong
  `stage.describe` nói dối.
- **`done` vẫn resolve khi bị huỷ** (dispatcher lõi A1 cần thế để giải phóng
  hàng đợi), nhưng `Action` có thêm `cancelled()`. Nơi nào dọn dẹp sau hành
  động phải kiểm cờ này: emote bị cắt KHÔNG tắt giọng của emote mới, KHÔNG ghi
  `mood`, và bắn `actor.emoteCancelled` thay cho `actor.emoteDone`.
- **`actor.stop` dọn cả cảm xúc**: biểu cảm về `neutral`, `mood` về
  `binh-thuong` ngay trong `NhanVat.dung()`.
- **Emote/clip kết thúc bằng hẹn giờ huỷ được**, không bằng điều kiện trong
  `capNhat` — `durationMs` đúng kể cả khi tụt khung hình (đo thật: hứa 2600 ms,
  thật 2601 ms trên renderer phần mềm ~3 fps).
- **`actor.say` + `emotion` có 4 nhóm cử chỉ khác nhau** (vui / buồn / giận /
  ngạc nhiên + mặc định) trong `cuChiNoi`, và nhìn về người nghe (camera).
- **Góc máy `truoc-mat`** (thêm vào `PRESET_MAY`): chính diện, thấy trọn người
  — bắt buộc cho ảnh bằng chứng emote.
- **Chibi**: tỉ lệ đầu/người ~**1/2,9** (đo thật trong `nhat-ky-kiem-a2.json`),
  toàn bộ bằng `setScalar` (scale đều, không hệ số âm) nên da/tóc không răng cưa.

## Quyết định A2 (bổ sung, không sửa mục trên)

- **`busy` còn `true` đúng MỘT nhịp (một microtask) tại thời điểm sự kiện
  `actor.arrived`/`actor.clipDone`/`actor.emoteDone`… bắn ra** — đã kiểm bằng
  Playwright thật (`stage.describe()` gọi ngay trong handler của sự kiện vẫn
  thấy `busy: true`, dù `state` đã là `idle`). Nguyên nhân: `dispatcher.ts`
  (lõi A1, A2 không được sửa) gắn `.then()` giải phóng hàng đợi SAU `.then()`
  bắn sự kiện trong `commands/actor.ts` — cùng một Promise `done`, nhưng hai
  `.then()` chạy theo đúng thứ tự gắn vào, không cùng nhịp. **Quyết định: giữ
  nguyên, không sửa dispatcher.** Agent/script cần biết "thân đã rảnh chưa"
  ngay trong handler sự kiện thì đọc `state` (đã đúng ngay lúc đó), không đọc
  `busy`; muốn `busy` đúng thì đợi thêm một `await Promise.resolve()` hoặc gọi
  `stage.describe()` ở lượt sau.
- **Nhân vật chibi**: không tìm được VRM chibi CC0 nguồn rõ ràng kịp A2 (đã
  tra `toxsam/open-source-avatars`, `MJMoonbow/VRMavatars`, `madjin/vrm-samples`
  — không có model gắn nhãn chibi/giấy phép rõ). Theo đúng phương án dự phòng
  trong spec: chibi hoá bằng bone scale (`TY_LE_CHIBI` trong `nhanvat.ts`),
  áp cho MỌI model nạp (kể cả `AvatarSample_B.vrm` mặc định) — Boss thay bằng
  VRM chibi thật lúc nào cũng được, code tự nhân hệ số lên bộ xương có sẵn.

## Quyết định B2 — giọng tiếng Việt (25/10, Issue #20)

- **Không dùng thư viện edge-tts nào.** `@andresaya/edge-tts` là
  **GPL-3.0-only**, `edge-tts-universal` là **AGPL-3.0** — copyleft, nối vào
  bridge là kéo cả Gen-Stage theo giấy phép đó. Giao thức Edge chỉ gồm một URL
  có `Sec-MS-GEC` (SHA-256 của mốc thời gian Windows làm tròn 5 phút + token
  công khai), một khung `speech.config`, một khung SSML, rồi các khung nhị phân
  `Path:audio` tới `turn.end` — tự viết trong `bridge/tts.ts` bằng `ws` +
  `node:crypto` **có sẵn**, không thêm phụ thuộc, không khoá API.
  Cạm bẫy đã đo: thiếu header `Cookie: MUID=…` hoặc `Accept-Encoding` thì dịch
  vụ trả **HTTP 200 thay vì 101** ("Unexpected server response: 200").
- **`durationMs` là thời lượng audio THẬT.** `actor.say` tải + giải mã mp3
  **trước** khi nhân vật mở miệng, rồi báo số đo vào `src/audio/so-tieng.ts`;
  `uocThoiLuongNoi` đọc số đó thay cho công thức đếm ký tự. Nhờ vậy bong bóng
  chữ, hẹn giờ hành động và `durationMs` trả cho agent **cùng một con số**
  (đo thật: 5616 ms audio vs 5446 ms nếu đếm chữ).
- **Biên độ tính sẵn từ `AudioBuffer`, không đọc `AnalyserNode`.** Envelope RMS
  mỗi 50 ms lấy thẳng từ mẫu PCM đã giải mã rồi phát theo đồng hồ, nên nhép
  miệng vẫn đúng trên máy **không có thiết bị âm thanh** (Playwright headless,
  `--mute-audio`) — bằng chứng B2 đo được 30/30 mẫu RMS > 0, đỉnh 0,89.
- **Nhép miệng cũ không bị thay, chỉ bị nhường chỗ.** `nhepMiengTheoBienDo(rms)`
  đặt biên độ kèm **hạn dùng 0,25 s**; hết mẫu là `capNhat` tự quay về đúng hai
  nhánh A1/A2 (nhép theo độ dài chữ). `aa` theo RMS, thêm `ih`/`ou` xen kẽ nhẹ
  — giọng Việt nhiều nguyên âm, chỉ há `aa` thì nhìn như cá đớp.
- **Giọng theo actor, không theo lệnh gọi**: `owner` → **nam**
  (`vi-VN-NamMinhNeural`), còn lại → **nữ** (`vi-VN-HoaiMyNeural`).
  `actor.say` nhận `voice: "nu" | "nam" | <tên giọng>` và **trả về giọng đã
  chọn** trong `result.voice`, để agent đọc log biết câu đó phát bằng giọng nào.
- **Bridge tắt không phải lỗi.** `chuanBi` trả `null`, hạ cờ chặn Web Speech →
  `NhanVat.noi` chạy đúng như A1 (Web Speech `vi-VN`, không có giọng Việt thì
  nhép theo độ dài chữ). Toast nhắc `pnpm bridge` hiện **một lần mỗi phiên**,
  và không gọi lại bridge cho tới khi tải lại trang.
- **Autoplay**: Chrome chặn tiếng tới khi có cú bấm thật. Nút "🔊 Bật tiếng"
  góc trên (`src/audio/nut-tieng.ts`) `resume()` AudioContext trong chính
  handler của cú bấm, rồi nhớ vào `localStorage` — phiên sau không hiện nút
  nữa, chỉ cần cú tương tác đầu tiên bất kỳ là tự mở khoá. Script bằng chứng
  gọi `window.stage.batTieng()` + cờ `--autoplay-policy=no-user-gesture-required`.

## Quyết định B3 — não cho Gen qua MCP (25/10, Issue #21)

- **MCP là ảnh chiếu của registry, không phải bộ lệnh thứ hai.** Tool sinh
  bằng vòng lặp trên `registry.all()`; chỉ `stage_events` khai tay vì nó không
  phải lệnh sân khấu mà là cửa để não *nghe*. Test giữ bất biến
  **số tool = số lệnh + 1** — thêm lệnh mà quên gì đó là test đỏ ngay.
- **MCP không có đường riêng vào dispatcher.** Cả stdio lẫn HTTP đều nối vào
  bridge bằng **vai client ws**, kể cả bản HTTP chạy *trong chính tiến trình
  bridge*. Chậm hơn vài mili giây, đổi lại không bao giờ lệch hành vi với
  đường ws mà Boss vẫn dùng (hàng đợi, timeout, token y hệt).
- **`user.text` có đúng một nguồn**: `actor.say` lên nhân vật `controlledBy:
  "owner"`. Space, ô chat và bảng lệnh đều chảy qua đó, nên không cửa nào phải
  tự nhớ bắn sự kiện, và não chỉ nghe một cái tên.
- **Tham số `vec3`/`target`/`json` khai là chuỗi trong JSON Schema.**
  `validate.ts` đọc được cả mảng, object lẫn `"x, y, z"`, nhưng khai nhiều kiểu
  thì client MCP khó tính (và não) phải đoán; một kiểu + mô tả rõ là xong.
- **Module rơi vào tay người LÀM**, không phải tay Boss: `module.build` chọn
  actor `controlledBy: "agent"` đầu tiên. A3 lấy `actorIds()[0]`, mà từ B1
  nhân vật đầu tiên là `owner`.
- **Cạm bẫy đã đo: client MCP stdio KHÔNG truyền biến môi trường tuỳ ý.**
  `StdioClientTransport` chỉ cho con thừa hưởng một danh sách an toàn, nên
  `GEN_STAGE_PORT` bị rơi và `bridge/mcp.ts` lặng lẽ nối về 8787 — não nghe mãi
  không thấy câu nào mà không báo lỗi gì. Phải truyền `env` tay (xem
  `scripts/nao-demo.mjs`), và khi `agy mcp add` bản stdio với cổng khác mặc
  định thì phải khai `--env`.
- **agy giữ cấu hình MCP ở `~/.gemini/config/mcp_config.json`** (khoá
  `serverUrl` cho bản http), thêm bằng `agy mcp add gen-stage http://127.0.0.1:8789/mcp`.
- **Bằng chứng chạy trên bộ cổng riêng 8797/8798/8799** vì máy Boss thường đã
  có `pnpm bridge` thật ở 8787 — script bằng chứng không được dùng chung lẫn
  giết bridge đó.

## Quyết định DRIVER NÃO — agy tự lắng nghe sự kiện (26/10, Refs #21)

- **Vòng lặp nằm ở driver, không ở agy.** Bản cũ bật
  `agy --prompt-interactive "$(cat SKILL.md)"` trong tmux rồi bỏ đó: agy chào
  một lượt rồi về dấu nhắc `>` **chờ người gõ trong terminal**, nó không tự lặp
  `stage_events`. Sếp gõ trong Firefox thì không ai nghe → "nó chưa trả lời".
  `scripts/nao-agy.mjs` đảo vai: driver là cái vòng lặp (client ws của bridge),
  agy chỉ là cái não được gọi một lượt mỗi câu.
- **Giữ agy ẤM trong tmux, không gọi `agy -p` mỗi câu.** Đo thật trên máy Boss,
  Gemini 3.8 Flash low:

  | Phương án | Khởi động | Một lượt (prompt rỗng) | Một lượt thật (2–3 tool MCP) |
  | --- | --- | --- | --- |
  | A. `agy -p` mỗi câu | 8–12 s **mỗi lần** | 8,1 / 10,9 / 11,8 s | 15–25 s |
  | B. tmux ấm + `send-keys` | một lần | 3,4 / 3,6 / 5,2 s | **5,5 / 5,6 s** |

  Đo trọn vòng "Sếp gõ → Gen bắt đầu nói" (`docs/nao/nhat-ky-kiem-nao.json`):
  phản xạ **71–99 ms**, câu trả lời đầu **5554 / 5566 ms**, lượt thứ ba xếp
  hàng sau lượt hai nên 19,6 s — đúng như thiết kế hàng đợi một-lượt.

  `agy -p` phải nối lại cả 3 server MCP mỗi lần chạy — đó là phần 8–12 s đó.
  Mặc định là B; A giữ làm dự phòng (`GEN_STAGE_NAO_CHE_DO=print`).
- **Phản xạ tách khỏi suy nghĩ.** Driver bắn `actor.turnTo owner` +
  `actor.emote suy-nghi` ngay từ **sự kiện thô**, trước cả cửa sổ gộp 800 ms —
  đo được **71–87 ms**. Sếp thấy Gen quay sang và nghĩ ngay, trong lúc não còn
  đang chạy 6 s nữa.
- **`actor_say` TRƯỚC, diễn SAU.** Nhắc đầu phiên dặn gọi `actor_say` đầu tiên
  rồi mới `screen_*`/`module_*`; nhờ vậy "câu trả lời đầu" là 6,2–6,9 s thay vì
  phải chờ hết 3 lệnh diễn.
- **Nhắc phải ngắn.** SKILL.md rút gọn ≤40 dòng (bỏ frontmatter, bỏ mục "Vòng
  lặp" — driver lo việc đó, bỏ khối code), và `stage_describe` rút còn
  gen + owner + screens + modules + **5 sự kiện cuối**, không mang theo bảng
  khoảng cách tới mọi place.
- **Mốc "Sếp nghe được tiếng" là sự kiện mới `actor.sayStart`** (bắn đúng lúc
  bong bóng chữ hiện ra, sau khi tải tiếng). `actor.sayDone` chỉ nói "đã nói
  xong" nên không đo được độ trễ. Driver dùng mốc này để tắt hẹn "xin Sếp chờ"
  và để biết não có mở miệng hay không.
- **Câu đã có lớp hiểu lệnh xử lý thì não KHÔNG nghĩ lại** (đồng bộ C2, PR #33):
  driver bỏ qua `user.text`/`user.speech` mang `handled: true`, và không nghe
  `user.command`. "Javis, đi tới bàn điều khiển" → lớp lệnh lo, tốn 0 token;
  "Gen, hôm nay làm gì" → không lệnh nào khớp, đến lượt agy. Driver nghe
  `user.speech` (C1 — nói bằng miệng) y hệt `user.text`.
- **Người nhận câu nói (CNS-001, Ryan chốt 26/10)**: tên gọi trong câu thắng;
  câu không gọi tên thì người nhận là nhân vật đích `to` trong dữ liệu
  `user.text`/`user.speech` (chatroom gửi `actor.say` owner kèm `to`); `to`
  vắng, = `"camera"` hoặc không phải actor thì giữ cũ (Gen). Cài ở
  `phanTich(text, bc, to)`; `to` đọc từ `d.to` trong `nghe()`. Chọn Javis mà
  nói câu không khớp lệnh → Javis trả "chưa hiểu" (cơ chế C2). Test:
  `cns001-nguoi-nhan.test.ts`.
- **Bridge thay/ngắt sân khấu (CNS-002)**: tab cũ bị đóng bằng mã `4001`; lệnh
  đang chờ của sân khấu đó trả lỗi NGAY (không treo `HAN_MS`); `bridge.stageOffline`
  chỉ phát khi không còn sân khấu nào. Kiểm: `node scripts/kiem-bridge-thay-san-khau.mjs`
  (cổng 8797–8800).
- **Ba cái chặn vòng lặp**: (1) bỏ `user.text` của `gen`; (2) hàng đợi tối đa
  **một** lượt agy cùng lúc; (3) gộp câu 800 ms. Thiếu cái nào cũng ra hai bong
  bóng chen nhau và hai lần tốn quota.
- **Gộp câu 800 ms ít khi bắn trong thực tế, và đó là đúng.** `actor.say`
  **chiếm** actor, nên câu thứ hai của Sếp nằm chờ owner nói xong (2–3 s) rồi
  `user.text` mới bắn — quá cửa sổ gộp. Nó chỉ bắn khi hai câu tới thật sát:
  Sếp gõ tiếp khi mình còn đang nói (`interrupt: true`), hoặc `user.speech` đẩy
  liền mấy mẩu. Giữ cửa sổ gộp vì nó là cái lưới, không phải cái cổng.
- **agy chạy trong thư mục RỖNG (`.cache/nao-agy`), kèm `AGENTS.md` vai diễn.**
  Cạm bẫy đã đo: mở agy ngay trong repo thì nó đọc `CLAUDE.md` rồi tự đi chạy
  `tsc`, `ls`, `cat package.json`; mở trong thư mục trắng thì plugin toàn cục
  `pro-agent-harness` của Boss bắt nó `git init` + dựng `docs/ssot/`. Một
  `AGENTS.md`/`GEMINI.md` ngay tại chỗ là chỉ dẫn gần nhất nên nó thắng; phần
  bootstrap của plugin vẫn chạy **một lần** lúc ấm, không chen vào từng lượt.
- **Bận/rảnh đọc bằng `tmux capture-pane`**: khung agy để dòng `esc to cancel`
  ở cuối khi còn nghĩ. Bơm chữ bằng `send-keys -l` (literal) rồi `Enter` riêng,
  và **mỗi lượt phải là MỘT dòng** — gặp `\n` là tmux bấm Enter giữa câu.
- **`localhost` → `127.0.0.1` trong `src/bridge-client.ts`.** Chrome thử `::1`
  trước, mà bridge chỉ nghe `127.0.0.1`, nên mỗi lần nối ném một
  `ERR_CONNECTION_REFUSED` ra console rồi mới nối lại bằng IPv4 — console đầy
  lỗi giả dù vẫn nối được.
- **Bằng chứng tự dọn**: `scripts/kiem-nao.mjs` thêm MCP tạm `gen-stage-thu`
  (trỏ 8799) vào cấu hình agy và **xoá ở cuối**, dùng session tmux riêng
  `gen-stage-nao-thu`, và giải phóng đúng 3 cổng 8797–8799 của mình trước khi
  bật — không bao giờ chạm 8787–8789 lẫn `gen-stage`/`gen-stage-nao` của Boss.
## Quyết định C0 — phản xạ xã hội + nhân vật nam anime (26/10, Issue #28)

- **Sếp KHÔNG phải nhân vật trong phòng.** Với Gen, Sếp là người xem qua màn
  hình, tức là **máy quay**; người Boss lái bằng WASD là **Javis** (avatar).
  Lẫn hai cái này là Gen quay lưng vào khán giả để nói với một avatar đứng im.
  `actor.say` mặc định `to: "camera"`, `stage.describe` trả `camera.pos` +
  `facingTarget` để não biết đường mà quay.
- **Phản xạ là tuỷ sống, không phải não.** Chạy trong trình duyệt, không chờ
  MCP; mọi lệnh vẫn qua dispatcher với nguồn `phan-xa` (nhật ký phân biệt
  được). **Ưu tiên thấp nhất**: chỉ ra lệnh chiếm thân khi Gen rảnh.
- **Cắt câu đệm KHÔNG dùng `actor.stop` / `interrupt: true`.** Hai cửa đó gọi
  `catNgang`, mà `catNgang` **xoá sạch hàng đợi** → giết luôn câu của não vừa
  xếp hàng sau câu đệm. Phản xạ gọi thẳng `world.actorInterrupt(gen)`: huỷ
  đúng hành động đang chạy, dispatcher thấy `done` thì tự xả hàng đợi.
- **`actor.turnTo` vô dụng khi đang nói** (chiếm thân → xếp hàng chạy sau khi
  nói xong, đúng lúc hết cần). Vì thế có **`actor.faceTo`**: quay người không
  chiếm thân, gọi được mỗi nhịp để giữ mặt về người nghe kể cả khi Boss đổi
  `camera.preset` giữa câu.
- **`xoayVe` không được khởi động lại khi mục tiêu chưa đổi.** `faceTo` gọi mỗi
  nhịp mà lần nào cũng huỷ cú quay cũ thì đường nội suy ease-in-out cứ về mốc 0
  — nhân vật nhích vài độ rồi đứng im (rõ nhất trên máy kiểm ~1 fps). Nay chỉ
  quay lại khi mục tiêu lệch > 0,12 rad so với cú quay đang chạy.
- **Gốc nhân vật là một `Group` BỌC NGOÀI `vrm.scene`, không phải chính nó.**
  Model VRM 0.x cần `VRMUtils.rotateVRM0` (đặt `vrm.scene.rotation.y = π`),
  nhưng cả sân khấu lại ghi `goc.rotation.y` để quay người → cú ghi đầu tiên
  xoá sạch 180° đó và nhân vật **đi lùi suốt đời** (đúng cái Boss thấy). Tách
  hai việc ra hai node: Group giữ *hướng đi*, `vrm.scene` giữ *bù trừ VRM0*.
- **Delta chuyển động phải liên hợp 180° cho model VRM 0.x.** Bộ xương
  normalized của `@pixiv/three-vrm` lấy trục theo hệ của chính file: VRM 1.0
  nhìn +Z, VRM 0.x nhìn −Z. Đắp thẳng delta (đo trên bộ Quaternius, hệ +Z) lên
  model VRM0 thì cánh tay nhận đúng góc nhưng **ngược dấu z** → hai tay giơ
  thẳng lên trời và ở nguyên đó sau cú đi đầu tiên (đo thật: bàn tay y = 1,85 m
  trong khi vai y = 1,42 m). `rotateVRM0` KHÔNG sửa chỗ này — nó chỉ xoay
  `vrm.scene`. Liên hợp Ry(180°) = đổi dấu x và z của quaternion, làm ngay lúc
  bake trong `chuyen-dong.ts`. Có bước kiểm số trong `kiem-c0.mjs`.
- **`brainConnected` đếm hai nguồn khác nhau**: tiến trình MCP **stdio** tự
  xưng `?role=nao` khi nối ws (đếm được chính xác), còn bản MCP **HTTP** chạy
  trong chính bridge thì tính theo *yêu cầu MCP gần nhất* trong 60 s — nó luôn
  giữ sẵn một kết nối ws dù chưa não nào gọi, đếm theo kết nối là nói dối.
  Bridge đẩy `bridge.brain` **xuống** sân khấu (chiều ngược với mọi sự kiện
  khác); không có bridge = `false`.
- **Nhân vật nam: VRoid `HairSample_Male`, CC0.** B1 từng loại `AvatarSample_A`
  vì mirror không có LICENSE — đúng, vì A/B/C **không phải CC0** (trang VRoid
  nói thẳng "The license to these sample models is not CC0"). `HairSample_Male`
  thì được VRoid liệt kê **đích danh** trong danh sách CC0, mà CC0 thì ai mirror
  cũng hợp lệ — nên mirror thiếu LICENSE không còn là vấn đề. Chi tiết +
  ứng viên đã loại: `assets/LICENSES.md` mục 1b.
- **Máy kiểm chạy ~1 fps (swiftshader)**, nên: đo độ trễ phản xạ bằng **nhật ký
  lệnh** chứ không bằng `facing` trên khung hình; và `actor.steer` 300 ms hết
  hạn trước cả khung hình kế tiếp — script bằng chứng phải dùng nhịp 2,5 s.
## Quyết định C1 — nhận dạng giọng Việt (26/10, Issue #31)

Số đo đầy đủ và lý do loại từng lựa chọn: **`docs/c1/so-sanh.md`**.

- **Nhận dạng ở bridge, không ở trình duyệt.** Boss dùng Firefox trên Fedora →
  không có Web Speech API. Máy không có CUDA dùng được → CPU.
- **Engine: PhoWhisper-small (VinAI) bản CTranslate2 int8** qua `faster-whisper`.
  Đo thật trên máy Boss: whisper.cpp `small` mất **14,6 s** một câu và
  `large-v3-turbo` mất **77,6 s** (loại vì trễ); Vosk nhanh 0,24 s nhưng sai
  **động từ lệnh** ("dừng lại" → "nhìn lại"); whisper gốc đa ngôn ngữ cùng cỡ
  kém PhoWhisper 3 lần về WER tiếng Việt.
- **Sai là do VỐN TỪ, không do âm học.** Mọi engine nghe đúng câu lệnh tiếng
  Việt thường nhưng **không engine nào** nghe ra `Gen`, `connector`, `Baserow`,
  `module`, `Kho Ryan`. Nâng cỡ model không chữa được (`large-v3-turbo` vẫn
  sai y thế, chỉ chậm hơn 24 lần), `initial_prompt` và `hotwords` làm **tệ
  hơn** (model sinh câu không có thật). Chỗ chữa là `src/audio/so-tu.ts` — sổ từ
  nhà, WER **47,4 % → 5,3 %**. Sổ chỉ chứa **tên riêng**: khai từ Việt thường
  vào là nó sửa bừa câu Boss nói đúng ("cất module" → "kết tinh module").
- **Thợ python chạy mãi + hâm máy.** Nạp model mất 3–6 s và 6 câu đầu mất
  10–24 s (ct2 mmap model 465 MB, nạp trang lười; VAD Silero nạp lười). Thợ
  đọc trước cả `model.bin` vào page cache rồi chạy 4 lượt hâm trước khi báo
  "sẵn sàng" — Boss không chịu khoản đó.
- **Chữ nhận được KHÔNG tự gửi ngay**: đổ vào ô chat 1,5 s để Boss sửa (Enter
  gửi ngay, Esc bỏ, gõ một ký tự là huỷ hẹn tự gửi). Tin cậy < 0,6 thì **không**
  tự gửi — thà Boss bấm thêm Enter hơn là Gen dựng sai connector.
- **Mic đi đúng cửa ô chat** (`oChat.gui`), không gọi thẳng dispatcher: Boss nói
  hay gõ đều ra một `actor.say` lên nhân vật `owner` → cùng `user.text`.
  `user.speech` thêm vào nhờ **phiếu dùng một lần** trong `src/audio/so-giong.ts`,
  nên không phải thêm tham số lạ vào `actor.say` mà mọi agent phải học.
- **`stage.hear` (CNS-005) — nguồn giọng NGOÀI trình duyệt** (extension VS Code,
  sidecar STT — qua ws bridge; MCP của não bị chặn, xem dưới): phiếu giọng chỉ đặt được trong trình duyệt nên
  các nguồn này không đánh dấu được "câu này là nói". `stage.hear {text, to?,
  confidence?, durationMs?}` đặt phiếu bằng đúng `datPhieuGiong` (`goiGen` tính
  bằng `chuanHoaCauNoi` của bridge, như đường mic) rồi **chạy `actor.say` lên
  owner qua dispatcher** — KHÔNG tự bắn `user.text`, để `user.text` vẫn có đúng
  một nguồn (spec 3.5) và `to`/dedup/`handled` của lớp hiểu lệnh chạy y hệt câu
  gõ. `actor.say` lỗi thì phiếu bị xoá, không rò sang câu gõ sau. Không có owner
  → `ok:false`. Test: `cns005-stage-hear.test.ts`.
  **Review sau CNS-005 (26/10):** (1) MCP KHÔNG được gọi `stage.hear` — `bridge/mcp.ts`
  có `LENH_CHI_CHO_BOSS`; chọn *vẫn liệt kê tool nhưng gọi bị từ chối* (giữ bất biến
  "số tool = số lệnh + 1", không phải sửa test/tài liệu đếm tool; lỗi nói rõ lý do) vì
  loại khỏi danh sách thì não không thấy lệnh trong `stage_bootstrap`/schema mà vẫn có thể
  đoán tên gọi; hàng rào thật nằm ở chỗ gọi. Nguồn ngoài (STT, extension) gọi qua ws.
  (2) `stage.hear` chạy `actor.say` với `interrupt: true` như ô chat. (3) `user.speech` mang
  `to` (= `to` của `user.text`); dedup 2 s của lớp hiểu lệnh khoá `to|text`, nên chọn Javis
  rồi Gen nói cùng câu thì cả hai chạy. (4) `boPhieuGiong(text?)` chỉ xoá phiếu đúng câu.
  (5) `actor.say` với `to === id` người nói ⇒ hướng mặt/dáng nghe về `camera`, NHƯNG `to` trong `user.text`/`user.speech` giữ nguyên (chọn Javis ở chatroom → `to:"owner"` → Javis nhận lệnh, INT-02). Câu lặp text→speech nhận lại đúng cờ `handled` của lần đầu, kể cả khi Javis tự đáp câu tự do (CNS-021). (6) `stage.hear` chuẩn hoá chữ bằng
  `chuanHoaCauNoi` cho cả text lẫn `goiGen`. (7) `so-tu.ts` dời sang `src/audio/` (dùng
  chung bridge + trình duyệt). (8) Bridge bật token: stage chỉ thay `sanKhau` SAU khi qua
  cửa token, `tuClient` chỉ chuyển lệnh khi `sanKhau` đã xác thực; lỗi lệnh chờ ghi
  "bị thay/ngắt — không rõ đã chạy hay chưa". Kiểm: `scripts/kiem-bridge-thay-san-khau.mjs`.
- **Cắt im lặng phải chừa lề.** Đo thật: cắt 200 ms đầu làm mất phụ âm đầu —
  "dừng lại" → "đừng lại", "mở màn hình" → "ở màn hình". VAD chừa 120 ms mỗi đầu.
- **Cạm bẫy Chrome**: `--use-file-for-fake-audio-capture` với đường có **khoảng
  trắng** làm Chrome tự tắt sau 4 s, không một dòng lỗi. Thư mục dự án của Boss
  có khoảng trắng, nên `scripts/kiem-c1.mjs` chép wav sang `/tmp` trước.

## Quyết định HEARTBEAT + RECONNECT + WATCHDOG (26/10, Issue #37)

Báo cáo E2E: "`scripts/nao-agy.mjs` rớt kết nối ws tới bridge âm thầm sau vài
phút → `brainConnected` về 0, Gen nói 'chưa có não', không có dòng log nào."

- **Nguyên nhân gốc KHÔNG phải ws rớt tầng mạng — là driver không hề tự xưng
  "não".** `noiSanKhau()` (bản trước #37) nối bridge **không có** `?role=nao`,
  nên `naoWs` (bộ đếm "não đang nối" trong `bridge/server.ts`) không bao giờ
  thấy nó. `brainConnected` khi đó chỉ sống nhờ MỘT nguồn khác: mỗi lần agy gọi
  một tool MCP qua HTTP, bridge đặt `naoHttpDen = now + 60000 ms`
  (`GEN_STAGE_BRAIN_TTL`). Driver chỉ gọi agy **một lượt mỗi câu Sếp nói**
  (không polling) — Sếp im hơn 60 giây (rất bình thường) là đồng hồ đó hết
  hạn, bridge tự bắn `bridge.brain {connected:false}` cho sân khấu, **không hề
  có sự kiện `close`/`error` nào** (ws của driver vẫn `OPEN` 100 %) → không một
  dòng log. Tái hiện sống bằng `scripts/kiem-mo-phong-loi-cu.mjs` (rút TTL
  xuống vài giây để "mô phỏng" vài phút im lặng, không cần chờ thật):
  `brainConnected` về `false` đúng lúc, `readyState` ws vẫn `1` suốt.
  **Sửa cốt lõi: driver nối `?role=nao`** — còn sống là còn được tính, không
  phụ thuộc agy có vừa gọi tool trong 60 s gần nhất hay không.
- **Cạm bẫy thứ hai, nặng hơn, lộ ra khi ĐO THẬT bằng chứng 10 phút:** hẹn giờ
  nối lại (`henNoiLai = setTimeout(noi, cho)`) bản đầu có `.unref()` (bắt
  chước bản cũ). Lúc driver **rảnh** (không lượt não nào đang chạy, `cheDo:
  print` không có tmux nào giữ event loop) và ws vừa chết, cái hẹn giờ unref
  đó là handle **DUY NHẤT** còn sống — unref nó thì Node thấy "chẳng còn gì để
  làm" và **tự thoát sạch** (code 0, không crash, không log). Không phải driver
  mất kết nối — **cả tiến trình biến mất**. Bỏ `.unref()` ở cả hẹn giờ nối lại
  lẫn nhịp tim; đo lại 10 phút: driver sống hết giờ, không thoát.
- **Heartbeat ứng dụng hai chiều, không phải ping/pong tầng WebSocket.** Trình
  duyệt không cho script gửi ping tầng giao thức, và tầng ứng dụng thì log
  được lý do. Mỗi 15 s (`GEN_STAGE_NAO_NHIP_TIM`) driver gửi `{ping}`, bridge
  trả `{pong}` ngay (`bridge/server.ts` xử lý trước cả khi đòi `cmd`, không ghi
  vào nhật ký `→`). Quá 35 s (`GEN_STAGE_NAO_QUA_HAN_TIM`, > 2 nhịp) không
  thấy pong nào → driver tự `terminate()` để `close` CHẮC CHẮN bắn, thay vì
  treo ở `readyState=OPEN` giả.
- **Backoff nối lại tăng dần 1 s → 10 s (`tinhBackoff`), không giới hạn số lần
  thử** — không còn hẹn cố định 1,5 s (dễ dội bridge lúc nó mới bật lại chưa
  kịp nghe cổng, đã đo thấy `ECONNREFUSED` ở lần thử đầu khi bridge mới restart
  dưới 1 giây). Bộ đếm lần thử **reset về 0 mỗi lần mở lại thành công** — một
  lần mất kế tiếp lại tính từ 1 s, không cộng dồn vô hạn.
- **Mỗi lần mất/nối lại đều ghi log kèm lý do** (mã đóng ws + lần thử thứ mấy +
  đợi bao lâu) ở cả hai đầu: driver (`MẤT KẾT NỐI bridge (mã … · …) — nối lại
  lần N sau … ms`) và bridge (`client ngắt… mã … · …`). Bản cũ không ghi gì ở
  cả hai phía — khớp đúng "không có dòng log nào" trong báo cáo.
- **Mất bridge rồi phục hồi → Gen báo ĐÚNG MỘT LẦN** ("Em vừa mất kết nối não,
  giờ đã nối lại ạ"), không lặp lại mỗi lần ping lỡ nhịp hay mỗi lần mở lại
  không thành công. Không làm "hàng đợi câu Sếp gõ lúc mất kết nối" (nhánh kia
  của đề bài): bridge không giữ buffer sự kiện cho một não đang offline, nên
  câu gõ đúng lúc driver mất kết nối vẫn mất — chấp nhận được vì bridge/sân
  khấu không hề rớt, chỉ driver rớt, và ô chat vẫn hiện câu đó cho Sếp thấy.
- **`goi()` hết khe nứt "rụng giữa `choMo()` và `ws.send()`"** (đã bị PR #34
  review chỉ ra): khoá biến `ws` vào một hằng cục bộ trước khi gửi, bọc
  `ws.send` trong try/catch — không còn ném `TypeError` làm rơi cả lượt não.
- **Watchdog tiến trình trong `scripts/chay.sh`**: một vòng `while true` nhẹ
  trong nohup bọc `node scripts/nao-agy.mjs` — driver crash là tự bật lại ngay
  (log `[watchdog HH:MM:SS] driver não thoát (mã …) — bật lại sau 2 s`).
  `pkill -f "scripts/nao-agy.mjs"` ở nhánh `tat` khớp CẢ dòng lệnh của vòng lặp
  lẫn tiến trình node con, nên tắt là tắt thật, không tự sống lại.
- **Cạm bẫy đo bằng chứng: `tsx` (cả qua `npx` lẫn gọi thẳng) tự sinh thêm MỘT
  tiến trình node con** (nạp `--require preflight.cjs --import loader.mjs`).
  `kill -9` đúng PID mà `spawn()` trả về chỉ giết cái vỏ — bridge thật (con)
  vẫn sống, giữ cổng (`EADDRINUSE` khi bật lại, ping vẫn được trả lời sau khi
  "giết" vì chẳng ai chết). `scripts/kiem-reconnect.mjs` dùng `detached: true`
  rồi giết bằng PID ÂM (`kill(-pid)`, cả process group) để giết thật.
## Quyết định D1 — căn nhà ấm, bỏ lab neon (26/10, Issue #43)

- **Scene + ánh sáng đổi, Actor API KHÔNG đổi.** `bo-cuc.ts` thay toàn bộ bảng
  3 vùng lab (`dieu-khien`/`kho`/`tuong-sau`, bục trung tâm, bàn cong ghép 5
  mảnh) bằng một **căn nhà 1 tầng 14 × 10 m** (`phong-khach`/`ban-lam-viec`/
  `bep` + hành lang trung tâm rộng `HANH_LANG = 2 m` nối cửa ↔ cửa sổ). Place
  id cũ giữ nguyên, chỉ đổi ý nghĩa: `buc-trung-tam` → thảm phòng khách,
  `ban-dieu-khien` → bàn làm việc, `ke-module` → kệ sách, `cua` → cửa ra vào,
  `ghe-1`/`ghe-2` → ghế ăn/ghế làm việc. Thêm `sofa`, `ban-an`, `bep`, `cua-so`.
- **Ánh sáng "nắng chiều" ĐÃ CÓ SẴN từ C3 (#40)** — directional ấm
  (0xffe0b0, ~giống 3200 K) + bóng mềm PCFSoft + bloom chọn lọc gần như không
  bật cho gì ngoài đèn sàn/đèn bàn đã tồn tại từ trước, D1 chỉ cần đổi hướng
  đèn (chiếu từ phía tường nam có cửa sổ), thu hẹp khung bóng (`shadow.camera`)
  theo kích thước nhà mới 14×10 (thay vì 16×16), và đổi màu hemisphere đất
  thành nâu ấm thay xanh-đen lạnh. Không viết lại hệ bloom.
- **Màn hình hologram → màn hình máy tính/TV ấm**: `man-hinh.ts` bỏ hẳn
  scan-line + viền phát sáng (`batSang()`), khung tối gỗ/nhựa đen, chữ
  trắng-kem. Kích cỡ tách theo loại (máy tính ~0,55 m, TV ~1,1 m) qua
  `MAC_DINH_MAN_HINH[...].size` — bản lab cũ dùng chung 2,2 m cho mọi hologram,
  với màn hình bàn làm việc thì to như một bức tường (ảnh thử D1 vòng 1).
- **`camera.preset` 4 góc nhà MỚI (`phong-khach`/`ban-lam-viec`/`bep`/
  `cua-so`) khai TAY toạ độ trong `world.ts`, không rơi vào `cameraFocus`
  chung.** `cameraFocus` cộng một offset chéo CỐ ĐỊNH vào mục tiêu — với mục
  tiêu nằm sát tường/cửa sổ (như `cua-so`) offset đó đẩy camera xuyên ra ngoài
  nhà. Toạ độ chọn tay, đứng trong nhà, nhìn đúng hướng nội thất khu đó.
- **Bài học bố cục nhà (khác lab — khoảng cách thật, không phải hộp lớn)**:
  đặt `standAt` của một place quá gần nội thất KHÔNG có `chan` (ghế) làm nhân
  vật đứng chồng lên mẫu ghế (ảnh thử D1 vòng 1: Gen đứng trên ghế làm việc).
  Phải cách tối thiểu 0,8 m. Tương tự chỗ đứng mặc định `buc-trung-tam` từng
  trùng mép hộp chắn của sofa — nhân vật "đứng xuyên" sofa.
- **Camera bay (`tamTuBay`, lerp `dt · 3,2`, `dt` kẹp ≤ 1/20 s) KHÔNG đủ thời
  gian "tới nơi" trên renderer phần mềm (~1 fps đo được)**: chờ 1,5–1,6 s chỉ
  đi được ~30 % quãng đường (đo thật trong `kiem-d1.mjs`), ảnh chụp bị kẹt
  giữa hai góc máy. Bằng chứng D1 gọi `camera.preset` (để `stage.describe()`
  đúng tên) RỒI `datMay(vt, tam)` — đúng toạ độ đã khai trong
  `world.ts cameraPreset()` — để đặt máy TỨC THÌ, cùng cách `kiem-c3.mjs` chụp
  cận mặt. Đây là vấn đề của renderer phần mềm lúc kiểm, không phải bug thật.
- **`fx.*`/`module.build` đổi màu qua đúng 2 hằng `MAU_CAM`/`MAU_CYAN` trong
  `phong.ts`** (giờ là cam/vàng ấm, không còn cam/cyan neon) — không phải sửa
  từng chỗ dùng màu trong `hat-ket-tinh.ts`/`world.ts`, chỉ `hieu-ung.ts`
  (`MAU_FX`) cần đổi riêng vì không import từ `phong.ts`.
- **Bảng lệnh mobile (390 px) phủ kín màn hình khi mở trang — hành vi CÓ TỪ
  TRƯỚC D1** (`#bang.thu-gon` + nút `›` đã có trong `style.css`/`panel.ts`,
  chỉ mặc định mở), không phải lỗi do đổi cảnh — ngoài phạm vi D1, ghi lại cho
  đợt sau nếu Boss muốn mặc định thu gọn trên màn hình hẹp.
- Bằng chứng: `scripts/kiem-d1.mjs` (CHẠY MỘT LẦN, cờ `docs/d1/.da-chay`) — 5
  ảnh preset 1440, 1 ảnh 390×844, cận mặt Javis/Gen dưới nắng, màn hình đang
  stream, module đang kết tinh, bảng luma (mặt p95 ≤ 230 — đo thật: Javis
  166,3, Gen 177,2), FPS tương đối (~1 fps, cùng tầm lab cũ trên swiftshader),
  console 0 lỗi.

- **Race `tatMot` (V1, đã sửa 26/10)**: `vscode/test/nao.test.mjs` ca "dongBoNao … đổi chế độ" từng đỏ ~2/5 lần —
  không phải tranh cổng mà là race thật ở `vscode/src/thuan/tien-trinh.ts` `tatMot`: chỉ đợi ĐẦU nhóm (pnpm/bash)
  chết, con `node` còn đang dọn thì `timDriverNaoNgoai` vẫn thấy ⇒ đổi chế độ não báo nhầm `cua-ngoai` (người dùng
  thật cũng gặp). Nay `tatMot` đợi cả nhóm chết qua `nhomConSong(pgid)` (quét `/proc`, bỏ zombie — không dùng
  `kill(-pgid,0)` vì zombie chưa thu hồi vẫn làm nó thành công). Đo lại: 8/8 lần `pnpm -C vscode test` xanh.
## Quyết định chay.sh — dò theo cổng, không mở hai sân khấu (26/10, CNS-002 e)

- **Dò dịch vụ theo CỔNG đang nghe, không theo `pgrep -f`**: bridge/vite do extension
  VS Code bật có dòng lệnh khác mẫu nên `pgrep` không thấy → bật trùng. `cong_dang_nghe`
  thử `ss -ltn` → `lsof` → `fuser` → `/dev/tcp`; `giai_phong_cong` thử `fuser -k` → `lsof` → `ss`.
  Bridge coi là "đã chạy" khi cả cổng ws + tts nghe (dùng lại); chỉ một nửa → giải phóng rồi bật lại.
  Cổng đọc từ `GEN_STAGE_PORT/_TTS_PORT/_MCP_PORT/_STT_PORT/_DEV_PORT`. (`pgrep` còn lại chỉ
  cho driver não — không có cổng; khoá driver lo chống trùng.)
- **Không mở Firefox khi đã có sân khấu**: `scripts/hoi-san-khau.mjs` nối ws vai client, đọc
  `bridge.hello.data.stageOnline` (mã thoát 0 có / 1 chưa / 2 không hỏi được → thà mở như cũ;
  token qua env). Chỉ hỏi khi bridge không phải vừa bật. Cờ `--khong-mo-trinh-duyet` bỏ hẳn bước mở.
  `GEN_STAGE_MO_TRINH_DUYET` thay lệnh mở (test dùng `echo`), `GEN_STAGE_KHONG_TAI_ASSET=1` bỏ tải asset.
- Watchdog + mã thoát 3 giữ nguyên. Đã kiểm bằng server giả cổng 8990–8994 (không bật Firefox
  thật); nhánh `tat` chưa chạy thử (có `pkill`).

## Quyết định V1 — não LLM local (26/10, INT-03 / INT-05)

- **LLM local = Ollama** (Ryan chốt), API OpenAI-compatible `POST /v1/chat/completions`
  với `tools`. "Local" chỉ áp cho não — TTS vẫn Edge. Driver nằm ở `scripts/`
  (`pnpm nao-local`), chạy được khi không có VS Code; extension chỉ khởi động nó.
  Chỉ chạy **một** driver não một lúc (`nao` hoặc `nao-local`) — **được ép bằng
  khoá driver** (xem dưới), không chỉ dặn miệng.
- **Khoá driver `.cache/nao-driver.lock`** (`scripts/khoa-nao.mjs`, dùng chung
  `nao-agy.mjs` + `nao-local.mjs`): hai driver cùng nghe thì mỗi câu trả lời hai
  lần. KHÔNG chặn ở bridge — tiến trình MCP stdio của agy cũng nối `?role=nao`,
  chặn ở đó là phá agy. Khoá tạo nguyên tử (`openSync` cờ `wx`), JSON
  `{pid, starttime, ten}` (starttime = field 22 `/proc/<pid>/stat`, để phân biệt
  pid bị hệ điều hành cấp lại). Khoá của tiến trình đã chết (pid mất hoặc
  starttime khác) hoặc file hỏng → chiếm lại. Driver mới gặp khoá của driver
  đang sống: log "đang có driver não X (pid N) — thoát" rồi thoát **mã 3**; thoát
  bình thường/SIGINT/SIGTERM thì tự dọn (`kill -9` để lại khoá mồ côi — lần sau
  tự chiếm). `scripts/chay.sh` watchdog đọc mã 3 → **dừng** vòng lặp, không bật
  lại vô hạn. Biến `GEN_STAGE_NAO_KHOA` đổi đường dẫn khoá (bằng chứng/test dùng).
- **Lọc câu trùng `taoLocTrung`** (`nao-agy.mjs`, dùng cả hai driver): câu nói
  bằng mic tới driver hai lần (`user.text` + `user.speech`) → khoá `to|text`
  trong 1,5 s, lần hai bị bỏ — không còn prompt "xin chào. xin chào". Đường agy
  nằm trong `gannNgheCau` (tách khỏi `chay()` để test được).
- **Cửa sổ gộp 800 ms của nao-local tách THEO NGƯỜI NHẬN** (mỗi người một
  `taoGop`): "Gen ơi…" + "Mai ơi…" sát nhau thành hai lượt, mỗi người đúng một
  lượt. Chọn cách này vì lấy người của câu đầu/cuối cho cả cụm luôn bỏ rơi hoặc
  nhét nhầm câu của một người. `daNoi` chỉ tính khi `actor_say` lên ĐÚNG người trả
  lời; log "BẮT ĐẦU NÓI" bỏ qua câu "xin chờ".
- **Dò Ollama có hạn**: `/v1/models` + `/api/show` có `AbortSignal.timeout(5 s)`
  (`msDo`); hẹn "xin chờ" + hạn lượt chạy TRƯỚC `doNao.lay()` nên bao cả bước dò;
  dò hỏng thì trả lỗi, lượt sau dò lại (không giữ promise treo). `arguments` của
  tool_call phải là object — `"null"`/mảng/số/chuỗi = JSON không hợp lệ (trả lỗi
  cho model như nhánh sẵn có).
- **Khung dùng lại, không chép**: `laCauCuaSep`, `taoGop` (800 ms), `taoHangDoi`
  (1 lượt), `phanXa` (nay nhận tham số `actor`, mặc định `gen`), `noiSanKhau`
  (`?role=nao` + heartbeat 15 s + backoff 1→10 s + log lý do, không `unref` — #37),
  `gonDescribe`, `dungDongNhac` đều import từ `nao-agy.mjs`.
- **Chạy bằng `tsx`, không `node`**: driver import thẳng `bridge/mcp.ts`
  (`toolTuLenh`, `lyDoCamNao`, `cuaBossTuDescribe` — hàm cuối vừa tách ra từ
  `taoMcpServer`, hành vi MCP không đổi), registry và `tachNguoiNhan` (TS).
  Extension/watchdog spawn bằng `node` thì phải đổi sang `tsx`.
- **Tool = 10 cái trong danh sách trắng** (`DANH_SACH_TRANG`), schema sinh từ
  `taoRegistry()` bằng đúng `toolTuLenh` của MCP rồi đổi sang format OpenAI —
  không viết tay schema. Registry thiếu cái nào thì bỏ + log. Model local nhỏ
  đưa 44 tool là lạc.
- **Rào hai lớp trước khi chạm ws**: tool ngoài danh sách trắng → lỗi; còn lại
  qua `lyDoCamNao` (owner theo VAI từ `stage.describe`, `stage.hear`, …). Bị chặn
  thì trả `{ok:false,error}` về model như kết quả tool — model biết mà sửa.
  Model quên `actor` thì driver điền người trả lời (không bao giờ owner).
- **Người trả lời dùng chính `tachNguoiNhan` của lớp hiểu lệnh (C2)**: tên gọi →
  `to` → gen. Người nhận chỉ là nhân vật `controlledBy:"owner"` (Javis) ⇒ driver
  bỏ qua (lớp hiểu lệnh tự đáp "chưa hiểu" và gắn `handled`). Câu của nhân vật
  agent nào cũng bị bỏ (mở rộng chặn vòng lặp ngoài `gen`).
- **Ollama không có `tool_choice`**: model trả chữ thuần mà không có `actor_say`
  thành công nào ⇒ driver tự `actor.say` nội dung (bỏ `<think>…</think>`, ≤ 300
  ký tự) lên người trả lời. Tối đa **3 lần gọi model** mỗi lượt; hết 3 vòng mà
  chưa nói gì thì nói câu dự phòng.
- **Hạn lượt 60 s** (`GEN_STAGE_NAO_LOCAL_HAN`, AbortController) → "Em nghĩ lâu
  quá…"; **20 s** chưa mở miệng → "Em đang nghĩ, Sếp chờ chút ạ"
  (`GEN_STAGE_NAO_LOCAL_XIN_CHO`).
- **Dò lúc chạy (STD-10)**: `GET /v1/models`; có `GEN_STAGE_OLLAMA_MODEL` thì
  phải có trong danh sách, không thì chọn model đầu tiên mà `POST /api/show`
  khai `capabilities` chứa `tools` (Ollama cũ không có trường này → lấy model
  đầu tiên). Ollama tắt / không model ⇒ log lý do mỗi lần thử, Gen báo
  "chưa có não local" **đúng một lần mỗi đợt mất**, thử lại backoff 1→10 s,
  không crash; tìm lại được thì reset. Câu Sếp gõ trong lúc mất não chỉ được
  log "bỏ lượt" (không nói thêm).
- Biến môi trường: `GEN_STAGE_OLLAMA_URL` (mặc định `http://127.0.0.1:11434`),
  `GEN_STAGE_OLLAMA_MODEL`, `GEN_STAGE_NAO_LOCAL_HAN`, `GEN_STAGE_NAO_LOCAL_XIN_CHO`,
  cộng `GEN_STAGE_PORT`/`TOKEN`/`NAO_GOP`/`NAO_NHIP_TIM`/`NAO_QUA_HAN_TIM` như `nao-agy`.
- Kiểm: `scripts/__tests__/nao-local.test.mjs` (bridge giả ws 8860 + Ollama giả
  8861, cổng 8862 làm "Ollama tắt"; đổi cổng gốc bằng `GEN_STAGE_TEST_CONG`),
  `khoa-nao.test.mjs` và `node scripts/kiem-nao-local.mjs` (bridge
  THẬT 8863–8866, Ollama giả 8867, 8868 tắt; đổi bằng `GEN_STAGE_KIEM_CONG`) → `docs/v1/nhat-ky-kiem-nao-local.json`.
  **Chưa đo với Ollama + model thật.**

## Quyết định V1 — chế độ nền (26/10, INT-06 · CNS-003 · CNS-020)

- **Áp cho MỌI mặt, không riêng VS Code.** Trình duyệt thường: `visibilitychange`
  + `blur`/`focus` của chính cửa sổ. Trong vỏ panel VS Code: tin `postMessage`
  `{nguon:"gen-stage-vscode", loai:"nen", visible, active}` từ cửa sổ cha
  (`vscode/src/thuan/html.ts` chuyển tiếp `onDidChangeViewState`). Chỉ nhận khi
  `ev.source === window.parent` (và trang thật sự nằm trong khung), origin
  `vscode-webview://…` hoặc cùng origin app, đúng khoá, `visible`/`active` boolean.
- **Không phải lệnh** (CNS-020): `main.ts` nối `theoDoiCheDoNen` thẳng vào
  `World.datCheDoVe`, không qua registry/dispatcher → não/MCP không chỉnh được fps.
  Sân khấu chỉ khai ra: `stage.describe().renderMode: "full"|"nen"` + sự kiện hệ
  thống `stage.renderMode {mode, bloom, pixelRatio, reason}`.
- **Có tin vỏ thì vỏ là nguồn sự thật, bỏ qua `blur` của iframe**: iframe mất focus
  cả khi Sếp gõ ở chatroom cạnh đó — khi ấy panel vẫn đang được xem. Chưa có tin
  vỏ (trình duyệt thường) thì mất focus = nền. Mở trang khi chưa có focus → nền
  ngay. Vỏ nhớ tin cuối và **gửi lại khi iframe `load`** (Tải lại không lỡ trạng thái).
- **Bỏ khung theo đồng hồ thật, không đếm khung**: `setAnimationLoop((t) => …)`
  chỉ vẽ khi `t − lanVeCuoi ≥ 1000/15 − 1 ms` (dung sai rung vsync; trần thực tế
  ≈ 15,2 fps ở mọi tần số màn hình). Khung bỏ không gọi `dongHo.update()` nên
  `dt` khung kế là thời gian thật; `dt` kẹp 0,1 s khi nền (1/20 s khi thường) để
  lerp trang trí không chậm 25 %. Hành động có thời lượng vẫn nội suy theo đồng
  hồ + hẹn giờ huỷ được → `durationMs` không đổi.
- **Khôi phục đúng cấu hình cũ**: vào nền nhớ `bloomTruocNen` (có thể đang tắt vì
  FPS thấp) rồi tắt bloom; ra nền trả đúng giá trị đó, reset bộ đếm FPS thấp.
  `theoDoiFps` **không chạy khi nền** (15 fps là cố ý, không phải máy yếu).
  Pixel ratio đi qua một chỗ `tyLePixel()` + `apKichThuoc()` cho renderer và CẢ
  HAI composer (`setPixelRatio` + `setSize`), resize cũng dùng chỗ đó.
- **Số đo (`docs/v1/nhat-ky-kiem-nen.json`, Chromium swiftshader, 320×200 @2x)**:
  cổng bỏ khung trên rAF thật (trang trống): 60,2 Hz → **15,2 fps** vẽ. Sân khấu
  thật: thường 2,0–4,3 fps, nền 1,5–2,0 fps — renderer phần mềm của máy kiểm
  không bao giờ vượt 15 fps nên ở đây chỉ chứng minh được *bloom tắt, pixelRatio
  2→1→2, mode/describe đúng, bloom khôi phục đúng*; trần 15 fps chứng minh ở cổng
  rAF. `actor.moveTo` ở nền: lệch **+1,0 % … +5,4 %** so với `durationMs` (đạt
  ±10 %; trễ dương là khung swiftshader dài chặn hẹn giờ, chế độ thường cũng lệch
  +4–5 %). Cú đi ĐẦU TIÊN của phiên lệch tới ~17 % ở chế độ thường (dựng clip +
  biên dịch shader) — script hâm một cú trước khi đo.
- **`theoDoiFps` đã sửa (đo bằng đồng hồ thật)**: bản A3 lấy `1/dt` với `dt` đã kẹp
  1/20 s nên `fps ≥ 20` mãi, máy 2–4 fps cần 10–20 s mới tắt bloom. Nay `src/stage/do-fps.ts`
  (`DoFps`, thuần, có test `do-fps.test.ts`) đo khoảng cách thật giữa các khung vẽ
  (`performance.now()`); ngưỡng cũ giữ nguyên (< 24 fps liên tục > 2 s → tắt; > 32 fps → bật).
  Nền thì không đo và bỏ mốc cũ (ra nền, khung đầu không bị tính chậm). 3 fps tắt sau ~2,3 s.
- Driver não trong extension (`genStage.nao`): xem `vscode/README.md` (dùng chung
  sổ PID/nhóm tiến trình; một driver cho một bridge, nhận diện driver ngoài bằng
  argv `nao-(agy|local).mjs` + `GEN_STAGE_PORT`).

## Quyết định V2 — tai nghe (26/10, INT-02 · INT-05 · CNS-004)

- **Một tiến trình một lượt, CLI là hợp đồng** với extension (`vscode/` spawn nó):
  `node scripts/tai-nghe.mjs --port --stt-port --to [--nguon] [--toi-da-ms 15000]
  [--im-lang-ms 1200] [--han-stt-ms 130000] [--han-hear-ms 15000] [--khong-gui]`; **token đọc từ env `GEN_STAGE_TOKEN`** (ưu tiên;
  `--token` vẫn nhận nhưng ghi cảnh báo stderr "token trên argv lộ trong ps"). stdout chỉ có JSON lines
  (`bat-dau` · `muc` ≤ 10 lần/s · `dang-nhan-dang` · `ket-qua {…, daGui}` ·
  `bo-qua {lyDo: gen-dang-noi|im-lang|rong|huy}` · `loi {ma: thiet-bi|stt|bridge|tham-so}`),
  log người đọc ra stderr. Mã thoát 0 / 2 thiết bị / 4 STT-bridge / 64 tham số
  (130 = tín hiệu lần hai lúc chờ STT). Dừng: stdin `dung`, SIGINT/SIGTERM (dừng
  thu rồi VẪN nhận dạng phần đã thu), VAD im ≥ `--im-lang-ms` sau khi có tiếng,
  hoặc `--toi-da-ms`. EOF stdin KHÔNG dừng. **stdin `huy`** = bỏ hẳn: dừng thu, KHÔNG
  gọi STT, KHÔNG `stage.hear`, in `bo-qua huy`, thoát 0; đang chờ STT thì abort fetch
  và bỏ kết quả (`dung` giữ nguyên nghĩa: vẫn nhận dạng phần đã thu).
- **Bán song công (CNS-004)**: hỏi `stage.describe` TRƯỚC khi mở mic — actor
  `controlledBy:"agent"` đang `speaking` ⇒ `bo-qua gen-dang-noi`, không mở mic.
  Listener `actor.sayStart` gắn NGAY khi nối bridge (trước khi gửi describe, đệm tới khi
  biết owner) và ghi cờ `genChen` từ đó: `ws` có thể giao kết quả describe + sayStart
  trong cùng một chunk TCP, gắn sau `await` thì sayStart rơi (khe bán song công).
  Trong lúc thu, `actor.sayStart` của bất kỳ actor nào KHÔNG phải owner ⇒ dừng,
  vứt âm, không gọi STT (kể cả khi sự kiện tới đúng lúc vừa dừng vì lý do khác;
  tới trong lúc STT đang chạy thì không gửi `stage.hear`). Không hỏi được sân
  khấu ⇒ `loi bridge` — không bảo đảm được bán song công thì không thu.
- **PCM qua pipe, không ghi wav tạm**: ffmpeg xuất `s16le` 16 kHz mono ra stdout;
  một luồng vừa đo RMS vừa là âm gửi đi; wav gửi STT dựng lại từ PCM đã cắt
  (header 44 byte). Không có thư mục tạm nào phải dọn; đọc wav đang ghi dở thì
  header chưa có độ dài thật.
- **VAD dùng lại `timDaiNoi` của C1, không chép**: tự dừng = chạy lại hàm đó
  (`chuaMs: 0`) trên chuỗi RMS đến giờ; cắt trước khi gửi = cùng hàm, cấu hình
  mặc định (chừa 120 ms). Muốn `node` thuần import được `src/audio/vad.ts` thì
  file đó chỉ được dùng **cú pháp TS xoá-được** (type stripping, Node ≥ 22.18):
  constructor `SoDoAm` bỏ "parameter property". Node cũ hơn ⇒ một dòng
  `loi tham-so` nói rõ (hoặc chạy bằng `npx tsx scripts/tai-nghe.mjs`).
- **Vạch mic kẹp theo đồng hồ thật**, không theo thời lượng âm: nguồn có thể đổ
  một mẻ dồn (buffer pulse, `-re` lúc mở file) — đo thật lần đầu ra 17 vạch/1,4 s.
- **Nguồn thu dò lúc chạy (STD-10)**: Linux `pulse` rồi `alsa` (`default`), macOS
  `avfoundation :0`, Windows `dshow audio=<--nguon>` (bắt buộc tên, chưa test);
  `--nguon` có `/` hoặc đuôi âm thanh ⇒ file, đọc `-re` (tốc độ thật, như mic).
  Không có ffmpeg / không mở được nguồn nào / nguồn không ra âm trong `--toi-da-ms`
  ⇒ `loi thiet-bi` mã 2.
- **Tin cậy < 0,6 ⇒ `daGui:false`**, và confidence không phải số hữu hạn (chuỗi/null/thiếu/NaN/Infinity)
  coi là 0 — điều kiện viết `!(conf >= TIN_DU)`, không fail-open (cùng `TIN_DU` của mic trình duyệt); extension
  hỏi Sếp rồi tự gửi `stage.hear`. `stage.hear` lỗi ⇒ vẫn phát `ket-qua daGui:false`
  (giữ chữ) rồi `loi bridge` mã 4.
- **`khongRo` — chống gửi `stage.hear` hai lần (review V2)**: `loi bridge` của `stage.hear`
  mang thêm `khongRo: true|false` (các `loi` khác không có trường này; vắng = coi như false).
  `true` = lệnh có thể đã tới Gen mà không biết kết cục: hết hạn (`--han-hear-ms`, mặc định
  15 s), ws rớt/lỗi sau khi đã gửi, hoặc bridge trả "…không rõ đã chạy hay chưa" (CNS-002 sân
  khấu bị thay/ngắt). `false` = chắc chắn chưa chạy (không nối được ws, validate từ chối…).
  Host (`giong.ts`): `khongRo` ⇒ ô xác nhận ghi "Có thể Gen đã nhận câu này — xem chat trước khi
  gửi lại". Và MỌI lần Gửi lại (`xu-ly-chatroom.ts`, `daNhanRoi`): thấy `user.text`/`user.speech`
  cùng `to|text` (chuẩn hoá trim + gộp khoảng trắng + bỏ `.!…` cuối; `to` vắng trong sự kiện =
  khớp) trong `CUA_SO_DA_NHAN_MS` = **30 s** (15 s hạn hear + thời gian Sếp đọc rồi bấm; 15 s trơn
  sẽ hụt khi Sếp bấm muộn) ⇒ KHÔNG gửi, báo "Gen đã nhận câu này rồi". Giới hạn: bridge còn sửa
  câu bằng sổ từ nhà (`chuanHoaCauNoi`) nên câu bị sửa thì không khớp — khi đó vẫn gửi (đúng
  hướng chọn thà gửi hơn nuốt câu).
- **Hạn cứng của host = `toiDaMs` + hạn STT + hạn `stage.hear` + dư 10 s** (170 s): hằng
  `HAN_STT_MS`/`HAN_HEAR_MS` khai MỘT chỗ ở `vscode/src/thuan/tai-nghe.ts` và truyền xuống bằng
  CLI **`--han-stt-ms`** (mặc định 130000) / **`--han-hear-ms`** (mặc định 15000) của
  tai-nghe.mjs, nên hai bên không lệch. Bản trước host huỷ ở 60 s trong khi STT được phép 130 s
  (lần đầu PhoWhisper nạp model). Hạn cứng chạm ⇒ chatroom báo "Quá hạn — nhận dạng chậm (lần
  đầu PhoWhisper đang nạp?)", không phải "bỏ qua (huỷ)".
- Hộp thoại hỏi root khi bấm 🎤 lần đầu nói rõ "(thu micro, để nghe giọng nói)"; thả nút lúc modal
  còn mở ⇒ chatroom nhắc "Bấm giữ 🎤 lại sau khi xác nhận".
- Kiểm: `scripts/__tests__/tai-nghe.test.mjs` (CLI thật + ffmpeg thật, bridge giả
  8920, STT giả 8921; đổi gốc bằng `GEN_STAGE_TEST_CONG_TAI`; phía host: `vscode/test/giong.test.mjs`, gốc 8930, đổi bằng `GEN_STAGE_TEST_CONG`; `nao.test.mjs` mặc định 8874/8875, khi đặt biến đó thì dùng gốc +5) và
  `node scripts/kiem-tai-nghe.mjs` (bridge THẬT có token). **Chưa đo với mic thật
  và PhoWhisper thật** (máy kiểm không có cả hai).

## Quyết định V3 — giác quan IDE (26/10, INTENT §4 V3)

- **Một lệnh, một sự kiện**: `stage.notice {kind: save|diag|test|task|git, summary ≤ 200, level? info|good|bad,
  data? phẳng}` (nhóm `stage`, `src/api/commands/stage.ts`) bắn **`ide.event {kind, level, summary, data}`**. Không chiếm actor,
  không đổi trạng thái sân khấu. `data` chỉ nhận số / boolean / chuỗi ≤ 120 / mảng ≤ 20 phần tử như thế, ≤ 12 khoá — sai thì
  **từ chối** (không cắt lặng), để không ai nhét nội dung file vào sự kiện.
- **Não không được giả giác quan**: `stage.notice` nằm trong `LENH_CHI_CHO_BOSS` (cùng `stage.hear`) — tool vẫn liệt kê
  (số tool = số lệnh + 1 tự đúng), gọi qua MCP/script.run bị từ chối. Nguồn thật duy nhất là extension qua ws.
- **Phản xạ (C0) ưu tiên thấp nhất**: bảng `EMOTE_IDE` trong `phan-xa.ts` — test/task good → `vui`, test bad → `boi-roi`,
  task bad → `suy-nghi`, git good → `thanh-cong`, diag good/bad → `vui`/`suy-nghi`; `save` + mọi `info` → không gì. Chỉ khi Gen
  rảnh (`dangBan` false), KHÔNG giữa cuộc nói chuyện (đang chờ não / câu đệm), cách lần trước ≥ `MS_GIUA_PHAN_XA_IDE` = 20 s.
  Lần bị bỏ vì bận KHÔNG tính lượt. *Lệch đề*: thêm `diag` vào phản xạ (đề chỉ nói test/task/git) vì extension đã lọc diag
  xuống đúng hai lần chuyển trạng thái 0⇄>0 nên không ồn; não thì KHÔNG nghĩ cho diag.
- **Não (nao-agy + nao-local) dùng chung `gannNgheIde`** (`nao-agy.mjs`): lọc `laSuKienIdeChoNao` (test/task/git, good|bad) →
  giới hạn `MS_GIUA_LUOT_IDE` = 60 s (tính từ sự kiện được nhận) → gộp 800 ms bằng chính `taoGop` (test fail + commit sát nhau =
  một lượt) → hàng đợi một-lượt sẵn có với cờ `ide: true`. **Câu Sếp thắng**: `sepBan()` = câu Sếp đang gộp / đang xếp hàng /
  lượt nào đang chạy → bỏ sự kiện IDE (kiểm lúc nhận và lúc cửa sổ gộp đóng). Lượt IDE: nhắc `VIỆC THẬT TRONG IDE CỦA SẾP «…»
  (Sếp không nói gì — nói MỘT câu ngắn…)`, không phản xạ turnTo, không "xin chờ", không câu dự phòng, lỗi chỉ ghi log; nao-local
  nói hộ chữ của model với `interrupt: false`. Lượt IDE ĐANG chạy thì câu Sếp tới sau vẫn phải chờ nó xong (hàng đợi không
  huỷ được lượt agy/Ollama đang chạy) — chấp nhận, vì lượt IDE hiếm (≥ 60 s) và chỉ bắt đầu khi không có câu Sếp nào.
- **Extension** (`vscode/src/thuan/giac-quan.ts`, nối ở `extension.ts`): save gộp 5 s **cửa sổ cố định từ lần lưu đầu**
  (autosave không đẩy lùi mãi); diag: hàm đếm chỉ chạy khi số lỗi đứng yên 3 s, lần đầu chỉ ghi mốc (lỗi có sẵn lúc mở không phải
  "vừa xảy ra"); task: `exitCode` undefined → không gửi, nhóm `test` hoặc tên có "test" → `kind: test`; git: `HEAD.commit` đổi
  **và commit mới có cha = HEAD cũ** (*lệch đề*: đề chỉ nói "HEAD.commit đổi" — thêm điều kiện cha để checkout/reset/pull không
  thành "Sếp vừa commit"). Setting `genStage.giacQuan.batTat` + `save/diag/test/git` (scope window, đọc lại mỗi lần gửi);
  `isTrusted` kiểm mỗi lần gửi. Chatroom dòng "👁 …" chỉ cho notice gửi thành công.
- **Prompt não KHÔNG chứa chữ tự do từ IDE (review bảo mật 26/10)**: `cauTuSuKienIde` chỉ dựng "Sếp vừa <việc> — <ổn|hỏng>"
  (+ `mã thoát N` nếu `data.exitCode` là số nguyên) — commit message, tên task/file, `summary` đều là dữ liệu ngoài, có thể
  chứa chỉ dẫn độc (prompt injection) mà não agy có quyền chạy công cụ. `summary`/chuỗi trong `data` vẫn hiện ở chatroom, đã qua
  `boKyTuLa` (bỏ C0/C1 + bidi) trong handler `stage.notice`.
- **Riêng tư**: chỉ `asRelativePath(uri,false)` của file `file:` trong workspace folder; `locDuong` bỏ tuyệt đối / `..` / `.git/`
  / `node_modules/` / ký tự điều khiển. Diagnostics chỉ đếm. Đường repo git chỉ làm khoá nội bộ.
- `vscode/types/vscode.d.ts` thêm `TextDocument`, `Uri.scheme`, `DiagnosticSeverity`, `Diagnostic`, `DiagnosticChangeEvent`,
  `Task`/`TaskGroup`/`TaskExecution`/`TaskProcessEndEvent`, `Extension<T>`, `languages`/`tasks`/`extensions`, `workspace.
  onDidSaveTextDocument`/`getWorkspaceFolder`/`asRelativePath` — chép từ `@types/vscode@1.106.1`, đã biên dịch `src/` với bản thật.
  API git không có trong `@types/vscode` → khai interface tối thiểu `GitExtensionToiThieu` trong `giac-quan.ts`.
- Kiểm: `src/api/__tests__/v3-giac-quan.test.ts`, `b3-mcp.test.ts` (stage_notice bị chặn), `scripts/__tests__/nao-agy.test.mjs` +
  `nao-local.test.mjs` (mục V3), `vscode/test/giac-quan.test.mjs`. **Chưa kiểm trên VS Code thật** (README checklist 15–19).
