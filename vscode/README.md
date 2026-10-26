# Gen-Stage for VS Code — spike V0 + V1 (chế độ nền, driver não) + V2 (giọng nói) + V3 (giác quan IDE)

Extension đưa **sân khấu Gen-Stage vào một tab editor đặt cạnh code** và một
**Chatroom ở cột phải** (Secondary Side Bar, STD-08 §0). Extension chỉ là *một
mặt client* của bridge (INT-04): không có bộ lệnh riêng, mọi câu gõ đi qua
ws → bridge → dispatcher như ô chat trong app.

Kế hoạch + audit: Second-Brain `01-projects/gen-stage-vscode/` (ARCHITECTURE-V0, CNS-2026-10-26-v0).
License: © 2026 Gen Labs — All rights reserved (`LICENSE`). Không thêm phụ thuộc npm nào.

## Có gì trong V0

| Phần | Làm gì |
| --- | --- |
| Lệnh **Gen-Stage: Mở sân khấu** | WebviewPanel `ViewColumn.Beside`, `retainContextWhenHidden`, `portMapping`, CSP `default-src 'none'; frame-src http://127.0.0.1:<devPort>` (đổi cổng khi tab đang mở → dựng lại vỏ + CSP); iframe `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"`, vỏ bỏ qua mọi `postMessage` đến từ iframe; iframe `http://127.0.0.1:5173/?bridge=1` (+`bridgePort`/`ttsPort` khi khác mặc định). Nút **Tải lại**; vite chưa chạy thì hiện hướng dẫn rõ thay vì khung trắng. Chỉ một panel — gọi lại thì `reveal()`. |
| **Chatroom** (cột phải) | Extension host giữ **một** ws client tới bridge (vai client, *không* `role=nao`). Danh sách nhân vật lấy từ `stage.describe` (tên hiển thị `name`), làm mới khi `actor.spawned/removed`, `bridge.stageOnline`, `stage.reset`. Bấm để chọn **người nghe** (lưu ở `workspaceState`). Log: `user.text`, `user.speech` (gộp với `user.text` cùng câu, gắn nhãn "nói"), `actor.sayStart`, `user.command` đã khớp. Ô gõ gửi `actor.say {actor:<owner>, text, to:<đang chọn>, interrupt:true}` — y như ô chat trong app; lớp hiểu lệnh trong sân khấu quyết người nhận cuối (tên gọi trong câu thắng, không gọi tên thì dùng `to`). |
| Quản lý tiến trình | Dò cổng trước (bridge: TCP; sân khấu: `GET /` có `<title>` chứa "Gen-Stage"). Có sẵn thì **dùng lại, không bao giờ tắt**. Thiếu (và `genStage.tuBat`, workspace đã tin cậy, root đã xác nhận) thì bật `pnpm bridge` + `pnpm exec vite --host 127.0.0.1 --port <devPort> --strictPort`, `detached`. Gọi chồng nhau (mở tab + bấm lệnh cùng lúc) thì dùng chung một lượt — không bật đôi. Tiến trình chết ngay (sai lệnh, thiếu interpreter) thì báo ngay, không chờ 30 s. Tắt = SIGTERM **cả nhóm** (PID âm), chỉ cái mình bật, và chỉ khi nhóm đó vẫn đúng là nó (pgid = pid, starttime khớp). Xem "Sổ PID + log" bên dưới. |
| Chế độ nền (INT-06, **V1**) | `onDidChangeViewState` (và sau mỗi lần nạp iframe) → vỏ panel chuyển tiếp `postMessage({nguon:"gen-stage-vscode", loai:"nen", visible, active}, <origin sân khấu>)` xuống iframe. Vỏ nhớ tin cuối và **gửi lại khi iframe `load`** (Tải lại không làm app quên trạng thái). App (`src/stage/che-do-nen.ts`) chỉ nhận tin có `source` = cửa sổ cha, origin `vscode-webview://` (hoặc cùng origin), đúng khoá; panel **không active hoặc không visible → nền**: ≤ 15 fps, tắt bloom, pixelRatio 1; active lại → khôi phục đúng bloom/pixelRatio cũ. Có tin vỏ thì `blur` của iframe bị bỏ qua (gõ ở chatroom không làm sân khấu nền). Chatroom hiện "Sân khấu: chế độ nền (≤15 fps)" (từ `stage.describe().renderMode` + sự kiện `stage.renderMode`), cảnh báo tab ẩn giữ nguyên (CNS-003). |
| Driver não (**V1**) | Setting `genStage.nao`: `tat` (mặc định) · `local` → `pnpm nao-local` (Ollama) · `agy` → `pnpm nao`. Dùng **chung** cơ chế quản lý tiến trình (sổ PID mục `nao@<bridgePort>`, nhóm tiến trình, chữ ký argv, chủ sở hữu, nhận lại khi cửa sổ chủ chết). **Chỉ một driver cho một bridge**: đã có driver lạ (đọc `/proc`: argv `nao-agy.mjs`/`nao-local.mjs` + `GEN_STAGE_PORT` trùng cổng) thì không bật thêm, không giết; đổi setting → tắt driver CỦA MÌNH, đợi chết hẳn, rồi bật cái mới; các lượt đổi xếp hàng nối tiếp. Bật khi bridge đã lên (mở sân khấu / "Bật bridge + sân khấu" / đổi setting / vừa tin cậy workspace). Cần workspace tin cậy + root đã xác nhận; driver chết ngay thì cảnh báo + log. Chatroom hiện "Não: đã nối/chưa nối · <chế độ>" (`brainConnected` + `bridge.brain`). "Tắt dịch vụ do VS Code bật" tắt cả driver. |

