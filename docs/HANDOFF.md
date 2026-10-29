# HANDOFF — chạy MVP trên MÁY THẬT của Ryan (29/10)

> Phiên cloud trước (Gen) đã làm xong và kiểm hết những gì kiểm được trên cloud. Phần còn lại **chỉ làm được trên máy
> Ryan**. File này đủ để một phiên mới, chạy NGAY TRÊN MÁY RYAN, tiếp quản mà không cần đọc lại lịch sử chat.

## 1. Đang ở đâu

- Repo `colamacbook-ryan/Gen-3D-Harness`, nhánh **`claude/magical-thompson-oatx60`** (đỉnh `4af7fb4` lúc viết file
  này), PR draft **#1** (V0–V3 + E2E + Bàn duyệt). Chưa merge.
- Bộ não (SSOT): repo `colamacbook-ryan/Second-Brain`, dự án `01-projects/gen-stage-vscode/` (`INTENT.md`,
  `STATUS.md`, `LOG.md`). Second-Brain ghi thẳng `main`.
- Đã có: sân khấu 3D văn phòng búp bê (Nhi = Giám đốc kỹ thuật, Nam = CEO = avatar của Ryan) · extension VS Code
  (sân khấu trong tab + chatroom) · não agy / não local Ollama · giọng Edge TTS · tai nghe PhoWhisper · giác quan IDE ·
  đội ngũ agent hiện hình qua hook Claude Code · **Bàn duyệt** (`duyet.html`: Ryan ký/trả lại báo cáo của đội agent,
  đếm token).

## 2. Đã kiểm trên cloud (đừng làm lại)

| Mục | Kết quả |
| --- | --- |
| `pnpm test` | 807/807 |
| `pnpm -C vscode test` | 85/85 |
| `pnpm build` | sạch |
| Cài `.vsix` vào VS Code 1.143.1 thật, thư mục không phải repo (`scripts/kiem-cai-vsix.mjs`) | 6/6 — cả máy sạch, đường có khoảng trắng, VS Code chết đột ngột |
| E2E VS Code thật (`pnpm kiem:vscode`) | đạt, kể cả với cửa Origin của bridge |
| Bàn duyệt (`node scripts/kiem-ban-duyet.mjs`) | 12/12, 4 lượt liền |

## 3. CHƯA kiểm được — việc của phiên này

Cloud không có những thứ này, nên đây là lý do phải chạy trên máy thật:

1. **Giọng Edge TTS thật** (proxy cloud chặn): Nhi/Nam nói có tiếng, nhép miệng theo tiếng.
2. **GPU thật**: sân khấu mượt (`?fps=1` để đo), không giật khi lái Nam bằng WASD.
3. **Tab sân khấu bị che trong VS Code**: khung hình có ngừng không? (Rủi ro đã giảm bằng "giấy tờ trước, diễn sau" —
   báo cáo vẫn phải vào Bàn duyệt dù tab bị che. Kiểm điều đó.)
4. **Hook Claude Code thật** → đội agent hiện hình + Bàn duyệt có báo cáo chờ ký + token đúng.
5. **Mic + PhoWhisper với giọng Ryan** (cần Ryan nói).
6. **Ollama qwen2.5:7b** (nếu máy có) — `pnpm nao-local`.
7. Workspace Trust của VS Code với giác quan IDE.

## 4. Các bước

```bash
git fetch origin && git checkout claude/magical-thompson-oatx60 && git pull
git fetch genstage main 2>/dev/null && git log --oneline HEAD..genstage/main   # lệ đồng bộ (CLAUDE.md); có commit mới thì hỏi Ryan trước khi gộp
bash scripts/cai-vscode.sh            # CHƯA --hook
```

1. Mở VS Code ở một dự án bất kỳ → "Gen-Stage: Mở sân khấu". Kiểm mục 3.1–3.3. Gõ ở chatroom vài câu.
2. **HỎI RYAN TRƯỚC** rồi mới `bash scripts/cai-vscode.sh --hook` — nó sửa `~/.claude/settings.json` (script tự
   backup, chỉ thêm mục của mình). Cho Ryan xem diff trước/sau.
3. Trong một phiên Claude Code thật, giao một việc có dùng subagent (Task/Agent) → xem sân khấu: nhân viên vào cửa,
   họp/nhận phiếu, nộp bài, Nhi báo cáo. Mở "Gen-Stage: Mở Bàn duyệt" → báo cáo nằm ở "Cần anh quyết", có token.
   Để Ryan tự bấm **Ký duyệt** và một lần **Trả lại** (có góp ý).
4. Che tab sân khấu (chuyển sang tab file khác) trong lúc đội đang làm → báo cáo vẫn phải vào Bàn duyệt.
5. Nhờ Ryan giữ 🎤 nói 5–10 câu (gọi "Nhi ơi…", "Nam đi tới…"). Ghi câu nghe sai.
6. Có Ollama thì thử não local (`docs/e2e/NAO-LOCAL-SO-SANH.md`).

## 5. Ghi kết quả

- Bằng chứng (ảnh nén ≤1280 px, log) vào `docs/e2e/may-ryan/` + bảng `docs/e2e/may-ryan/KET-QUA.md`: mục · đạt/không ·
  số đo · lỗi nguyên văn. **Không đạt thì ghi không đạt**, không làm đẹp số.
- Lỗi tìm ra: sửa trên cùng nhánh (chạy `pnpm test` + `pnpm build` trước khi đẩy), commit tiếng Việt.
- Đẩy nhánh; cập nhật PR #1. Mọi thứ đạt và Ryan đồng ý → chuyển PR ra khỏi draft để Ryan merge.
- Cập nhật Second-Brain (`STATUS.md` + `LOG.md` của `gen-stage-vscode`; lỗi vận hành → `claude/memory/lessons.md`).

## 6. Luật không được quên

- Không secrets vào git; token bridge đi qua env `GEN_STAGE_TOKEN`, không argv.
- Hỏi Ryan trước khi: xoá, sửa cấu hình ngoài repo (`~/.claude/settings.json`), chi tiền, gửi tin ra ngoài.
- Không `git push --force`, không `git stash` trần, không `pkill`/`killall` (giết theo PID, `chay.sh tat`).
- Firefox thật: một phiên một lúc, kiểm bằng `pgrep -f '^[^ ]*firefox-1543/firefox/firefox'`.
- Đang chạy script kiểm trình duyệt thì không sửa `src/` (Vite HMR tải lại trang).
- Hook không bao giờ được chặn Claude Code, không gửi prompt/kết quả/lệnh/đường dẫn.
- Giao tiếp tiếng Việt, thuật ngữ tiếng Anh, có 💡 Teach moment khi Ryan có thể chưa hiểu.
