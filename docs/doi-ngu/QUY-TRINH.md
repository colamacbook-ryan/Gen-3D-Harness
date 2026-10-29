# INT-07 — Quy trình làm việc của công ty agent

Ryan 27/10:

- *"Xác định 1 nhân vật CEO và 1 nhân vật Giám đốc (kỹ sư trưởng) — leader phải có bàn làm việc riêng."*
- *"Cách làm việc của agent cũng phải phối hợp theo quy trình thực sự, không phải tự ý ai muốn làm gì là tự làm."*
- *"Phải có cấp trên đóng dấu kiểm nhận, họp hành có biên bản, muốn làm gì cũng phải theo quy trình."*

Máy thi công: `src/behavior/doi-ngu.ts`. Test giữ giao kèo: `src/api/__tests__/int07-doi-ngu.test.ts`
(mục *quy trình* + *sổ quy trình*).

## Tổ chức

| Chức danh | Nhân vật | Chỗ ngồi riêng | Ai trong đời thật |
| --- | --- | --- | --- |
| **CEO** | Nam (`owner`), thẻ xanh đậm `Nam · CEO` | bàn `ban-ceo` dưới logo, ghế `ghe-ceo` | Ryan |
| **Giám đốc kỹ thuật** (kỹ sư trưởng) | Nhi (`gen`), thẻ cam `Nhi · Giám đốc kỹ thuật` | bàn `ban-dieu-khien`, ghế `ghe-2` | agent chính (Claude Code / não local) |
| **Nhân viên** | búp bê sinh theo việc, thẻ xanh `<vai> · <việc>` | ghế / chỗ đứng trong khu theo vai | mỗi subagent |

**Ban giám đốc** (Ryan: *"các lãnh đạo phải cho tựa lưng vào tường"*): hai bàn lãnh đạo nằm dọc tường bắc, dưới logo
GEN LABS. Ghế ở phía tường, người ngồi nhìn ra cả văn phòng (`facing 0`). Điểm ngồi z = −8,44: khung sàn chừa lề 0,5 m
tới tường, sâu hơn thì không đi tới được. Một **dãy tủ hồ sơ thấp áp tường** lấp khe phía sau, nên lưng ghế tựa vào tủ.
Test: *lãnh đạo ngồi LƯNG TỰA TƯỜNG*.

## Lễ nghi

Ryan: *"nhân viên đối với sếp phải cung kính, nói chuyện phải có bong bóng và emoji"*;
*"không thể người quay mà ghế không quay, nhân vật phải phân biệt được trước mặt và sau lưng"*.

- **Cúi chào cấp trên** (emote `cui-chao`, gập người khoảng 30° quanh hông): nhân viên chào Giám đốc khi nhận việc,
  khi họp và khi nộp bài; Giám đốc chào CEO khi nhận việc, báo cáo và xin duyệt. Người đang **ngồi** thì gật đầu.
  CEO không cúi chào cấp dưới, chỉ gật và đáp lời.
- **Nói = bong bóng + emoji** (bảng `LOI`, `actor.bubble`, không phát tiếng để không tranh giọng với não). Xưng hô
  đúng vai: nhân viên gọi Giám đốc là "chị", Giám đốc gọi CEO là "anh". Ví dụ một vòng nộp bài:

  | Ai | Câu |
  | --- | --- |
  | Nhân viên (cúi chào) | Em nộp bài ạ 📄 |
  | Nhi | Đạt! Đóng dấu kiểm nhận ✅ |
  | Nhân viên (cúi chào) | Em cảm ơn chị ạ 🙏 |

- **Người ngồi không xoay thân**: ghế là đồ tĩnh, nên `NhanVat.xoayVe` từ chối xoay khi đang ngồi. Đây là một chỗ chặn
  chung cho `turnTo`, `faceTo`, phản xạ và não. Muốn nhìn ai thì **quay đầu**: lớp búp bê quay đầu theo `lookAt`,
  tối đa ±60°.
- **Mặt trước khác sau lưng**: mặt có mắt, miệng, mái tóc, cổ áo, cà vạt / thẻ tên. Sau lưng là tóc phủ kín gáy, cổ
  áo sau và đường may sống lưng màu đậm hơn áo.

## Các pha

```
nghỉ → nhận việc → lập kế hoạch → giao việc → thực hiện → duyệt bài → báo cáo CEO → nghỉ
```

Pha đang chạy: `window.stage.doiNgu().pha`; mỗi lần đổi pha bắn sự kiện `team.phase`.

## Luật bắt buộc

| # | Luật | Máy ép thế nào |
| --- | --- | --- |
| 1 | Giám đốc làm từng việc một | mọi việc của Nhi đi qua MỘT hàng việc tuần tự (`hangTruong`): họp, duyệt, báo cáo không chồng nhau |
| 2 | Nhân viên chờ được giao việc | vào cửa rồi **đứng chờ**; có từ 2 người trở lên vào trong 1,2 s thì **họp nhóm** ở Phòng họp; 1 người thì nhận **phiếu giao việc** tại bàn Giám đốc. `done` tới sớm cũng phải chờ |
| 3 | Nộp bài phải qua cấp trên | nhân viên tới bàn Giám đốc, chờ **đóng dấu**: ✔ `ĐÃ KIỂM NHẬN` / ✘ `TRẢ LẠI`. Có dấu mới được về; bị trả lại để làm lại (`rework`) thì quay về chỗ làm |
| 4 | Báo cáo khi đội đã xong | `report` tới khi còn người chưa nộp bài thì **hoãn**; người cuối về là Nhi lên báo cáo |
| 5 | Không nhảy cóc pha | có việc mà chưa có lệnh CEO thì ghi **"nhận việc NGẦM"** vào sổ rồi mới đi tiếp |
| 6 | Cần CEO duyệt thì đứng chờ | `ask`: Nhi lên cạnh CEO, thẻ "chờ CEO duyệt", không về cho tới sự kiện kế tiếp |
| 7 | Giấy tờ đầy đủ | mọi bước ghi vào **sổ quy trình**; sai quy trình thì ghi `vi-pham`, không lặng lẽ bỏ qua |

