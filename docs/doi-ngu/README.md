# INT-07 — Đội ngũ agent hiện hình trên sân khấu

Ryan 27/10: *"trong VS Code bạn cũng phải phân được ai là quản lý kỹ sư trưởng, ai là nhân viên subagent và nó được
sinh ra thể hiện thế nào trong quá trình làm việc tương ứng"*. Nguồn: **cả hai** (Claude Code trước, não local dùng
lại cùng giao thức).

> **Quy trình đầy đủ (pha, luật bắt buộc, sổ biên bản / dấu kiểm nhận): [`QUY-TRINH.md`](QUY-TRINH.md).**

## Ai là ai

| Vai | Trên sân khấu | Thẻ tên |
| --- | --- | --- |
| CEO (Ryan) | **Nam** — bàn riêng `ban-ceo`, ghế `ghe-ceo` | xanh đậm: `Nam · CEO` |
| Giám đốc kỹ thuật = kỹ sư trưởng (agent chính) | **Nhi** — bàn riêng `ban-dieu-khien`, ghế `ghe-2` | cam: `Nhi · Giám đốc kỹ thuật` (+ việc đang làm) |
| Nhân viên (mỗi subagent) | búp bê vào từ cửa, chờ giao việc, làm ở khu theo vai | xanh: `<vai> · <việc>` → `✔ ĐÃ KIỂM NHẬN` |

Khu theo vai (`subagent_type`):

| Vai | Khu |
| --- | --- |
| builder · debugger · tester · shipper · general-purpose | Kỹ thuật |
| designer · scribe | Thiết kế |
| researcher · strategist · scout · Explore | Kinh doanh |
| reviewer · architect · cortex · oracle · Plan (và mọi `*review*`) | Phòng họp |

Tối đa **6 nhân viên** cùng hiện (mỗi người là một VRM chạy ẩn — L-42); quá thì đếm vào `khongHien`.

## Nối Claude Code (hook)

Thêm vào `~/.claude/settings.json` (hoặc `.claude/settings.local.json` của dự án đang code), sửa đường dẫn:

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "PreCompact":       [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }]
  }
}
```

Chỉ muốn thấy subagent (bản tối giản v1): giữ `PreToolUse`/`PostToolUse` với `"matcher": "Task|Agent"`.

- Cần `pnpm bridge` đang chạy (cổng `GEN_STAGE_PORT`, mặc định 8787; bridge bật token thì đặt `GEN_STAGE_TOKEN`).
- Hook **không bao giờ chặn Claude Code**: luôn thoát 0, không in stdout, hạn 1,5 s; bridge tắt thì lặng lẽ bỏ qua
  (`GEN_STAGE_DOI_NGU_LOG=1` để ghi lý do ra stderr).
- Chỉ gửi **vai + mô tả ngắn** (`description`, ≤ 120 ký tự) và **loại** việc (`doc`/`viet`/`test`…). Prompt, lệnh
  shell, đường dẫn file, nội dung thông báo và kết quả tool **không** rời tiến trình hook.
- Mỗi tool call là một tiến trình node ngắn (≈ 50–100 ms, không chặn); thấy chậm thì thu `matcher` lại.

## Não local (Ollama)

`pnpm nao-local` tự đi quy trình khi Sếp giao **việc** (không phải câu chuyện thường). Các bước: nhận việc → lập kế
hoạch (JSON) → giao việc cho tối đa 3 nhân viên → mỗi nhân viên một lượt model theo vai → Giám đốc duyệt từng bài
(đạt / trả lại làm lại một lần) → Nhi tổng hợp bài đã kiểm nhận → báo cáo CEO. Chi tiết trong `QUY-TRINH.md`.

## Bằng chứng

- Test:
  - `src/api/__tests__/int07-doi-ngu.test.ts`: vòng đời, thẻ tên, **luật quy trình**, **sổ biên bản / dấu**, chỗ
    làm và chỗ họp / báo cáo trên vật cản thật;
  - `scripts/__tests__/bao-doi-ngu.test.mjs`: đủ 10 mốc hook, phân loại tool, riêng tư, tiến trình hook thật;
  - `scripts/__tests__/nao-local.test.mjs`: chia việc → duyệt → làm lại → báo cáo, chạy với Ollama giả.
- Trình duyệt (Chromium swiftshader): 4 subagent (builder, code-reviewer, researcher, designer) vào đúng 4 khu, 3/3
  ngồi đúng ghế; builder `done` + reviewer `fail` → nộp rồi rời sân khấu, 2 người còn lại vẫn làm (`kiem.json`).
  Ảnh: `dang-lam.jpg`, `can-canh-ky-thuat.jpg`.
