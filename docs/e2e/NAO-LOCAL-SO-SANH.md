# Não local — chọn model nào (đo thật 26–28/10)

Ollama 0.40.11 thật, máy cloud 4 vCPU **không GPU**, sân khấu **giả** (ws `?role=stage`, không WebGL — để LLM có
đủ CPU; không có lớp hiểu lệnh C2 nên cả 4 câu đều tới model). Hạn lượt nới 600 s để đo được model chậm.
4 câu: "chào em" · "ra cửa sổ đi" · "mở màn hình cho anh" · "hôm nay mình nên làm gì trước?".
Chấm tham số bằng `docs/e2e/bootstrap-mau.json` (giá trị hợp lệ dựng từ registry + dữ liệu cảnh D1).

| Model | Schema tool | tool_call có cấu trúc | tham số hợp lệ | "ra cửa sổ đi" → | trung vị 1 lần gọi model | prompt |
| --- | --- | --- | --- | --- | --- | --- |
| qwen2.5:0.5b | chưa điền | 2 / 7 lượt | 0 / 2 | — | 2–26 s | ~2,8 k tok |
| qwen2.5:1.5b | chưa điền | **0** / 5 lượt (viết lệnh thành chữ) | — | — | 4–14 s | ~2,8 k tok |
| qwen2.5:3b | chưa điền | 15 | 12 (80 %) | `ban-cua` ✗ | 10,0 s | 3,0 k tok |
| qwen2.5:3b | **đã điền** | 14 | **14 (100 %)** | `cua-so` ✓ | 10,5 s | 3,6 k tok |
| qwen2.5:7b | chưa điền | 28 | 24 (86 %) | `lua-do` ✗ | 46,7 s | 3,3 k tok |
| qwen2.5:7b | **đã điền** | 16 | 13 (81 %) | `cua-so` ✓ | 30,2 s | 3,7 k tok |

Log: `nao-local-qwen2.5_<cỡ>-san-khau-gia[-dien-gia-tri].json` (0.5b/1.5b: lượt E2E đầu, `nao-local-qwen2.5_*.json`).

## Đọc số

- **≤ 1,5B không dùng được** cho não diễn: không gọi tool có cấu trúc. **Từ 3B trở lên** gọi tool đều.
- **"Điền giá trị vào schema" (`boSungGiaTri`) sửa đúng lỗi tên chỗ**: không có danh sách thì cả 3b lẫn 7b đều
  bịa tên place (`ban-cua`, `lua-do`) → sân khấu thật từ chối → Nhi không đi. Có danh sách + tên tiếng Việt thì
  cả hai ra `cua-so`. Đổi lại prompt dài thêm ~500 token.
- Lỗi còn lại của 7b sau khi điền đều là **giá trị bịa ở tham số tự do không quan trọng**: `emotion: "tha-nhu"`
  (tự do — sân khấu nhận, chỉ không có cử chỉ riêng) và `screen_show kind: "blank"` (enum — sân khấu giả không
  validate nên lượt đo không thấy; sân khấu thật sẽ từ chối và trả lỗi về model như kết quả tool). Không có lệnh nào vượt rào (`lyDoCamNao`).
- **7b nói hay hơn rõ** ("Chào Sếp ạ!", gợi ý việc có ngữ cảnh), 3b hay nói câu cụt/lặp lời Sếp.
- Tốc độ ở đây là **CPU cloud dùng chung** — chỉ để so tương đối; tốc độ trên GPU của Ryan **chưa đo**.

## Khuyên dùng

- **Máy có GPU ≥ 6 GB VRAM: `qwen2.5:7b`** (`GEN_STAGE_OLLAMA_MODEL=qwen2.5:7b`).
- Chỉ CPU: `qwen2.5:3b` — đúng tham số nhưng câu nói kém; nên nới `GEN_STAGE_NAO_LOCAL_HAN`.
- Không dùng 0.5b/1.5b.

## Đã sửa nhờ lượt đo này

- `boSungGiaTri` / `taoToolSong` (`scripts/nao-local.mjs`): điền place/clip/màn hình/emote đang có trên sân khấu
  (từ `stage.bootstrap`, làm mới khi sân khấu nối lại) vào schema, kèm tên tiếng Việt cho id cũ.
- Model diễn được mà không nói → driver đáp "Dạ, em làm ngay ạ" **không cắt ngang** hành động vừa ra lệnh
  (trước: câu dự phòng `interrupt:true` huỷ luôn cú đi ra cửa sổ).
- Ví dụ trong registry bỏ id chết `screen: "main"` (model chép y ví dụ) — có test chặn tái phạm.
