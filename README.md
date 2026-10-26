# Gen-3D-Harness

Sân khấu Gen-Stage + extension VS Code (đang làm). Nền nhập từ Gen-Stage ngày 2026-10-26.

## Gen-Stage

Sân khấu 3D trong trình duyệt: văn phòng nhỏ + nhân vật VRM sinh động.
Vite · TypeScript · Three.js · `@pixiv/three-vrm`.

## Chạy thử

```bash
pnpm install
pnpm assets      # tải VRM + nội thất Kenney (CC0) — xem assets/LICENSES.md
pnpm dev         # http://localhost:5173
```

## Cho agent làm não nhân vật

```bash
pnpm bridge      # ws 8787 + giọng Việt 8788 + MCP 8789
pnpm dev         # rồi mở http://localhost:5173/?bridge=1
```

Nối não (agy CLI): [`docs/BOOTSTRAP-AGENT.md`](./docs/BOOTSTRAP-AGENT.md) —
một câu: *gọi `stage_bootstrap` trước, làm theo nó*.

### Não LLM local (Ollama, không cần mạng ra ngoài)

```bash
ollama serve && ollama pull qwen2.5:7b   # model nào có "tools" cũng được
pnpm nao-local                            # driver nghe ô chat → Ollama → Gen trả lời
```

Biến môi trường: `GEN_STAGE_OLLAMA_URL` (mặc định `http://127.0.0.1:11434`),
`GEN_STAGE_OLLAMA_MODEL` (bỏ trống = tự chọn model đầu tiên có khả năng `tools`).
Persona từng nhân vật: `scripts/nao-local/<actor>.md`; muốn sửa riêng thì đặt
`.cache/nao-local/<actor>.md` (được ưu tiên, không commit). Chỉ chạy **một** driver
não một lúc (`pnpm nao` hoặc `pnpm nao-local`).

### Tai nghe — nói với sân khấu từ ngoài trình duyệt (V2)

```bash
bash scripts/fetch-stt.sh                       # một lần: model PhoWhisper cho bridge
pnpm tai-nghe --to gen                       # thu mic mặc định → tự dừng khi im 1,2 s → Gen nghe
pnpm tai-nghe --to gen --nguon cau.wav       # đọc file thay mic (thử/kiểm)
```

Cần `ffmpeg` (Fedora: `dnf install ffmpeg-free`) và Node ≥ 22.18. Thu một lượt rồi
thoát; stdout là JSON lines (`bat-dau`/`muc`/`ket-qua`/`bo-qua`/`loi`) cho extension
VS Code đọc. Gen đang nói thì không thu (tránh vòng loa → mic). Tin cậy < 0,6 thì
không tự gửi. Hợp đồng đầy đủ: đầu file `scripts/tai-nghe.mjs`.

Xem trên điện thoại cùng wifi: `pnpm dev --host` rồi mở địa chỉ `http://<IP máy>:5173`.

Chi tiết quy ước: [`CLAUDE.md`](./CLAUDE.md) · giấy phép asset: [`assets/LICENSES.md`](./assets/LICENSES.md)

## License

© 2026 Gen Labs — **All rights reserved.** Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
Asset bên thứ ba (không commit, tải bằng script) giữ giấy phép riêng — xem [`assets/LICENSES.md`](assets/LICENSES.md).
