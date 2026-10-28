# Bàn duyệt — CEO thật ký công việc của đội agent (phương án 1, 28/10)

Ryan 28/10: *"có nên thêm một giao diện web … để khi cần xem duyệt sẽ dễ dàng hơn"* → *"ok làm phương án 1 trước"*.
Phương án 1 chỉ phủ **đội agent của Gen-Stage** (Claude Code qua hook + não local). Bàn điều hành chung cho mọi dự
án là phương án 2: chưa làm, phải qua bước spec trước (STD-05).

## Mở

- Trong VS Code: `Ctrl+Shift+P` → **"Gen-Stage: Mở Bàn duyệt"**. Lệnh tự bật bridge + vite nếu chưa chạy, rồi mở trình duyệt.
- Mở tay: `http://127.0.0.1:5173/duyet.html` (cổng khác thì thêm `?bridgePort=<cổng bridge>`).
- **Trên điện thoại** cùng mạng: phải mở bridge ra ngoài, có token (`--host` + `GEN_STAGE_TOKEN`), rồi mở
  `http://<ip máy>:5173/duyet.html?bridgeToken=<token>`. Không mở ra ngoài khi không có token.

## Trang trả lời câu gì

Trang tổ chức theo **câu hỏi Sếp đặt ra mỗi ngày**, không theo phân hệ dữ liệu như ERP. Bài học lấy từ clip Versarix
và từ bản rà soát giao diện GenOS ("44 lối vào, rời rạc").

| Mục | Câu hỏi | Nội dung |
| --- | --- | --- |
| **Hôm nay** | Tôi cần quyết gì ngay? | 6 số đo trong ngày · **Cần anh quyết** (báo cáo chờ ký, cũ nhất lên trước) · Công ty lúc này (pha, Giám đốc đang làm gì, nhân viên) · Sổ gần đây |
| **Sổ quy trình** | Đã xảy ra chuyện gì, ai ký? | Bảng kiểu Excel (STD-07): ID `SQ-0001`, giờ, loại, người ký, nội dung. Lọc theo loại, tìm không dấu, thanh công thức hiện chi tiết JSON của dòng đang chọn |
| **Đội ngũ** | Ai đang làm gì? | Nhân viên đang làm (vai, việc, bước, nguồn) và các pha của quy trình |

## Luồng ký

1. Nhi báo cáo xong thì Nam **không tự đóng dấu nữa**: Nam nói "Để anh xem rồi ký ở Bàn duyệt 🖋️". Báo cáo vào
   hàng `choKy`, đồng thời chatroom VS Code hiện dòng `✍️ Báo cáo #n chờ anh ký`.
2. Trên trang, bấm **Ký duyệt**: sổ ghi `ceo-duyet` (`chiTiet.kyTay: true`), sân khấu diễn cảnh Nam nói "Đã ký duyệt báo cáo số n ✅" và Nhi cảm ơn.
3. Bấm **Trả lại**: bắt buộc ghi một câu góp ý. Sổ ghi `ceo-tra-lai` kèm góp ý, Nhi đáp "Dạ em xem lại ngay ạ".
4. Agent đang chờ anh trả lời (`ask`, tức Claude Code hỏi quyền hoặc hỏi ý): trang hiện nhắc **"trả lời trong terminal"**.
   Web không trả lời thay được, vì hook không bao giờ được chặn Claude Code.

Ký không chặn quy trình. Báo cáo chờ ký vẫn nằm trong hàng; Nhi về bàn, phiên sau vẫn chạy bình thường.

## Hợp đồng

- Lệnh **`team.state {limit?}`**: chỉ đọc. Trả về `pha`, `choCeoDuyet`, `xinDuyetLuc`, `nhanVien`, `choKy`, `soQuyTrinh`, `ceoKyTay`.
- Lệnh **`team.sign {report, decision: approve|reject, note?}`**: nằm trong `LENH_CHI_CHO_BOSS`, nên **não (MCP) không ký thay Sếp được**.
  Góp ý đi qua `boKyTuLa`, cắt ≤ 200 ký tự. Ký một số không nằm trong hàng chờ, hoặc ký hai lần, thì trả lỗi và sổ không đổi.
