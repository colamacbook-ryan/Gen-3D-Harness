# Cài Gen-Stage vào VS Code — một lệnh + kiểm 5 phút

## Cần có

| Thứ | Bản | Không có thì |
| --- | --- | --- |
| Node | ≥ 22.18 | script dừng, nói cách cài |
| pnpm | bất kỳ | `npm i -g pnpm` |
| VS Code + lệnh `code` | ≥ 1.106 | trong VS Code: `Ctrl+Shift+P` → "Shell Command: Install 'code' command in PATH" |
| ffmpeg | — | chưa nói bằng mic được; gõ chat vẫn chạy |
| Ollama + `qwen2.5:7b` | — | chưa có não LLM local; Nhi vẫn đáp câu có sẵn |

## Cài

```bash
cd <thư mục repo Gen-3D-Harness>
bash scripts/cai-vscode.sh          # hoặc: pnpm cai:vscode
bash scripts/cai-vscode.sh --hook   # + đội ngũ agent khi dùng Claude Code (khuyên dùng)
```

Lần đầu mất vài phút, vì phải tải asset 3D và model giọng khoảng 930 MB. Các lần sau chỉ build lại và cài lại, chừng 30 giây.
Chạy lại bao nhiêu lần cũng được, bước nào đã đủ thì script bỏ qua.

Script làm sáu việc:

1. Kiểm máy.
2. Cài lõi bằng `scripts/cai-dat.sh`.
3. Build extension.
4. Đóng gói `dist/gen-stage-vscode-<bản>.vsix`.
5. Cài vào VS Code.
6. Ghi chỗ đặt repo vào `~/.config/gen-stage/root`, để extension tìm thấy sân khấu ở **mọi dự án**, không phải đặt setting.

`--hook` gắn thêm 8 hook vào `~/.claude/settings.json`:
- có sao lưu trước khi ghi;
- chỉ thêm đúng mục của Gen-Stage, không đụng hook khác của anh.

## Kiểm 5 phút

1. **Tải lại VS Code** (`Ctrl+Shift+P` → "Developer: Reload Window"), mở **dự án bất kỳ**.
2. `Ctrl+Shift+P` → **"Gen-Stage: Mở sân khấu"**.
   - Văn phòng búp bê hiện trong một tab; lần đầu chờ khoảng 10–20 s, vì extension tự bật bridge + vite.
   - Thấy thẻ **"Nhi · Giám đốc kỹ thuật"** và **"Nam · CEO"** ở Ban giám đốc dưới logo.
3. `Ctrl+Alt+B` mở cột phải, bấm biểu tượng **Gen-Stage**: chatroom ghi "Bridge: đã nối · Sân khấu: đã nối".
   - Gõ **"Nhi ơi, chào em"** → Nhi quay lại và đáp.
4. Lưu một file, hoặc chạy một task test: chatroom hiện dòng **👁** và Nhi phản ứng.
5. (Nếu cài `--hook`) mở **phiên Claude Code mới**, giao một việc cần subagent. Trên sân khấu sẽ thấy:
   - Nhi lên bàn CEO nhận việc;
   - nhân viên búp bê vào cửa, Nhi họp nhóm, biên bản họp hiện trên màn phòng họp;
   - nhân viên nộp bài, Nhi đóng dấu ✔, rồi báo cáo CEO;
   - chatroom có các dòng 📋.

Bước 1–3 đã chạy tự động trên VS Code 1.143.1 thật, trong một thư mục **không phải** repo, không đặt `genStage.root`:
`scripts/kiem-cai-vsix.mjs`, kết quả ở `docs/e2e/cai-vsix.json` và `docs/e2e/cai-vsix-chatroom.png`.

Lượt kiểm 28/10 chạy trên máy sạch:
- cổng 8787 / 5173 trống trước khi chạy;
- thư mục extension và user-data mới tinh;
- `CLAUDE_CONFIG_DIR` tạm, có sẵn một setting cũ (`theme`) để chắc hook không xoá setting của anh.

Kết quả:
- **Cài:** 25 s khi lõi đã cài; lần đầu cài cả lõi là 1 phút 36 s.
- **Mở sân khấu:** sân khấu lên sau 21 s kể từ lúc bấm lệnh.
- **Hook:** setting `theme` cũ còn nguyên, có đủ 8 mốc hook.
- **Repo trỏ qua đường dẫn có khoảng trắng** (`…/Games 3d/Gen-3D-Harness`): đạt 6/6.
- **VS Code bị giết đột ngột:** bridge và vite vẫn sống. Cửa sổ VS Code mở sau **nhận lại** hai dịch vụ đó (log ghi `nhận lại bridge … chủ cũ đã tắt`) và tắt sạch được.

Chưa kiểm được trên cloud:
- **Giọng Edge TTS:** proxy của container chặn, sân khấu rơi về nhép miệng theo chữ.
- Mic thật, GPU thật, Ollama, hook trong một phiên Claude Code thật.

## Bật thêm

- **Não local:**
  1. `ollama pull qwen2.5:7b`.
  2. Settings → `genStage.nao` = `local`.
  3. Hỏi "Nhi ơi, hôm nay mình làm gì?".
  4. Giao việc thật ("Nhi viết giúp anh bộ test cho …") để thấy Nhi chia việc cho nhân viên, duyệt bài, báo cáo.
- **Giọng nói:** cần ffmpeg. Bấm 🎤 trong chatroom, hoặc `Ctrl+Alt+Space`, rồi nói "Nhi ơi, mở màn hình".

## Lỗi hay gặp

| Thấy | Làm |
| --- | --- |
| "Chưa tìm thấy repo Gen-3D-Harness" | bấm **Chọn thư mục repo** trên thông báo, hoặc chạy lại `bash scripts/cai-vscode.sh` |
| Tab sân khấu trắng / "Đang nạp nhân vật…" mãi | "Gen-Stage: Xem nhật ký"; cổng 8787/5173 bị chương trình khác giữ thì đổi `genStage.bridgePort` / `genStage.devPort` |
| Không có tiếng | bấm "🔊 Bật tiếng" trên sân khấu (trình duyệt chặn tiếng tới cú bấm đầu tiên) |
| Workspace "Restricted Mode" | tin cậy workspace — extension không tự bật tiến trình trong workspace chưa tin |

## Gỡ

```bash
code --uninstall-extension gen-labs.gen-stage-vscode
node scripts/gan-hook-claude.mjs --go      # gỡ hook Claude Code (chỉ mục của Gen-Stage)
rm ~/.config/gen-stage/root
```
