# Báo cáo E2E chạy thật trên máy cloud (26/10)

Máy: 4 vCPU Xeon 2,8 GHz (AVX-512), 15 GB RAM, không GPU, **dùng chung CPU với phiên khác** (load 6–8 lúc đo).
Nhánh `claude/magical-thompson-oatx60-e2e` @dd15087. Cổng riêng 9000–9017. Binary/model/wav nằm ngoài repo (scratchpad), không commit.

## Tổng hợp

| Mục | Chạy thật? | Kết quả | Số đo | Ghi chú |
| --- | --- | --- | --- | --- |
| **1. Não local V1** — Ollama 0.40.11 thật + model thật + bridge thật + sân khấu thật + `nao-local` thật | Có | Chạy được, nhưng **model nhỏ trên CPU này không dùng được** | phản xạ `turnTo`+`emote` **4–68 ms**; câu 1–2 do lớp hiểu lệnh C2 đáp **~300 ms**, không tốn model; câu 3–4 qua model: **146–301 s** khi có sân khấu WebGL phần mềm, **2–26 s** khi sân khấu giả | WebGL swiftshader ăn ~2 lõi → LLM tụt còn 0,23 token/s. Hạn lượt 60 s mặc định: **0/2** câu tới model được trả lời |
| 1a. Chất lượng tool-calling | Có | **Kém** | qwen2.5:1.5b: **0/5** lần gọi có `tool_calls` cấu trúc (viết giả lệnh thành chữ); qwen2.5:0.5b: **2/7** có `tool_calls`, cả 2 sai tham số | Driver đọc to cả chuỗi JSON giả lệnh (bug B5) |
| 1b. Rào chặn | Có | Không model nào thử lệnh cấm (0 `CHẶN`); validate thật từ chối `screen.show kind:"may-tinh"` và trả lỗi về model đúng thiết kế | — | — |
| **2. STT thật C1/V2** — PhoWhisper-small ct2 (`fetch-stt.sh`) + bridge thật + sân khấu thật + `tai-nghe.mjs` thật | Có | **Chạy được**; câu lệnh thường nhận đúng, tên "Gen" bị nghe sai | lần đầu **21,4 s** (bật thợ + nạp model + hâm); sau đó **3,0–3,6 s** cho 2,5–3,6 s âm thanh; cache **6 ms**; tai-nghe trọn lượt (bắt đầu → `ket-qua`) **7,1–8,0 s** | Nguồn giọng: Piper `vi_VN-vais1000-medium` (CC BY 4.0). TTS Edge của bridge trả 502 trên cloud |
| **3. VS Code thật** 1.143.1 (Electron 43.7.7) + `@vscode/test-electron` + xvfb | Có | **11/12 OK, 1 FAIL do bug B1**: sân khấu **không bao giờ hiện** trong panel | activate 218–470 ms; extension tự bật bridge+vite trong **3,6–4,0 s**; extension host node **24.21.0**, `WebSocket` toàn cục **có** | Mô phỏng bản sửa B1 (gán `src` iframe qua CDP) + cờ GL swiftshader → **12/12 OK**, sân khấu nối bridge sau 31 s, `actor.say` chạy |

## 1. Não local (V1)

- Ollama `v0.40.11` (`ollama-linux-amd64.tar.zst` từ GitHub Releases, chỉ giải phần CPU: 72 MB), `ollama serve` tại 127.0.0.1:9010.
  Model: `qwen2.5:0.5b` (398 MB), `qwen2.5:1.5b` (986 MB). Driver dò được model, khai **10 tool**; prompt ≈ **2 770 token** mỗi lượt.
