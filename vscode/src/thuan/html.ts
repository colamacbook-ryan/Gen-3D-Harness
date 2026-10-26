/**
 * html.ts — dựng HTML + CSP cho hai webview (thuần, test được không cần VS Code).
 *
 * Luật CSP: `default-src 'none'`, rồi mở đúng từng thứ cần:
 *  - Sân khấu: `frame-src` ĐÚNG MỘT origin (`http://127.0.0.1:<devPort>`), script
 *    vỏ chạy bằng nonce. Trang trong iframe có CSP riêng của nó — CSP vỏ không
 *    chi phối (giả thuyết lõi V0, kiểm bằng `scripts/kiem-vscode.mjs`).
 *  - Chatroom: không cần `connect-src` vì ws nằm ở extension host.
 */
import { randomBytes } from 'node:crypto';

/** Nonce cho `<script>`/`<style>`: 128 bit từ CSPRNG, base64url (22 ký tự). */
export function taoNonce(): string {
  return randomBytes(16).toString('base64url');
}

/** Thoát chuỗi trước khi nhét vào thuộc tính/nội dung HTML. */
export function thoatHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function taoCspSanKhau(originSanKhau: string, cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `frame-src ${originSanKhau}`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

export function taoCspChatroom(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}' ${cspSource}`,
  ].join('; ');
}

/**
 * sandbox của iframe sân khấu: scripts + same-origin (WebGL, Web Audio, ws, fetch,
 * localStorage của app) + forms (ô chat là `<form>`, thiếu cờ này Enter không gửi)
 * + downloads (nút "Xuất JSON" nhật ký). Không có top-navigation/popups/modals.
 * iframe khác origin với vỏ (`vscode-webview://`) nên same-origin không cho nó chạm vào vỏ.
 */
export const SANDBOX_IFRAME = 'allow-scripts allow-same-origin allow-forms allow-downloads';

export interface ThamSoHtmlSanKhau {
  /** URL iframe (đã kèm `?bridge=1`…). */
  url: string;
  /** Origin app sân khấu — dùng cho `frame-src` và `postMessage` xuống iframe. */
  origin: string;
  cspSource: string;
  nonce: string;
}

/**
 * Vỏ panel sân khấu. iframe KHÔNG có `src` lúc đầu: host dò cổng vite trước,
 * có thì gửi `{lenh:"napLai"}`, chưa có thì gửi `{lenh:"trangThai"}` để vỏ hiện
 * hướng dẫn — tránh iframe trắng trơn không lời giải thích.
 *
 * Giao thức host → vỏ:
 *  - `{lenh:"napLai", url?}`             gán lại `src` (cũng là "Tải lại")
 *  - `{lenh:"trangThai", chu, loi}`      dòng trạng thái (loi=true thì tô đỏ, che iframe)
 *  - `{lenh:"hienAn", visible, active}`  INT-06: chuyển tiếp xuống iframe dưới dạng
 *    `{nguon:"gen-stage-vscode", loai:"nen", visible, active}` (app nghe ở
 *    `src/stage/che-do-nen.ts`: kiểm `source` là cửa sổ cha + đúng khoá). Vỏ nhớ
 *    tin cuối và GỬI LẠI mỗi lần iframe nạp xong — app mới nạp không lỡ trạng thái.
 * Vỏ → host: `{loai:"taiLai"}` khi bấm nút, `{loai:"sanSang"}` khi script chạy.
 */
