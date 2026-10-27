# INT-07 — Đội ngũ agent hiện hình trên sân khấu

Ryan 27/10: *"trong VS Code bạn cũng phải phân được ai là quản lý kỹ sư trưởng, ai là nhân viên subagent và nó được
sinh ra thể hiện thế nào trong quá trình làm việc tương ứng"*. Nguồn: **cả hai** (Claude Code trước, não local dùng
lại cùng giao thức).

## Ai là ai

| Vai | Trên sân khấu | Thẻ tên |
| --- | --- | --- |
| Kỹ sư trưởng (agent chính của phiên) | **Nhi** — giao việc từ bàn điều phối (`ghe-2`) | cam: `Nhi · Kỹ sư trưởng` |
| Nhân viên (mỗi subagent) | búp bê mới vào từ cửa, làm ở khu theo vai | xanh: `<vai> · <việc>` |
| Sếp | **Nam** | xám: `Nam · Sếp` |

## Vòng đời một subagent

1. **Giao việc** (`team.event spawn`) → nhân viên xuất hiện ở cửa; Nhi nhìn sang, đang rảnh thì về ngồi bàn điều phối.
2. **Vào chỗ** → đi tới khu theo vai, ngồi ghế trống (`cho-kt-1`, `cho-kt-2`, `cho-kd-1`, `ghe-1`) hoặc đứng ở chỗ làm.

   | Vai (`subagent_type`) | Khu |
   | --- | --- |
   | builder · debugger · tester · shipper · general-purpose | Kỹ thuật |
   | designer · scribe | Thiết kế |
   | researcher · strategist · scout · Explore | Kinh doanh |
   | reviewer · architect · cortex · oracle · Plan (và mọi `*review*`) | Phòng họp |

3. **Xong** (`done`) / **hỏng** (`fail`) → đứng dậy, tới cạnh bàn Nhi nộp kết quả (emote `thanh-cong` / `boi-roi`),
   Nhi gật (`dong-y`) / nghĩ (`suy-nghi`), rồi nhân viên ra cửa và rời sân khấu.

Tối đa **6 nhân viên** cùng hiện (mỗi người là một VRM chạy ẩn — L-42); quá thì đếm vào `khongHien`.

## Nối Claude Code (hook)

Thêm vào `~/.claude/settings.json` (hoặc `.claude/settings.local.json` của dự án đang code), sửa đường dẫn:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Task|Agent", "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }
    ],
    "PostToolUse": [
      { "matcher": "Task|Agent", "hooks": [{ "type": "command", "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }
    ]
  }
}
```

- Cần `pnpm bridge` đang chạy (cổng `GEN_STAGE_PORT`, mặc định 8787; bridge bật token thì đặt `GEN_STAGE_TOKEN`).
- Hook **không bao giờ chặn Claude Code**: luôn thoát 0, không in stdout, hạn 1,5 s; bridge tắt thì lặng lẽ bỏ qua
  (`GEN_STAGE_DOI_NGU_LOG=1` để ghi lý do ra stderr).
- Chỉ gửi **vai + mô tả ngắn** (`description`, ≤ 120 ký tự). Prompt và kết quả của subagent **không** rời máy hook.

## Não local (Ollama)

Cùng một lệnh: driver gửi `team.event { kind, id, role, task, source: "nao-local" }` qua ws bridge khi nó giao việc
cho một nhân viên. Não local hiện chưa tự chia việc cho subagent — khi có, chỉ cần gửi đúng lệnh này.

## Bằng chứng

- Test: `src/api/__tests__/int07-doi-ngu.test.ts` (vòng đời, thẻ tên, Nhi về bàn, chỗ làm trên vật cản thật),
  `scripts/__tests__/bao-doi-ngu.test.mjs` (dịch JSON hook, tiến trình hook thật với bridge giả/bridge tắt).
- Trình duyệt (Chromium swiftshader): 4 subagent (builder, code-reviewer, researcher, designer) vào đúng 4 khu, 3/3
  ngồi đúng ghế; builder `done` + reviewer `fail` → nộp rồi rời sân khấu, 2 người còn lại vẫn làm (`kiem.json`).
  Ảnh: `dang-lam.jpg`, `can-canh-ky-thuat.jpg`.