## Sổ quy trình (giấy tờ)

`window.stage.doiNgu().soQuyTrinh`. Mỗi bản ghi bắn `team.record`; chatroom VS Code hiện thành một dòng
`📋 #số tóm tắt — ký: người ký`.

| Loại | Ai ký | Khi nào | Chi tiết |
| --- | --- | --- | --- |
| `nhan-viec` | CEO (hoặc Nhi nếu ngầm) | CEO giao việc | `ngam: true` nếu không có lệnh CEO |
| `bien-ban-hop` | Giám đốc (chủ trì) | họp giao việc xong | địa điểm, giờ bắt đầu/kết thúc, thành phần, **phân công** từng người; hiện trên màn trình chiếu phòng họp (`tivi`) |
| `phieu-giao` | Giám đốc | giao riêng một người | vai + việc |
| `kiem-nhan` | Giám đốc | duyệt bài đạt | dấu `ĐÃ KIỂM NHẬN` (hiện trên thẻ người nộp) |
| `tra-lai` | Giám đốc | duyệt bài chưa đạt | dấu `TRẢ LẠI` / `TRẢ LẠI — LÀM LẠI` |
| `xin-duyet` | Giám đốc | `ask` | — |
| `bao-cao` | Giám đốc | báo cáo CEO | số bài kiểm nhận / trả lại từ lần báo cáo trước |
| `ceo-duyet` | CEO | ngay sau mỗi báo cáo | số của báo cáo được duyệt |
| `vi-pham` | nguồn sự kiện | sự kiện sai quy trình (nộp bài cho việc chưa giao…) | — |

## Nguồn sự kiện

Một lệnh cho mọi nguồn: `team.event { kind, id, role?, task?, source, tool?, ok? }`. Lệnh này nằm trong
`LENH_CHI_CHO_BOSS`, nên não (MCP) không gọi được: não không được tự giả việc thật.

### Claude Code (hook) — `scripts/bao-doi-ngu.mjs`

| Hook | `kind` |
| --- | --- |
| SessionStart | `session-start` |
| UserPromptSubmit | `brief` |
| PreToolUse Task/Agent | `spawn` |
| PostToolUse Task/Agent | `done` / `fail` (PostToolUseFailure → `fail`) |
| PreToolUse tool khác | `work { tool: doc/tim/viet/chay-lenh/test/build/git/web/ke-hoach/khac }` |
| PostToolUse tool khác | `work-result { ok }` — chỉ khi lỗi, hoặc test/build/lệnh/git |
| Notification | `ask` |
| Stop | `report` |
| PreCompact | `compact` |
| SessionEnd | `session-end` |

Riêng tư: hook chỉ gửi vai, mô tả ngắn của subagent và **loại** việc. Prompt, lệnh shell, đường dẫn file, nội dung
thông báo và kết quả tool đều không rời tiến trình hook.

Giới hạn: Claude Code không có bước "duyệt bài" riêng, nên `done` = kiểm nhận và `fail` = trả lại; hook không sinh
`rework`. Subagent chạy nền: `PostToolUse` tới ngay lúc giao, nên nhân viên nộp bài sớm.

### Não local (Ollama) — `scripts/nao-local.mjs` (`taoChiaViec`)

Quy trình do **driver cầm lái**: model chỉ trả lời câu hỏi của bước hiện tại, không tự chọn bước.

1. Câu của Sếp là **yêu cầu việc** (`laYeuCauViec`: có động từ việc, không phải câu hỏi) → `brief`. Câu nói chuyện
   thường thì không đi quy trình.
2. **Lập kế hoạch**: model trả về JSON `{"viec":[{"vai","viec"}]}`. Tối đa 3 việc, vai phải nằm trong
   `VAI_NHAN_VIEN_LOCAL`. Không chia thì Nhi tự làm.
3. **Giao việc**: gửi `spawn` cho từng việc (sân khấu họp hoặc phát phiếu giao).
4. **Thực hiện**: mỗi nhân viên là một lượt model riêng theo vai, **không có tool** (nhân viên không điều khiển sân
   khấu).
5. **Duyệt bài**: Giám đốc duyệt bằng một lượt model trả về JSON `{"dat","ly_do"}`.
   - Đạt → `done`.
   - Chưa đạt lần đầu → `rework`, nhân viên làm lại kèm góp ý.
   - Chưa đạt lần hai hoặc hỏng → `fail`.
6. **Tổng hợp**: lượt chính của Nhi nhận bài kèm dấu, chỉ tổng hợp bài **đã kiểm nhận** rồi nói với Sếp.
7. `report` (sân khấu tự hoãn tới khi cả đội nộp xong). CEO đóng dấu duyệt.

Ngân sách thời gian: lượt có quy trình được thêm `MS_CHIA_VIEC` (90 s) ngoài hạn lượt 60 s.
Test dùng Ollama giả: `scripts/__tests__/nao-local.test.mjs` (mục *INT-07 chia việc theo quy trình*).
**Chưa đo với Ollama + model thật.**

## Cập nhật 28/10 — CEO thật ký (Bàn duyệt)

Dấu CEO cho báo cáo giờ do **Sếp ký tay** trên Bàn duyệt (`team.sign`), Nam không tự đóng dấu nữa. Trả lại thì ghi
`ceo-tra-lai` kèm góp ý. Xem `BAN-DUYET.md`.