export function taoHtmlSanKhau(t: ThamSoHtmlSanKhau): string {
  const n = thoatHtml(t.nonce);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${thoatHtml(taoCspSanKhau(t.origin, t.cspSource, t.nonce))}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sân khấu</title>
<style nonce="${n}">
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-foreground, #ccc);
    font: 12px/1.4 var(--vscode-font-family, sans-serif); }
  #thanh { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #333); box-sizing: border-box; }
  #thanh button { font: inherit; padding: 1px 8px; cursor: pointer;
    color: var(--vscode-button-secondaryForeground, #fff); background: var(--vscode-button-secondaryBackground, #3a3d41);
    border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; }
  #trang-thai { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; }
  #trang-thai.loi { color: var(--vscode-errorForeground, #f48771); opacity: 1; }
  #khung { position: absolute; top: 26px; left: 0; right: 0; bottom: 0; }
  iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
  #che { position: absolute; inset: 0; display: none; padding: 24px; box-sizing: border-box;
    background: var(--vscode-editor-background, #1e1e1e); white-space: pre-wrap; }
  #che.hien { display: block; }
</style>
</head>
<body>
<div id="thanh">
  <button id="tai-lai" type="button" title="Nạp lại sân khấu (dò lại cổng vite)">Tải lại</button>
  <span id="trang-thai">Đang chờ sân khấu…</span>
</div>
<div id="khung">
  <iframe id="san-khau" title="Sân khấu Gen-Stage" allow="autoplay; clipboard-write" sandbox="${SANDBOX_IFRAME}" data-url="${thoatHtml(t.url)}"></iframe>
  <div id="che"></div>
</div>
<script nonce="${n}">
(function () {
  const vs = acquireVsCodeApi();
  const ORIGIN = ${JSON.stringify(t.origin)};
  const khung = document.getElementById('san-khau');
  const tt = document.getElementById('trang-thai');
  const che = document.getElementById('che');
  function trangThai(chu, loi) {
    tt.textContent = chu.split('\\n')[0];
    tt.classList.toggle('loi', !!loi);
    che.textContent = loi ? chu : '';
    che.classList.toggle('hien', !!loi);
  }
  let nenCuoi = null;
  // iframe đã nạp xong trang app chưa (đang nạp thì contentWindow còn là about:blank
  // khác origin → postMessage bị trình duyệt từ chối; đợi 'load' rồi gửi)
  let daNap = false;
  function guiNen() {
    if (!nenCuoi || !daNap || !khung.contentWindow || !khung.src || khung.src === 'about:blank') return;
    khung.contentWindow.postMessage(
      { nguon: 'gen-stage-vscode', loai: 'nen', visible: nenCuoi.visible, active: nenCuoi.active }, ORIGIN);
  }
  // iframe nạp xong (kể cả "Tải lại") → báo lại trạng thái panel cho app mới
  khung.addEventListener('load', function () {
    daNap = !!khung.src && khung.src !== 'about:blank';
    guiNen();
  });
  function napLai(url) {
    const u = url || khung.dataset.url;
    khung.dataset.url = u;
    daNap = false;
    // gán lại src kể cả khi trùng — đó chính là "tải lại"
    khung.src = 'about:blank';
    khung.src = u;
    trangThai('Sân khấu: ' + u, false);
  }
  document.getElementById('tai-lai').addEventListener('click', function () {
    trangThai('Đang dò lại cổng sân khấu…', false);
    vs.postMessage({ loai: 'taiLai' });
  });
  window.addEventListener('message', function (ev) {
    // chỉ nhận tin từ host VS Code (window.parent); iframe sân khấu, iframe lồng… đều bỏ
    if (ev.source !== window.parent) return;
    const m = ev.data || {};
    if (m.lenh === 'napLai') napLai(m.url);
    else if (m.lenh === 'trangThai') trangThai(String(m.chu || ''), m.loi);
    else if (m.lenh === 'hienAn') {
      // INT-06 (V1) — chuyển tiếp xuống app: !active hoặc !visible → app chạy nền
      // (≤ 15 fps, tắt bloom, pixelRatio 1). targetOrigin = ORIGIN: không lọt ra app khác.
      nenCuoi = { visible: !!m.visible, active: !!m.active };
      guiNen();
    }
  });
  vs.postMessage({ loai: 'sanSang' });
})();
</script>
</body>
</html>`;
}

export interface ThamSoHtmlChatroom {
  cspSource: string;
  nonce: string;
  /** URI (đã qua `asWebviewUri`) của `out-web/chatroom.js` và `media/chatroom.css`. */
  scriptUri: string;
  cssUri: string;
}

export function taoHtmlChatroom(t: ThamSoHtmlChatroom): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${thoatHtml(taoCspChatroom(t.cspSource, t.nonce))}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${thoatHtml(t.cssUri)}">
<title>Chatroom</title>
</head>
<body>
<header id="trang-thai" aria-live="polite">
  <span class="den" id="den-bridge"></span><span id="chu-bridge">Bridge: chưa nối</span>
  <span class="den" id="den-san-khau"></span><span id="chu-san-khau">Sân khấu: chưa nối</span>
  <span class="den" id="den-nao"></span><span id="chu-nao">Não: ?</span>
</header>
<div id="canh-bao" hidden></div>
<section id="nhan-vat" aria-label="Nhân vật">
  <div class="tieu-de">Nhân vật <span class="phu">(bấm để chọn người nghe)</span></div>
  <ul id="ds-nhan-vat"></ul>
</section>
<section id="nhat-ky" aria-label="Hội thoại">
  <ol id="ds-dong"></ol>
</section>
<form id="o-nhap">
  <input id="nhap" type="text" autocomplete="off" placeholder="Nói với…">
  <button type="submit">Gửi</button>
</form>
<script nonce="${thoatHtml(t.nonce)}" type="module" src="${thoatHtml(t.scriptUri)}"></script>
</body>
</html>`;
}
