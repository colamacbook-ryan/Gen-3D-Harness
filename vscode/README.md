# Gen-Stage for VS Code — spike V0

Extension đưa **sân khấu Gen-Stage vào một tab editor đặt cạnh code** và một
**Chatroom ở cột phải** (Secondary Side Bar, STD-08 §0). Extension chỉ là *một
mặt client* của bridge (INT-04): không có bộ lệnh riêng, mọi câu gõ đi qua
ws → bridge → dispatcher như ô chat trong app.

Kế hoạch + audit: Second-Brain `01-projects/gen-stage-vscode/` (ARCHITECTURE-V0, CNS-2026-10-26-v0).
License: © 2026 Gen Labs — All rights reserved (`LICENSE`). Không thêm phụ thuộc npm nào.

## Có gì trong V0

| Phần | Làm gì |
| --- | --- |
| Lệnh **Gen-Stage: Mở sân khấu** | WebviewPanel `ViewColumn.Beside`, `retainContextWhenHidden`, `portMapping`, CSP `default-src 'none'; frame-src http://127.0.0.1:<devPort>`; iframe `http://127.0.0.1:5173/?bridge=1` (+`bridgePort`/`ttsPort` khi khác mặc định). Nút **Tải lại**; vite chưa chạy thì hiện hướng dẫn rõ thay vì khung trắng. Chỉ một panel — gọi lại thì `reveal()`. |
| **Chatroom** (cột phải) | Extension host giữ **một** ws client tới bridge (vai client, *không* `role=nao`). Danh sách nhân vật lấy từ `stage.describe` (tên hiển thị `name`), làm mới khi `actor.spawned/removed`, `bridge.stageOnline`, `stage.reset`. Bấm để chọn **người nghe** (lưu ở `workspaceState`). Log: `user.text`, `user.speech` (gộp với `user.text` cùng câu, gắn nhãn "nói"), `actor.sayStart`, `user.command` đã khớp. Ô gõ gửi `actor.say {actor:<owner>, text, to:<đang chọn>, interrupt:true}` — y như ô chat trong app; lớp hiểu lệnh trong sân khấu quyết người nhận cuối (tên gọi trong câu thắng, không gọi tên thì dùng `to`). |
| Quản lý tiến trình | Dò cổng trước (bridge: TCP; sân khấu: `GET /` có `<title>` chứa "Gen-Stage"). Có sẵn thì **dùng lại, không bao giờ tắt**. Thiếu (và `genStage.tuBat`) thì bật `pnpm bridge` + `pnpm exec vite --host 127.0.0.1 --port <devPort> --strictPort`, `detached`, log vào OutputChannel "Gen-Stage". Tắt = SIGTERM **cả nhóm** (PID âm), chỉ cái mình bật. PID ghi ở `<repo>/.cache/vscode/tien-trinh.json` để lần kích hoạt sau nhận lại quyền nếu extension host chết ngang (CNS-012). |
| Chế độ nền (INT-06) | `onDidChangeViewState` → vỏ panel chuyển tiếp `postMessage({nguon:"gen-stage-vscode", loai:"nen", visible, active})` xuống iframe (đúng origin). **App sân khấu chưa nghe tin này** (TODO V1, V0 không sửa `src/`). Chatroom hiện cảnh báo "Tab sân khấu đang ẩn — lệnh sẽ chờ" (CNS-003). |

## Cài thử

Yêu cầu: VS Code **≥ 1.106** (cần `viewsContainers.secondarySidebar`, xem "Cột phải" bên dưới), Linux, repo này đã `pnpm install` + `pnpm assets`.

**Cách 1 — F5 (Extension Development Host):**
```bash
pnpm -C vscode build        # tsc → vscode/out + vscode/out-web
code vscode                 # mở THƯ MỤC vscode/ trong VS Code, bấm F5
```
`.vscode/launch.json` mở cửa sổ dev với workspace là gốc repo → extension tự tìm thấy `bridge/server.ts`.

**Cách 2 — gói `.vsix` (cài tay, không lên Marketplace):**
```bash
pnpm -C vscode build
cd vscode && npx @vscode/vsce package --no-dependencies --allow-missing-repository
code --install-extension gen-stage-vscode-0.0.1.vsix
```
(`@vscode/vsce` chỉ chạy qua `npx`, không thêm vào repo.) Cài bằng `.vsix` thì đặt `genStage.root` = đường dẫn repo.

Rồi: `Ctrl+Shift+P` → **Gen-Stage: Mở sân khấu**. Chatroom: biểu tượng Gen-Stage ở Secondary Side Bar (`Ctrl+Alt+B` để mở cột phải).

## Cấu hình

| Khoá | Mặc định | Ghi chú |
| --- | --- | --- |
| `genStage.root` | `""` | Repo Gen-Stage. Trống = workspace folder có `bridge/server.ts`, rồi thư mục cha của extension. |
| `genStage.bridgePort` | 8787 | ws bridge (truyền cho bridge qua `GEN_STAGE_PORT` khi tự bật) |
| `genStage.ttsPort` | 8788 | TTS (`GEN_STAGE_TTS_PORT`) |
| `genStage.devPort` | 5173 | vite |
| `genStage.tuBat` | `true` | Cổng trống thì tự bật bridge/vite |
| `genStage.pnpm` | `pnpm` | Đặt đường dẫn tuyệt đối nếu PATH của VS Code không thấy nvm/corepack |