- Đo tốc độ riêng (không sân khấu, khi phiên khác đang chạy test): 0.5b nạp prompt 101 tok/s, sinh 3,4 tok/s; 1.5b: 55 / 5,6 tok/s.
- Sân khấu THẬT (`nao-local-qwen2.5_*.json`, không có hậu tố):
  - "Gen ơi, chào em" → C2 đáp "Dạ, chào" sau 302 ms, `handled`, không gọi model.
  - "Gen ơi, ra cửa sổ đi" → C2 đáp "Rõ Sếp, đi tới **cua so**" (bug B4) sau 312 ms; nhưng Gen **không bao giờ tới cửa sổ** (bug B3 + B2).
  - "Gen ơi, mở màn hình cho anh" → 0.5b trả `screen_show {screen:"buc-trung-tam", kind:"may-tinh"}` sau 230 s → validate từ chối → hết hạn 300 s. 1.5b: hết hạn 300 s. Với hạn mặc định 60 s: "Em nghĩ lâu quá…".
  - Câu tự do thêm ("hôm nay mình nên làm gì trước?") → 0.5b: nội dung rỗng → câu dự phòng sau 266 s; 1.5b: câu bịa ("chuyến đi khám phá thị trấn xanh") sau 146 s.
  - "Em đang nghĩ, Sếp chờ chút ạ" bắn đúng mốc 20,8–21,2 s.
- Sân khấu GIẢ (`*-san-khau-gia.json`, không WebGL, không lớp C2 nên cả 4 câu tới model): 1.5b mất 3,8–14,2 s/lượt, **0 tool_call**, cả 4 câu "nói hộ" — có câu đọc to `actor_say {"actor":"gen",…}` và cả bản `stage.describe`. 0.5b mất 2,2–25,5 s/lượt, 3/4 nội dung rỗng → câu dự phòng, 1 lần gọi `screen_show screen:"main"` (id không tồn tại).
- Kết luận: luồng driver ↔ bridge ↔ sân khấu ↔ Ollama **đúng như thiết kế** (khoá, `?role=nao`, phản xạ, xin chờ, hạn lượt, nói hộ, rào chặn). **Model ≤ 1.5B không đủ để gọi tool**; cần đo lại trên máy Ryan với model ≥ 7B (qwen2.5:7b / llama3.1:8b) và GPU.

## 2. STT thật (C1/V2) — `stt-that.json`

| Câu gốc (Piper) | Nhận được | Tin cậy | ms (POST /stt) |
| --- | --- | --- | --- |
| Gen ơi, chào em | trên ấy chào em | 0,866 | 21 423 (lần đầu) |
| Gen ơi, ra cửa sổ đi | trên ơi ra cửa sổ định | 0,969 | 3 568 |
| Gen ơi, mở màn hình cho anh | trên ấy mở màn hình cho anh | 0,948 | 3 626 |
| dừng lại | dừng lại | 0,851 | 3 048 |
| đi tới bàn làm việc | đi tới bàn làm việc | 1 | 3 051 |
| hôm nay mình làm gì trước | hôm nay mình làm gì chứ | 0,981 | 3 276 |

- `tai-nghe.mjs --nguon <wav>` thật (VAD → STT → `stage.hear`) với sân khấu thật: 3/3 lượt mã thoát 0, `daGui:true`, sân khấu nhận `user.text` + `user.speech` đúng `to`.
  "đi tới bàn làm việc" gửi cho Javis (`to:"owner"`) → C2 `handled`, Javis đi (INT-02 đúng); câu cho Gen → phản xạ "Sếp cần gì ạ?" rồi "Em chưa có não…" (không bật driver, đúng).
- "Gen" → "trên…" ở cả 3 câu, `goiGen:false`: sổ từ nhà không có "trên ơi/trên ấy". Có thể do giọng Piper đọc "Gen" khác người thật — **chưa kết luận**, cần đo bằng giọng Ryan.
- Chưa kiểm: mic thật (máy không có), STT qua extension.

## 3. VS Code thật — `vscode-that.json`, `vscode-that-mo-phong-sua-bo-loc.json`

