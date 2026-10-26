/**
 * html.ts — dựng HTML + CSP cho hai webview (thuần, test được không cần VS Code).
 *
 * Luật CSP: `default-src 'none'`, rồi mở đúng từng thứ cần:
 *  - Sân khấu: `frame-src` ĐÚNG MỘT origin (`http://127.0.0.1:<devPort>`), script
 *    vỏ chạy bằng nonce. Trang trong iframe có CSP riêng của nó — CSP vỏ không
 *    chi phối (giả thuyết lõi V0, kiểm bằng `scripts/kiem-vscode.mjs`).
 *  - Chatroom: không cần `connect-src` vì ws nằm ở extension host.
 */

/** 32 ký tự [A-Za-z0-9] — nonce cho `<script>`/`<style>`. */
export function taoNonce(ngauNhien: () => number = Math.random): string {
  const bang = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += bang.charAt(Math.floor(ngauNhien() * bang.length));
  return s;
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
 *  - `{lenh:"hienAn", visible, active}`  INT-06: chuyển tiếp xuống iframe
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
  <iframe id="san-khau" title="Sân khấu Gen-Stage" allow="autoplay" data-url="${thoatHtml(t.url)}"></iframe>
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
  function napLai(url) {
    const u = url || khung.dataset.url;
    khung.dataset.url = u;
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
    const m = ev.data || {};
    if (m.lenh === 'napLai') napLai(m.url);
    else if (m.lenh === 'trangThai') trangThai(String(m.chu || ''), m.loi);
    else if (m.lenh === 'hienAn') {
      // INT-06 — chuyển tiếp xuống app. TODO(V1): app sân khấu chưa nghe tin
      // này (src/ không sửa ở V0); khi có, app hạ fps/tắt bloom lúc !active.
      if (khung.contentWindow && khung.src && khung.src !== 'about:blank') {
        khung.contentWindow.postMessage(
          { nguon: 'gen-stage-vscode', loai: 'nen', visible: !!m.visible, active: !!m.active }, ORIGIN);
      }
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