## Giọng nói (V2, INT-02)

Webview VS Code **không có mic** (vscode#250568, #323602), nên extension không thu tiếng trong webview: host chạy
một tiến trình ngắn `scripts/tai-nghe.mjs` (ffmpeg → bridge `/stt` → `stage.hear`) cho **mỗi lần nói**, đọc JSON lines
của nó rồi vẽ lên chatroom. Câu nói tới **nhân vật đang chọn ở chatroom** (`--to`, chốt lúc BẮT ĐẦU thu); tên gọi
trong câu vẫn thắng (lớp hiểu lệnh của sân khấu, như câu gõ).

| Cách nói | Làm gì |
| --- | --- |
| **Giữ nút 🎤** (cạnh ô gõ) | Nhấn giữ = bắt đầu thu (`--im-lang-ms 0`, không VAD); thả / kéo chuột ra khỏi nút / cửa sổ mất focus = dòng `dung` vào stdin → tai-nghe dừng thu và nhận dạng. Tab tới nút rồi giữ Space/Enter cũng được (keyup có trong webview). |
| **`Ctrl+Alt+Space`** = lệnh **Gen-Stage: Nói (bật/tắt)** (`genStage.noi`) | Lần 1 bắt đầu thu **có VAD** (`--im-lang-ms 1200`: im 1,2 s là tự dừng); lần 2 dừng ngay. **Không có "giữ phím"**: API keybinding của VS Code không có keyup. Gõ được ở bất cứ đâu (đang code) — không cần mở chatroom; lỗi hoặc câu chờ xác nhận thì chatroom tự hiện ra. |

Vì sao `Ctrl+Alt+Space`: `Ctrl+Space` (gợi ý) và `Ctrl+Shift+Space` (gợi ý tham số) là phím mặc định của VS Code; `Super+Space`
là đổi bộ gõ của GNOME/Fedora; `Ctrl+Alt+Space` không có trong bảng phím mặc định của VS Code mà chúng tôi biết và không
phải phím hệ thống GNOME mặc định — **chưa kiểm trên máy Sếp** (xem checklist). Đổi ở *Keyboard Shortcuts* (`genStage.noi`).

- **Một lần thu tại một thời điểm.** Chỉ chạy khi workspace tin cậy + root đã duyệt (cùng cổng `choPhepBat` với bridge/vite/não).
- **Bán song công phía UI**: nút 🎤 tắt khi một nhân vật agent đang nói (`actor.sayStart` chưa có `actor.sayDone`, quá 60 s thì
  thôi tính; mất bridge/`stage.reset` xoá cờ). Đang thu thì nút luôn bấm được để thả. tai-nghe cũng tự dừng khi có `actor.sayStart`.
- **Trạng thái trong chatroom**: đang mở micro → đang nghe (vạch mức theo `muc`, ≤ 16 tin/giây) → đang nhận dạng →
  (gửi rồi: câu hiện qua `user.text`/`user.speech` như mọi câu) · **bỏ qua** kèm lý do (`gen-dang-noi`/`im-lang`/`rong`/`huy`) ·
  **lỗi** kèm gợi ý (thiết bị → "kiểm tra ffmpeg/PipeWire…", STT → cổng `sttPort` + `fetch-stt.sh`, bridge, tham số → Node ≥ 22.18).
- **Tin cậy < 0,6** (`daGui:false`): câu vào ô sửa với **Gửi / Bỏ** (Esc = Bỏ). Gửi = host gọi `stage.hear {text đã sửa, to (lúc thu),
  confidence, durationMs}` qua ws hiện có. tai-nghe gửi `stage.hear` hỏng (`ket-qua daGui:false` rồi `loi bridge`) → câu cũng
  nằm lại ô sửa để gửi lại.
  Nếu `loi bridge` mang **`khongRo:true`** (hết hạn / ws rớt / sân khấu bị thay — Gen có thể đã nhận) ô sửa ghi "Có thể Gen đã nhận
  câu này — xem chat trước khi gửi lại"; và **trước mọi lần Gửi lại** host kiểm `user.text`/`user.speech` cùng `to|text` trong
  30 s gần nhất — có rồi thì **không gửi**, báo "Gen đã nhận câu này rồi".
- **Dọn**: đóng chatroom, đóng tab sân khấu, đổi cấu hình (cổng/nguồn/root/pnpm), deactivate → **huỷ**: dòng `huy` vào stdin
  (không STT, không `stage.hear`), quá 2 s chưa thoát thì **SIGKILL cả nhóm** (spawn `detached` ⇒ pgid = pid; ffmpeg con chết theo).
  deactivate chờ tối đa 2,5 s rồi SIGKILL mọi nhóm còn lại. Chatroom bị *ẩn* giữa lúc **giữ nút** cũng huỷ (document webview
  bị huỷ nên `pointerup` không bao giờ tới); lần thu bằng phím thì không. Không dùng SIGTERM làm nút huỷ (SIGTERM = dừng thu
  nhưng vẫn nhận dạng + gửi).
- **Không ghi sổ PID** cho tai-nghe (khác bridge/vite/não): nó sống ngắn có trần (`--toi-da-ms` 15 s + nhận dạng; host tự huỷ sau
  `toiDaMs` + hạn STT 130 s + hạn stage.hear 15 s + dư 10 s = 170 s, truyền xuống bằng `--han-stt-ms`/`--han-hear-ms`; chạm hạn → "Quá hạn — nhận dạng chậm"), stdout là pipe của host (host chết → lần ghi kế ăn EPIPE, muộn nhất tự dừng ở 15 s), nhận lại quyền qua cửa sổ khác là vô
  nghĩa với một lần thu, còn sổ PID thêm rủi ro giết nhầm PID tái sử dụng. Vẫn không mồ côi: nhóm riêng + `huy`/SIGKILL nhóm, và khi
  trưởng nhóm thoát host quét nhóm thêm một lần.
- **Lệnh chạy** khai ở MỘT chỗ: `CHAY_TAI_NGHE` trong `src/thuan/tai-nghe.ts` = `<genStage.pnpm> exec node scripts/tai-nghe.mjs`
  (cwd = root; cần **Node ≥ 22.18** trong PATH mà VS Code thấy). Token bridge chỉ qua env `GEN_STAGE_TOKEN` (thừa hưởng từ
  extension host), không bao giờ `--token` trên argv. Tham số: `--port <bridgePort> --stt-port <sttPort> --to <đang chọn>
  --toi-da-ms 15000 --im-lang-ms <0|1200> [--nguon <genStage.taiNghe.nguon>]`.

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

## Giác quan IDE (V3)

Sếp code trong VS Code → sân khấu "thấy" việc thật. Host nghe 4 nguồn rồi gửi `stage.notice {kind, level, summary, data}`
qua **cùng ws client của chatroom** (vai client); sân khấu bắn `ide.event`. Logic thuần ở `src/thuan/giac-quan.ts`
(class `GiacQuan`), `extension.ts` chỉ nối sự kiện.

| Nguồn VS Code | Gửi khi | `kind` / `level` | `summary` / `data` |
| --- | --- | --- | --- |
| `workspace.onDidSaveTextDocument` | gộp **5 s** tính từ lần lưu đầu (autosave không đẩy lùi mãi) | `save` / `info` | "Lưu N file: a.ts, b.ts (+k)" — tối đa 5 tên · `{count, files}` |
| `languages.onDidChangeDiagnostics` | số lỗi **Error** trong workspace đứng yên **3 s** rồi mới đếm; chỉ khi **0 → >0** hoặc **>0 → 0**; lúc mở chỉ ghi mốc | `diag` / `bad` · `good` | "Có N lỗi biên dịch" / "Hết lỗi biên dịch" · `{errors[, before]}` |
| `tasks.onDidEndTaskProcess` | exit code 0 → `good`, ≠ 0 → `bad`; `undefined` → không gửi. Nhóm `test` hoặc tên có chữ "test" → `test`, còn lại `task` | `test`/`task` | 'Test "unit" fail (mã 1)' · `{exitCode, name}` |
| extension `vscode.git` (`getAPI(1)`), `repository.state.onDidChange` | `HEAD.commit` đổi **và commit mới có cha = HEAD cũ** (checkout/reset/pull không tính); lần đầu thấy repo chỉ ghi mốc. Không có git extension / API lỗi → bỏ qua êm (ghi log) | `git` / `good` | "Commit abc1234: <dòng đầu message, cắt 80>" · `{commit}` |

Mỗi notice gửi **thành công** hiện một dòng nhỏ "👁 …" trong chatroom (textContent). Gửi lỗi (bridge chưa nối) → chỉ ghi log.

**Gen phản ứng thế nào**: phản xạ trong trình duyệt (`src/behavior/phan-xa.ts`) emote nhẹ cho `test`/`task`/`git`/`diag`
`good`/`bad` (vui · bối rối · thành công · suy nghĩ), chỉ khi Gen rảnh, không giữa cuộc nói chuyện, cách nhau ≥ 20 s;
`save` và mọi `info` → không làm gì. Driver não (`nao-agy`/`nao-local`) chỉ nghĩ cho `test`/`task`/`git` `good`/`bad`, gộp 800 ms
thành một lượt "Sếp vừa …", cách nhau ≥ 60 s; câu Sếp đang gộp/đang chờ/đang chạy → bỏ sự kiện IDE. Lưu file không bao giờ gọi LLM.

**Riêng tư (bất biến)** — KHÔNG BAO GIỜ gửi: nội dung file, đường dẫn tuyệt đối (chỉ `asRelativePath(uri, false)` của file
`file:` nằm trong một workspace folder; bỏ `.git/`, `node_modules/`, `..`, file ngoài workspace, untitled), message của
diagnostics (chỉ **đếm**), biến môi trường. Đường repo git chỉ làm khoá nội bộ. Sân khấu còn tự chặn `data` không phẳng /
chuỗi > 120 ký tự / `summary` > 200 ký tự. Workspace **chưa tin cậy → không gửi gì**. MCP của não gọi `stage_notice` bị từ
chối (não không được giả giác quan).

## Cấu hình

| Khoá | Mặc định | Ghi chú |
| --- | --- | --- |
| `genStage.root` | `""` | Repo Gen-Stage. **scope `machine`** — chỉ đặt ở User settings, workspace không ghi đè được. Trống = workspace folder có `bridge/server.ts`, rồi thư mục cha của extension; root **tự dò** phải được xác nhận (hộp thoại modal) một lần, nhớ theo workspace (`workspaceState`), trước khi tự bật tiến trình. |
| `genStage.bridgePort` | 8787 | ws bridge (truyền cho bridge qua `GEN_STAGE_PORT` khi tự bật) |
| `genStage.ttsPort` | 8788 | TTS (`GEN_STAGE_TTS_PORT`) |
| `genStage.devPort` | 5173 | vite |
| `genStage.tuBat` | `true` | Cổng trống thì tự bật bridge/vite |
| `genStage.pnpm` | `pnpm` | **scope `machine`**. Chỉ nhận **tên lệnh** (tìm trong các thư mục *tuyệt đối* của PATH — bỏ qua `.`/mục rỗng) hoặc **đường dẫn tuyệt đối**; đường dẫn tương đối bị từ chối. Đặt đường dẫn tuyệt đối nếu PATH của VS Code không thấy nvm/corepack |
| `genStage.nao` | `tat` | **scope `machine`** (V1). `local` = `pnpm nao-local`, `agy` = `pnpm nao`, `tat` = không bật. Giá trị lạ = `tat`. Driver nối bridge `genStage.bridgePort` qua `GEN_STAGE_PORT` |
| `genStage.sttPort` | 8790 | **scope `machine`** (V2). Cổng `POST /stt` của bridge → `tai-nghe --stt-port` |
| `genStage.mcpPort` | 8789 | **scope `machine`**. Cổng MCP HTTP của bridge do extension tự bật (`GEN_STAGE_MCP_PORT`). Đổi khi đã có bridge khác giữ 8789 (cổng bận thì bridge chỉ tắt MCP, ws + giọng vẫn chạy) |
| `genStage.giacQuan.batTat` | `true` | **scope `window`** (V3). Tắt = không gửi notice nào |
| `genStage.giacQuan.save` / `.diag` / `.test` / `.git` | `true` | **scope `window`** (V3). Tắt từng loại; `.test` tắt cả task lẫn test. Đọc lại mỗi lần gửi (tắt giữa lúc đang gộp → mẻ đó bỏ) |
| `genStage.taiNghe.nguon` | `""` | **scope `machine`**, có trong `restrictedConfigurations` (V2). Nguồn thu → `--nguon` (vd tên nguồn trong `pactl list short sources`). Trống = tai-nghe tự dò. Bắt đầu bằng `-`, có ký tự điều khiển hoặc > 200 ký tự → bỏ qua (tự dò) + ghi log |

### Workspace trust

`capabilities.untrustedWorkspaces = { supported: "limited", restrictedConfigurations: ["genStage.pnpm", "genStage.root", "genStage.nao", "genStage.taiNghe.nguon"] }`.
Chọn `limited` (không phải `false`) vì ở Restricted Mode extension vẫn có ích và vô hại: xem sân khấu + chatroom
với bridge/vite Sếp đã tự bật. Thứ nguy hiểm duy nhất — **tự spawn tiến trình** — bị khoá khi
`!vscode.workspace.isTrusted` (panel hiện lý do; driver não cũng vậy); tin cậy workspace xong thì tự dò lại. `genStage.pnpm`/`root`/`nao`
khai `scope: "machine"` nên một repo lạ không thể cài `.vscode/settings.json` trỏ `pnpm` tới script của nó.
Giác quan IDE (V3) kiểm `isTrusted` **mỗi lần gửi**: Restricted Mode thì không gửi notice nào (setting `genStage.giacQuan.*` là scope `window`, vô hại — chỉ tắt bớt được).

### Sổ PID + log

- Nằm trong **`globalStorageUri`** của extension (Linux: `~/.config/Code/User/globalStorage/gen-labs.gen-stage-vscode/`),
  **không** ghi gì vào repo: `tien-trinh.json` (quyền 600) và `logs/<bridge|vite>-<cổng>.log`. Đường dẫn sổ in ở dòng
  `[khởi động] sổ tiến trình: …` trong "Gen-Stage: Xem nhật ký".
- stdout/stderr con ghi **thẳng vào file log qua fd** (không pipe): extension host chết thì con không chết theo vì
  EPIPE. Host tail file đó ra OutputChannel.
- Mỗi mục sổ: `pid`, `starttime` (field 22 `/proc/<pid>/stat`), `boot_id`, `root`, và **chủ sở hữu** = PID +
  starttime của extension host đã bật. Nhận lại quyền (CNS-012) chỉ khi **tất cả** đúng: pid > 1 và không phải chính
  mình, cùng `boot_id`, starttime khớp (chống PID tái sử dụng), là trưởng nhóm, `/proc/<pid>/cwd` = root, argv khớp
  chữ ký tính **từ mã** (`<pnpm> bridge` / `<pnpm> exec vite --host 127.0.0.1 --port <devPort> --strictPort` — không
  tin chuỗi nào trong file), **và cửa sổ chủ cũ đã chết**.
- **Nhiều cửa sổ VS Code**: sổ dùng chung (globalStorage). Cửa sổ không phải chủ chỉ **dùng lại** dịch vụ, không bao
  giờ tắt; nếu chủ đang bật dở (cổng chưa lên) thì cửa sổ kia chờ chứ không bật đôi. Chủ đóng/chết → cửa sổ kế tiếp
  dò cổng sẽ nhận lại quyền.

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
pnpm -C vscode test      # build + node:test (68 test; V2 thêm 20 trong test/giong.test.mjs: tai-nghe GIẢ test/gia/scripts/tai-nghe.mjs
                         #   + bridge ws giả 8930 (đổi gốc: `GEN_STAGE_TEST_CONG`) — giữ-thả gửi `dung`, phím bật/tắt VAD, --to = đang chọn, daGui:false → Gửi →
                         #   stage.hear text đã sửa/to lúc thu, bo-qua gen-dang-noi, lỗi thiết bị mã 2, nút tắt khi Gen nói, huỷ = `huy`
                         #   rồi SIGKILL cả nhóm sau 2 s, epTat, token qua env, mã 130, cổng an toàn trust/root.
                         #   Còn lại (V0/V1): CSP/HTML/nonce, vỏ bỏ qua tin từ iframe, sự kiện→dòng chat,
                         #   chọn người nghe, dò cổng với server thật, bật/nhận lại/tắt NHÓM tiến trình bằng pnpm giả,
                         #   sổ PID độc (0/-1/1/chính mình/PID tái sử dụng/dauHieu rỗng), race batNeuCan, nhiều cửa sổ,
                         #   bật hỏng thoát sớm, ws client với bridge giả + nhịp tim treo; V1: vỏ gửi lại tin nền khi
                         #   iframe load, renderMode/não trong chatroom, driver não bằng pnpm giả: bật/giữ/đổi/tắt,
                         #   gọi chồng → một driver, driver ngoài cùng cổng → không bật, nhận lại khi chủ chết)
node scripts/kiem-nen.mjs      # V1 INT-06: vite THẬT 5213 + vỏ panel THẬT trong Chromium → fps thường/nền (visibility, blur,
                               # postMessage vỏ), durationMs moveTo ở nền ±10 %, cổng bỏ khung trên rAF thật
                               # → docs/v1/nhat-ky-kiem-nen.json
node vscode/test/chup-v2.mjs   # V2: chatroom THẬT trong Chromium + host đã build + tai-nghe giả (cổng 8935–8937), BẤM THẬT nút 🎤 →
                               # docs/vscode-v2/ 01-dang-nghe, 02-cho-xac-nhan, 03-loi-thiet-bi, 04-mic-tat-khi-gen-noi + nhat-ky-chup-v2.json
node scripts/kiem-vscode.mjs   # V0-3/V0-4: bridge + vite THẬT ở cổng riêng 8850-8854/5203, vỏ panel + chatroom trong
                               # Chromium với acquireVsCodeApi giả → ảnh + nhật ký vào docs/vscode-v0/; kiểm iframe
                               # sandbox vẫn chạy WebGL/Web Audio/localStorage/fetch/ws/form ô chat
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

**Bước 0 — một lệnh, tự động (≈ 5–10 phút):** `pnpm kiem:vscode` (cần `pnpm assets` + `bash scripts/fetch-anim.sh` trước).
Nó tải một VS Code stable riêng vào `.cache/kiem-vscode/` (không đụng VS Code đang cài), cài extension, mở sân khấu, bấm thật
lưu file / lỗi biên dịch / task / git (repo tạm), rồi in OK/FAIL từng bước — 19 bước, đã qua 19/19 trên cloud (VS Code 1.143.1).
Kết quả: `docs/e2e/vscode-that.json` + ảnh chatroom có dòng 👁 `docs/e2e/vscode-v3-chatroom.png`. Dán số OK/FAIL vào PR là đủ cho
phần tự động; các mục dưới là phần **mắt/tai** máy không tự kiểm được.

Điều kiện đầu: **không** tab Gen-Stage nào khác đang mở (Firefox), **không** chạy `pnpm start` song song (CNS-002).

1. **V0-5** F5 → "Mở sân khấu" → tab nằm cạnh file `.ts` (split). Chụp màn hình. Ghi bản VS Code (`Help → About`) và dòng `[khởi động] node … · WebSocket: …` trong "Gen-Stage: Xem nhật ký".
2. **V0-6** Chuyển tab 10 lần → log bridge **không** thêm dòng "sân khấu đã nối", cảnh không reset.
3. **V0-7** Gõ ở ô chat *trong sân khấu* → chatroom hiện câu đó ≤ 500 ms. Gõ ở *chatroom* (chọn Gen) → Javis nói, Gen đáp. **Chọn Javis** rồi gõ "đi tới bàn điều khiển" (không gọi tên) → **Javis** đi, Gen không đi; chọn Javis gõ câu tự do → Javis đáp "chưa hiểu", não Gen không trả lời (CNS-001/021).
4. **V0-8** `ss -ltn | grep -E '8787|5173'` trước/sau khi đóng VS Code: extension tự bật thì cổng rảnh; bridge bật sẵn từ trước thì vẫn sống.
5. **V0-9** Process Explorer: CPU/GPU/RAM khi tab hiện+focus / hiện+không focus / ẩn; gửi một câu từ chatroom lúc tab sân khấu ẩn — đo độ trễ (chatroom sẽ cảnh báo "lệnh sẽ chờ").
6. **V1-nền** Bấm sang file code (panel vẫn hiện, mất active) → chatroom hiện "chế độ nền"; Process Explorer: GPU của webview giảm rõ so với lúc panel active. **Bấm vào chatroom gõ** → xem dòng `[sân khấu] visible=… active=…` trong nhật ký: nếu `active=false` khi focus ở chatroom thì sân khấu nền trong lúc chat (chấp nhận được, hoặc báo Gen đổi luật).
7. **V1-não** Đặt `genStage.nao` = `local` (User settings) → nhật ký "bật nao: … nao-local", chatroom "Não: đã nối · local"; đổi sang `agy` → driver cũ tắt (`pgrep -af nao-` chỉ còn một), đổi `tat` → không còn driver nào do VS Code bật.

8. **V2-giữ** Chọn **Gen** ở chatroom, giữ 🎤 nói "Gen ơi, hôm nay làm gì" rồi thả → chatroom: "Đang mở micro…" → "Đang nghe…" (vạch mức
   nhảy theo giọng) → "Đang nhận dạng…" → câu hiện với nhãn "nói", Gen đáp. Ghi độ trễ từ lúc nhấn tới lúc vạch nhảy (gồm khởi động
   `pnpm exec node` + ffmpeg) và từ lúc thả tới lúc câu hiện.
9. **V2-người nghe** Chọn **Javis**, giữ 🎤 nói "đi tới bàn làm việc" → Javis đi (không phải Gen) (INT-02).
10. **V2-phím** Con trỏ đang trong file `.ts`, bấm `Ctrl+Alt+Space`, nói, im → tự dừng sau ~1,2 s; lần nữa bấm hai lần (bắt đầu/dừng).
    Kiểm *Keyboard Shortcuts*: `Ctrl+Alt+Space` không trùng phím nào khác của Sếp; GNOME không nuốt phím đó.
11. **V2-bán song công** Trong lúc Gen đang nói: nút 🎤 xám, di chuột thấy "Gen đang nói — đợi nói xong"; bấm phím → "Bỏ qua: nhân vật đang nói".
12. **V2-lỗi** Đặt `genStage.taiNghe.nguon` = `khong-co-mic` → giữ 🎤 → chatroom đỏ "Lỗi micro…" + gợi ý ffmpeg/PipeWire. Xoá setting.
13. **V2-dọn** Giữ 🎤 rồi (vẫn giữ) bấm `Ctrl+Shift+P` → *Developer: Reload Window*; sau reload `pgrep -af tai-nghe` rỗng, `pactl list short
    source-outputs` không còn ffmpeg nào đang giữ mic.
14. **V2-tin cậy thấp** Nói lí nhí/xa mic → nếu tin cậy < 60 % thì ô sửa hiện câu; sửa chữ → Gửi → câu đã sửa tới đúng người đang chọn lúc nói.

15. **V3-lưu** Sửa + lưu 2 file `.ts` trong 5 s → chatroom một dòng "👁 Lưu 2 file: src/a.ts, src/b.ts" (đường tương đối, KHÔNG
    `/home/...`); Gen không phản ứng, não không chạy (nhật ký driver không có dòng `IDE:`). Lưu `settings.json` của User → không có dòng 👁.
16. **V3-lỗi** Gõ sai một dòng TS → ~3 s sau "👁 Có 1 lỗi biên dịch", Gen emote suy nghĩ (nếu rảnh); sửa lại → "👁 Hết lỗi biên dịch".
    Gõ liên tục không được ra nhiều dòng.
17. **V3-test** Tạo task `npm test`/`pnpm test` (nhóm test) làm hỏng một test rồi chạy (*Tasks: Run Test Task*) → "👁 Test … fail (mã 1)",
    Gen bối rối; bật `genStage.nao` → Gen nói một câu có ngữ cảnh (nhật ký driver: `IDE: «Sếp vừa chạy test — hỏng: …»`). Sửa, chạy
    lại trong vòng 60 s → 👁 vẫn hiện nhưng não KHÔNG chạy lượt nữa (ghi "chưa đủ 60 s").
18. **V3-git** Commit từ Source Control → "👁 Commit abc1234: <dòng đầu>"; checkout nhánh khác → KHÔNG có dòng commit.
19. **V3-tắt/trust** Đặt `genStage.giacQuan.batTat=false` → lưu/test không ra 👁. Mở một thư mục ở Restricted Mode → không ra 👁.

## Giới hạn đã biết

- V3 **chưa kiểm trên VS Code thật** (checklist 15–19): `onDidEndTaskProcess` chỉ bắn cho task có tiến trình (shell/process) —
  test chạy bằng Test Explorer/terminal tay KHÔNG được thấy; pull/merge commit nhiều cha chỉ tính khi cha có HEAD cũ.

- **Webview không có mic** (vscode#250568/#323602) → V2 thu bằng tiến trình `scripts/tai-nghe.mjs` ngoài webview (mục "Giọng nói").
- V2 **chưa kiểm trên VS Code thật** (checklist 8–14): độ trễ khởi động `pnpm exec node` + ffmpeg trước khi thu, phím `Ctrl+Alt+Space`
  có trùng gì trên máy Sếp không, `<viewId>.focus` có mở đúng chatroom ở cột phải không.
- tai-nghe cần **Node ≥ 22.18** trong PATH của VS Code; Node cũ → lỗi "tai-nghe từ chối chạy" + gợi ý (mã 64).
- **Tin "ẩn" không tới được webview đang ẩn**: VS Code tạm dừng script của panel ẩn và không giao `postMessage` cho nó; tin có ích là `active=false` khi panel vẫn hiện nhưng mất focus — app nghe tin này từ V1 (chế độ nền).
- **Chưa kiểm trong VS Code thật**: `active` có về `false` khi focus sang chatroom (Secondary Side Bar) hay không — nếu có, sân khấu chạy nền cả lúc Sếp đang chat (checklist V1-nền).
- Lệnh gửi lúc tab sân khấu ẩn có thể chờ tới khi hiện lại / hết hạn 30 s của bridge (CNS-003) — chưa đo (V0-9).
- Chọn **Javis** (owner) làm người nghe thì câu gửi là `actor.say {actor:"owner", to:"owner"}` — Javis tự nói với chính mình; lớp hiểu lệnh xử lý câu lệnh, câu tự do thì theo luật C2.
- Cổng MCP (8789) không có trong cấu hình (tự bật bridge thì dùng mặc định). Cổng STT có `genStage.sttPort` (V2): tự bật bridge thì truyền `GEN_STAGE_STT_PORT`; app trong iframe vẫn gọi `/stt` ở 8790 (không dùng được trong webview — không có mic).
- Remote/Codespaces không hỗ trợ (`portMapping` không ánh xạ `ws://`).
- Chỉ Linux (đọc `/proc`, kill nhóm tiến trình).
- Serializer (khôi phục tab sân khấu sau khi mở lại VS Code): để V1.