OK: nạp + activate, 5 lệnh `genStage.*`, view chatroom ở secondary sidebar mở được (ảnh), `moSanKhau` mở panel "Sân khấu" + gọi lại không mở panel thứ hai,
extension tự bật bridge + vite đúng cổng cấu hình, `xemLog`, `tatDichVu` giải phóng cổng bridge + vite (V0-8 phần "tự bật thì tự tắt").
Log kênh Gen-Stage: `[khởi động] node 24.21.0 · WebSocket: toan-cuc`. Log extension host: không có lỗi của extension; 1 cảnh báo VS Code "gen-labs.gen-stage-vscode created a webview without a content security policy" (chưa rõ webview nào — cả hai vỏ đều có thẻ CSP).

FAIL: **sân khấu không hiện trong panel** (ảnh `vscode-that-loi-bo-loc.png`) — bug B1. Soi webview qua CDP: vỏ nhận đủ `napLai`/`hienAn`/`trangThai` từ host nhưng `ev.source` **không phải** `window.parent` (cũng không phải `null`/`window.top`/chính nó) → bị bộ lọc vứt hết, iframe không bao giờ có `src`.
Mô phỏng bản sửa (gán `src` như `napLai` sẽ làm) + cờ GL `--ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader`: app nạp, WebGL2 có, sân khấu nối bridge sau 31 s, `actor.say` qua bridge chạy, chatroom "Sân khấu: đã nối" (ảnh `vscode-mo-phong-sua-bo-loc.png`). `stage.describe().renderMode` = `"nen"` dù panel đang active — vì tin `hienAn` cũng bị cùng bộ lọc vứt (INT-06 hỏng theo B1). Không có cờ GL thì Electron trong xvfb không tạo được WebGL (llvmpipe nằm trong danh sách chặn) — đó là chuyện môi trường cloud, không phải bug.

## Bug sản phẩm tìm thấy (đã sửa — xem mục "Sau khi sửa")

| # | Mức | Chỗ | Mô tả · tái hiện |
| --- | --- | --- | --- |
| B1 | **Chặn** | `vscode/src/thuan/html.ts:153` | `if (ev.source !== window.parent) return;` vứt **mọi** tin host gửi xuống vỏ trong VS Code 1.143.1 → panel không bao giờ nạp sân khấu, `hienAn` (INT-06) không tới app. `kiem-vscode.mjs` không bắt được vì `acquireVsCodeApi` giả gửi từ đúng `window.parent`. Gợi ý: lọc theo `ev.origin === location.origin` (tin host đi từ chính origin `vscode-webview://…` của webview; iframe sân khấu có origin `http://127.0.0.1:…` nên vẫn bị loại). Tái hiện: `E2E_VSC_DIR=… xvfb-run -a node scripts/kiem-vscode-that.mjs` |
| B2 | Cao | `src/api/commands/actor.ts:154` | `actor.moveTo` bị cắt (interrupt) vẫn bắn `actor.arrived` (không kiểm `hd.cancelled()`, khác `emote` đã làm đúng) → agent/driver tưởng đã tới nơi. E2E: `stt-that.json` (Javis `cmd.interrupted` rồi `actor.arrived to:"ban-dieu-khien"`). Có test vitest đỏ tái hiện (giữ ngoài repo, xem báo cáo cho Gen) |
| B3 | Trung bình | `scripts/nao-agy.mjs:533` | Phản xạ driver `actor.turnTo … interrupt:true` cắt ngang việc Gen đang làm từ câu trước (C2 "ra cửa sổ đi" → đang đi → câu kế tiếp cắt) → Gen không bao giờ tới cửa sổ (3/3 lượt chạy, `gen.at:null`, gần `ban-2`). Dùng chung cho `nao` và `nao-local` |
| B4 | Thấp | `src/behavior/ngu-phap.ts:460–491` (`tenDep`) | Thiếu tên đẹp cho place D1 (`cua-so`, `sofa`, `ban-an`, `bep`) → Gen nói "đi tới **cua so**" (không dấu); tên cũ thời lab còn nguyên: Sếp nói "đi tới bàn làm việc" → Javis đáp "Dạ, đi tới **bàn điều khiển**" |
| B5 | Trung bình | `scripts/nao-local.mjs:176–182, 479` | "Nói hộ" đọc nguyên văn nội dung model: model nhỏ viết giả lệnh thành chữ (`actor_say {"actor":"gen",…}`) hoặc dội lại `stage.describe` → Gen đọc to JSON. Gợi ý: nhận diện dòng `ten_tool {json}` thành tool_call, hoặc không nói hộ nội dung có `{"` |
| B6 | Thấp | `vscode/src/thuan/cau-hinh.ts:79` (`urlSanKhau`) | Không truyền `sttPort` cho iframe → app trong panel gọi `127.0.0.1:8790/stt/khoe` dù `genStage.sttPort`=9015 (lỗi console `ERR_CONNECTION_REFUSED`, hoặc chạm STT của bridge khác) |
| B7 | Thấp, chưa kiểm hậu quả | `vscode/src/thuan/tien-trinh.ts:49` (`lenhBridge`) | Không có cấu hình cổng MCP: bridge do extension bật luôn nghe 8789 dù `bridgePort` khác — hai bridge cùng máy sẽ tranh 8789. E2E này lách bằng env `GEN_STAGE_MCP_PORT` |