- Sự kiện **`team.signed {baoCao, quyet, dauCeo, gopY?}`**. `team.report` mang thêm `choKy: true` khi chờ ký tay.
- Loại giấy tờ mới: **`ceo-tra-lai`**.
- Máy đội ngũ nhận thêm tham số `ceoKyTay`. App bật tham số này; test cũ thì không, nên vẫn giữ hành vi Nam tự duyệt.
- Sổ + hàng chờ ký **lưu vào localStorage** của tab sân khấu (`gen-stage.doi-ngu.v1`), nên tải lại trang không mất giấy tờ. Kho hỏng thì sổ trắng, không ném lỗi.
- Trang nối bridge bằng **vai client**, không bao giờ nối `?role=stage`: làm vậy sẽ đá tab sân khấu thật ra (CNS-002).
  Trang cũng **không nhúng sân khấu 3D**, vì một tab sân khấu thứ hai cũng sẽ thay chỗ tab đang mở.

## Ai ký được: mô hình đe doạ (review bảo mật 28/10)

| Ai | Ký được không | Rào |
| --- | --- | --- |
| Não qua MCP (agy, não local) | **Không** | `team.sign` nằm trong `LENH_CHI_CHO_BOSS` |
| Trang web lạ trong trình duyệt của Sếp | **Không** | **Cửa Origin** của bridge (`bridge/nguon.ts`): WebSocket không có CORS, nên trước đây trang nào cũng nối được `ws://127.0.0.1:8787` và gửi **mọi** lệnh (cả `stage.hear` để giả giọng Sếp). Nay bridge chỉ nhận trang của chính máy, webview VS Code, hoặc (khi mở `--host`, bắt buộc token) trang cùng máy với địa chỉ bridge. Origin lạ bị từ chối ngay lúc bắt tay (401) |
| Máy khác trong mạng | **Không** | Mặc định bridge chỉ nghe `127.0.0.1`. Muốn mở ra ngoài thì bắt buộc có token |
| Tiến trình chạy dưới **cùng user** trên máy (kể cả agent có shell) | **Có, không chặn được** | Tiến trình đó đọc được mọi file, sửa được localStorage và lái được cả trình duyệt. Cổng phần mềm cùng user không ngăn nổi; muốn ngăn thì phải tách user / sandbox ở mức hệ điều hành. Bàn duyệt bảo đảm **đường chính thức** của não không ký được, không bảo đảm chống một agent cố tình phá |

## Sửa kèm: thứ tự "nhận việc"

`brief` trước đây chỉ xếp hàng sau màn chào CEO (vài giây). Subagent tới trong khoảng đó thì máy ghi oan
"nhận việc NGẦM", rồi kéo pha lùi về "nhận việc". Lỗi lộ ra nhờ chính sổ trên Bàn duyệt.
Nay giấy tờ + pha ghi **ngay lúc nhận** `brief`; hàng việc chỉ còn lo phần diễn. Test: `ban-duyet.test.ts`.

## Kiểm

- `pnpm test`: `src/api/__tests__/ban-duyet.test.ts` (máy + lệnh + rào não + lưu sổ + thứ tự) và `src/duyet/hang-duyet.test.ts` (logic trang).
- `node scripts/kiem-ban-duyet.mjs`: bridge thật + vite + Chromium, bơm sự kiện như hook Claude Code, bấm ký như người
  thật. Ra `docs/ban-duyet/` (ảnh + `nhat-ky.json`). Lượt 28/10 đạt **11/11**.
  - Cổng riêng: 8961–8964 (đổi bằng `KIEM_CONG_GOC`) và web 5481 (đổi bằng `KIEM_CONG_WEB`).

## Chưa có (để sau, nếu Ryan muốn)

- **Chi phí token / $ theo agent**: hook hiện không gửi số liệu này.
- Ô sân khấu thu nhỏ trên trang (cần một luồng chỉ-xem, không thay tab).
- Lịch sử nhiều ngày ngoài 300 bản ghi gần nhất (cần lưu ở bridge).
- Thông báo đẩy về điện thoại.