## Cột phải (Secondary Side Bar) — đã kiểm nguồn

- Tài liệu contribution points (code.visualstudio.com/api/references/contribution-points) **vẫn ghi** chỉ có `activitybar` và `panel` — trang này cũ.
- Mã nguồn VS Code `src/vs/workbench/api/browser/viewsExtensionPoint.ts` có khoá `secondarySidebar` từ nhánh `release/1.104` (dò: 1.103 không có, 1.104 có).
- Release notes **1.104**: "View containers in the Secondary Side Bar… currently behind the `contribSecondarySideBar` proposed API".
- Release notes **1.106**: "Extension authors can now register view containers in the Secondary Side Bar by using the new `secondarySidebar` contribution point" — đã chính thức, không cần proposed API.

→ `engines.vscode: ^1.106.0` + `contributes.viewsContainers.secondarySidebar`. Không cần hướng dẫn kéo tay.
Nếu VS Code của Sếp cũ hơn 1.106 thì extension không cài được (engines chặn) — báo Gen để hạ engines và chuyển sang `activitybar` + kéo view sang phải.

## Kiểm

```bash
pnpm -C vscode check     # tsc --noEmit, strict, cả host lẫn webview
pnpm -C vscode test      # build + node:test (28 test: CSP/HTML, sự kiện→dòng chat, chọn người nghe,
                         #   dò cổng với server thật, bật/nhận lại/tắt NHÓM tiến trình bằng pnpm giả, ws client với bridge giả)
node scripts/kiem-vscode.mjs   # V0-3/V0-4: bridge + vite THẬT ở cổng riêng 8827-8830/5193, vỏ panel + chatroom trong
                               # Chromium với acquireVsCodeApi giả → ảnh + nhật ký vào docs/vscode-v0/
```

Kiểu `vscode`: repo không thêm `@types/vscode`; `types/vscode.d.ts` khai báo tối thiểu phần extension dùng, chép từ
`@types/vscode@1.106.1`. **Kiểm kiểu với bản thật** (cần mạng, không ghi gì vào repo):
```bash
mkdir -p /tmp/tv && (cd /tmp/tv && npm pack @types/vscode@~1.106.0 && tar xzf types-vscode-*.tgz)
cat > /tmp/tv/tsconfig.json <<'J'
{ "extends": "<repo>/vscode/tsconfig.json",
  "compilerOptions": { "noEmit": true, "rootDir": "<repo>/vscode/src", "typeRoots": ["/tmp/tv", "<repo>/node_modules/@types"], "types": ["node", "vscode"] },
  "include": ["<repo>/vscode/src"] }
J
node <repo>/node_modules/typescript/bin/tsc -p /tmp/tv/tsconfig.json
```

## Checklist trên máy Sếp (V0-5..9 — cloud không kiểm được)

Điều kiện đầu: **không** tab Gen-Stage nào khác đang mở (Firefox), **không** chạy `pnpm start` song song (CNS-002).

1. **V0-5** F5 → "Mở sân khấu" → tab nằm cạnh file `.ts` (split). Chụp màn hình. Ghi bản VS Code (`Help → About`) và dòng `[khởi động] node … · WebSocket: …` trong "Gen-Stage: Xem nhật ký".
2. **V0-6** Chuyển tab 10 lần → log bridge **không** thêm dòng "sân khấu đã nối", cảnh không reset.
3. **V0-7** Gõ ở ô chat *trong sân khấu* → chatroom hiện câu đó ≤ 500 ms. Gõ ở *chatroom* (chọn Gen) → Javis nói, Gen đáp.
4. **V0-8** `ss -ltn | grep -E '8787|5173'` trước/sau khi đóng VS Code: extension tự bật thì cổng rảnh; bridge bật sẵn từ trước thì vẫn sống.
5. **V0-9** Process Explorer: CPU/GPU/RAM khi tab hiện+focus / hiện+không focus / ẩn; gửi một câu từ chatroom lúc tab sân khấu ẩn — đo độ trễ (chatroom sẽ cảnh báo "lệnh sẽ chờ").

## Giới hạn đã biết

- **Webview không có mic** (vscode#323602 còn là proposal) → V0 không làm giọng nói; giọng đi qua bridge `/stt` hoặc sidecar (V2).
- **Tin "ẩn" không tới được webview đang ẩn**: VS Code tạm dừng script của panel ẩn và không giao `postMessage` cho nó; tin có ích là `active=false` khi panel vẫn hiện nhưng mất focus. App sân khấu chưa nghe tin nào (TODO V1).
- Lệnh gửi lúc tab sân khấu ẩn có thể chờ tới khi hiện lại / hết hạn 30 s của bridge (CNS-003) — chưa đo (V0-9).
- Chọn **Javis** (owner) làm người nghe thì câu gửi là `actor.say {actor:"owner", to:"owner"}` — Javis tự nói với chính mình; lớp hiểu lệnh xử lý câu lệnh, câu tự do thì theo luật C2.
- Cổng STT (8790) và MCP (8789) không có trong cấu hình: tự bật bridge thì chúng dùng mặc định, và app trong iframe gọi `/stt` ở 8790.
- Remote/Codespaces không hỗ trợ (`portMapping` không ánh xạ `ws://`).
- Chỉ Linux (đọc `/proc`, kill nhóm tiến trình).
- Serializer (khôi phục tab sân khấu sau khi mở lại VS Code): để V1.