Môi trường (không phải bug): TTS Edge trả 502 (`Unexpected server response: 200`) qua proxy cloud; Electron trong xvfb cần cờ swiftshader mới có WebGL.

## Sau khi sửa (26/10, cùng ngày)

| # | Sửa ở đâu | Cách sửa |
| --- | --- | --- |
| B1 | `vscode/src/thuan/html.ts` | Vỏ nhận tin host khi `ev.source === window.parent` **hoặc** `ev.origin === location.origin` (origin `vscode-webview://…` của chính webview); tin từ `khung.contentWindow` luôn bị bỏ. Iframe sân khấu (`http://127.0.0.1:…`) khác origin nên không giả được host. Test `thuan.test.mjs` thêm ca "source lạ nhưng cùng origin webview" và "origin lạ". |
| B2 | `src/api/commands/actor.ts` | `actor.moveTo` kiểm `hd.cancelled()` trước khi bắn `actor.arrived` (như `emote`). Test tái hiện của tester thành `src/api/__tests__/e2e-b2-arrived.test.ts`. |
| B3 | `scripts/nao-agy.mjs` `phanXa` | Bỏ `interrupt: true` ở `actor.turnTo`: Gen đang bận việc C2 thì quay người xếp hàng chạy sau, không cắt cú đi. |
| B4 | `src/behavior/ngu-phap.ts` `tenDep` | Tên đọc theo nghĩa D1: bàn làm việc, phòng khách, kệ sách, cửa sổ, sofa, bàn ăn, bếp, ghế ăn, ghế làm việc. |
| B5 | `scripts/nao-local.mjs` `sachNoiDung` | Chữ có dấu vết lệnh/JSON: rút đúng `"text"` của lời nói nếu có, không thì bỏ (driver dùng câu dự phòng). Không bao giờ đọc JSON thành tiếng. |
| B6 | `vscode/src/thuan/cau-hinh.ts` `urlSanKhau` | Truyền `sttPort` khi khác mặc định. |
| B7 | `vscode/src/thuan/tien-trinh.ts` + `bridge/mcp.ts` | Setting mới `genStage.mcpPort` (mặc định 8789) → `GEN_STAGE_MCP_PORT`; MCP không nghe được cổng thì log và tắt riêng MCP, không kéo sập bridge. (Bản sửa đầu suy `bridgePort + 2` — đụng đúng `devPort` của chính bài kiểm, 9012 → 9014 — nên bỏ.) |

