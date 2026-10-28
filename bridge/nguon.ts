/**
 * nguon.ts — cửa ORIGIN của bridge (review bảo mật 28/10, sau Bàn duyệt).
 *
 * Trình duyệt KHÔNG áp CORS cho WebSocket: không kiểm Origin thì BẤT KỲ trang web
 * nào Sếp đang mở cũng nối được `ws://127.0.0.1:8787` và gửi mọi lệnh — `team.sign`
 * (ký thay Sếp), `stage.hear` (giả giọng Sếp ra lệnh cho não có quyền chạy công cụ).
 *
 * Luật (thuần, test được):
 *  - Không có Origin ⇒ client không phải trình duyệt (hook, driver não, extension
 *    host, script kiểm) ⇒ cho. Tiến trình cùng user trên máy nằm TRONG vùng tin cậy:
 *    nó đọc được mọi file và lái được cả trình duyệt, cổng này không chặn nổi.
 *  - Có Origin ⇒ chỉ cho trang của chính máy (`localhost` / `127.0.0.1` / `::1`),
 *    webview VS Code, hoặc — khi bridge mở ra ngoài (`--host`, bắt buộc token) — trang
 *    nằm cùng máy với địa chỉ bridge đang được gọi (điện thoại mở `http://<ip>:5173`).
 *  - Origin `null` (file://, sandbox) hoặc hỏng ⇒ từ chối.
 */
const MAY_NOI_BO = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Tên máy trong header Host (bỏ cổng; giữ ngoặc vuông IPv6). */
function mayTrongHost(host: string | undefined): string {
  if (!host) return '';
  const h = host.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0] ?? '';
}

export function nguonDuocPhep(origin: string | undefined, host: string | undefined, moRong: boolean): boolean {
  if (origin === undefined || origin === '') return true;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol === 'vscode-webview:') return true;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const may = u.hostname.toLowerCase();
  if (MAY_NOI_BO.has(may)) return true;
  return moRong && may !== '' && may === mayTrongHost(host);
}