**Chạy lại VS Code 1.143.1 thật SAU khi sửa** (`vscode-that.json`, KHÔNG mô phỏng, cờ GL swiftshader của môi trường cloud):
**13/13 OK** — sân khấu trong webview nối bridge (stage.describe có actor), `actor.say` qua bridge chạy, `renderMode: "full"` khi panel
đang active (INT-06 sống lại cùng B1). Không cờ GL thì iframe vẫn được gán `src` đúng (B1 hết) nhưng Electron trong xvfb không có WebGL —
chuyện môi trường. Log trước khi sửa giữ ở `vscode-that-truoc-sua-b1.json`.

Chưa xử lý (ghi lại): model ≤ 1.5B không đủ gọi tool — cần đo model ≥ 7B trên máy Ryan; "Gen" → "trên" với giọng Piper cần đo giọng thật
trước khi thêm vào sổ từ nhà; cảnh báo VS Code "webview without a content security policy" chưa rõ nguồn.

## V3 giác quan IDE trên VS Code thật (26/10)

`scripts/kiem-vscode-that.mjs` nay bấm thật cả 4 giác quan rồi nghe `ide.event` ở bridge bằng một client ws — **19/19 OK** (`vscode-that.json`):

| Giác quan | Bấm thật | `ide.event` nhận được | Trễ |
| --- | --- | --- | --- |
| Lưu file | sửa + `save()` `.cache/e2e-v3/luu.txt` | `save info` "Lưu 1 file: .cache/e2e-v3/luu.txt" | 5,2 s (cửa sổ gộp 5 s) |
| Lỗi biên dịch | `.ts` sạch → gán `"chu"` cho `number` | `diag bad` "Có 1 lỗi biên dịch" | 4,0 s (debounce 3 s) |
| Hết lỗi | sửa lại | `diag good` "Hết lỗi biên dịch" `before: 1` | 3,4 s |
| Test hỏng | task "test e2e" `exit 3` | `test bad` "(mã 3)" `exitCode: 3` | 1,8 s |
| Task xong | task "build e2e" `exit 0` | `task good` | 0,5 s |
| Git commit | repo tạm (không đụng repo thật) + `git.openRepository` + commit CLI | `git good` "Commit 9dd287a: thêm dòng hai" | 1,2 s |

Gen phản xạ `suy-nghi` sau `diag bad`; các sự kiện sau rơi trong khoảng nghỉ 20 s (`MS_GIUA_PHAN_XA_IDE`) nên không phản xạ thêm — đúng thiết kế, không để Gen giật liên tục.
Chưa kiểm bằng VS Code thật: dòng 👁 trong chatroom (chỉ kiểm bằng test đơn vị) và câu não nói (cần não Ollama ≥ 7B).

## Cách chạy lại

```bash
# 1 — cần Ollama đang chạy (vd OLLAMA_HOST=127.0.0.1:9010 ollama serve) + model đã pull
E2E_OLLAMA=http://127.0.0.1:9010 E2E_MODEL=qwen2.5:1.5b E2E_HAN=300000 node scripts/kiem-e2e-nao-local-that.mjs
E2E_SAN_KHAU=gia E2E_MODEL=qwen2.5:1.5b node scripts/kiem-e2e-nao-local-that.mjs      # sân khấu giả, khi CPU yếu
# 2 — cần bash scripts/fetch-stt.sh + thư mục wav (cau.txt + cau1.wav…)
E2E_WAV_DIR=/đường/wav node scripts/kiem-e2e-stt-that.mjs
# 3 — cần thư mục đã `npm i @vscode/test-electron` (ngoài repo)
pnpm -C vscode build && E2E_VSC_DIR=/đường/vsc E2E_VSC_CDP=1 xvfb-run -a node scripts/kiem-vscode-that.mjs
#     thêm E2E_VSC_GL="--ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader" khi không có GPU
#     thêm E2E_VSC_GIA_SUA=1 để MÔ PHỎNG bản sửa B1 (chỉ để đo phần sau của luồng — không phải kết quả thật)
```
