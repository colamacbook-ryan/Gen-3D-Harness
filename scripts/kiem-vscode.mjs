/**
 * kiem-vscode.mjs — BẰNG CHỨNG V0-3 + V0-4 của extension VS Code (thư mục `vscode/`),
 * chạy được trên máy KHÔNG có VS Code (cloud).
 *
 * Chạy:  pnpm -C vscode build && node scripts/kiem-vscode.mjs
 *
 * Dựng thật, chỉ giả đúng một thứ là "VS Code":
 *   bridge thật (`bridge/server.ts`)  ← cổng RIÊNG 8850-8853, không đụng 8787 của Sếp
 *   vite thật  127.0.0.1:5203 --strictPort
 *   server tĩnh 127.0.0.1:8854        ← đóng vai origin `vscode-webview://` (cspSource)
 *   Playwright Chromium                ← đóng vai khung webview; `acquireVsCodeApi` giả
 *   "extension host" = CHÍNH code đã build trong `vscode/out/thuan/*` (CauNoi, SoChatroom,
 *   xuLyTinChatroom, taoHtml*) — không viết lại logic nào trong script này.
 *
 * Ra `docs/vscode-v0/`:
 *   01-panel-san-khau.png        vỏ panel (CSP thật) + iframe sân khấu đã nối bridge
 *   02-panel-chua-co-vite.png    vỏ panel khi vite chưa chạy (thông báo rõ)
 *   03-chatroom.png              chatroom: danh sách nhân vật + chọn + log thật
 *   04-chatroom-hep.png          chatroom ở bề ngang 300 px (cột phải hẹp)
 *   nhat-ky-kiem-vscode.json     SỐ: lỗi CSP/console, sự kiện bridge đã ghi, lệnh gửi, kết quả
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VS = path.join(GOC, 'vscode');
const RA = path.join(GOC, 'docs', 'vscode-v0');
fs.mkdirSync(RA, { recursive: true });

if (!fs.existsSync(path.join(VS, 'out', 'thuan', 'cau-noi.js'))) {
  console.error('Chưa build extension: chạy `pnpm -C vscode build` trước.');
  process.exit(2);
}
const { CauNoi } = require(path.join(VS, 'out/thuan/cau-noi.js'));
const { SoChatroom } = require(path.join(VS, 'out/thuan/so-chatroom.js'));
const { xuLyTinChatroom } = require(path.join(VS, 'out/thuan/xu-ly-chatroom.js'));
const html = require(path.join(VS, 'out/thuan/html.js'));
const ch = require(path.join(VS, 'out/thuan/cau-hinh.js'));
const dc = require(path.join(VS, 'out/thuan/do-cong.js'));

// Cổng RIÊNG, khác bộ 8797-8830 mà các script kiem-* khác (và builder khác chạy song song) hay dùng —
// lượt đầu dùng 8797 đã bị một sân khấu lạ nối vào giữa chừng.
const CONG = { bridge: 8850, tts: 8851, mcp: 8852, stt: 8853, dev: 5203, tinh: 8854 };
const CFG = { devPort: CONG.dev, bridgePort: CONG.bridge, ttsPort: CONG.tts };
const ORIGIN_TINH = `http://127.0.0.1:${CONG.tinh}`;

const nhatKy = { batDau: new Date().toISOString(), cong: CONG, buoc: [], loiConsole: [], taiNguyenLoi: [], viPhamCsp: [], suKien: [], lenhGui: [] };
const ghi = (...x) => {
  console.log('[kiem-vscode]', ...x);
  nhatKy.buoc.push(x.join(' '));
};
const doi = (ms) => new Promise((r) => setTimeout(r, ms));
async function doiDen(dk, han, ten) {
  const het = Date.now() + han;
  while (!(await dk())) {
    if (Date.now() > het) throw new Error(`quá hạn chờ: ${ten}`);
    await doi(200);
  }
}

/* ------------------------------------------------- dọn: chỉ giết nhóm mình bật */
const nhom = [];
function batNhom(ten, cmd, args, env = {}) {
  const p = spawn(cmd, args, { cwd: GOC, detached: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const dong = [];
  p.stdout.on('data', (b) => dong.push(String(b)));
  p.stderr.on('data', (b) => dong.push(String(b)));
  nhom.push({ ten, p, dong });
  return { p, dong };
}
function donDep() {
  for (const { p } of nhom) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* đã chết */
    }
  }
}
process.on('exit', donDep);
process.on('SIGINT', () => process.exit(130));

for (const c of Object.values(CONG)) {
  if (await dc.coNgheTcp(c)) {
    console.error(`Cổng ${c} đang bận — script này không dùng chung / không giết tiến trình của người khác. Giải phóng rồi chạy lại.`);
    process.exit(3);
  }
}

/* ----------------------------------------------------------- server tĩnh */
const trang = new Map();
const KIEU = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8', '.map': 'application/json' };
const svTinh = http.createServer((q, r) => {
  const u = decodeURIComponent((q.url ?? '/').split('?')[0]);
  if (trang.has(u)) {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return r.end(trang.get(u));
  }
  const f = path.join(VS, path.normalize(u));
  if (!f.startsWith(VS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    r.writeHead(404);
    return r.end();
  }
  r.writeHead(200, { 'content-type': KIEU[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => svTinh.listen(CONG.tinh, '127.0.0.1', ok));

const trinh = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

/** `acquireVsCodeApi` giả: tin webview gửi lên → `window.__guiHost` (exposeFunction). */
const GIA_VSCODE = `
  window.acquireVsCodeApi = () => ({
    postMessage: (m) => window.__guiHost ? window.__guiHost(JSON.stringify(m)) : (window.__hangCho = (window.__hangCho || []).concat([m])),
    getState: () => undefined, setState: () => undefined,
  });
  document.addEventListener('securitypolicyviolation', (e) =>
    console.error('CSP-VIOLATION ' + e.violatedDirective + ' ' + e.blockedURI));
`;

function theoDoi(page, nhan) {
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('CSP-VIOLATION') || /Content Security Policy/i.test(t)) nhatKy.viPhamCsp.push(`[${nhan}] ${t}`);
    else if (m.type() === 'error') nhatKy.loiConsole.push(`[${nhan}] ${t}`);
  });
  page.on('pageerror', (e) => nhatKy.loiConsole.push(`[${nhan}] pageerror ${e.message}`));
  // console "Failed to load resource" không kèm URL → ghi URL riêng để biết lỗi của ai
  page.on('response', (r) => {
    if (r.status() >= 400) nhatKy.taiNguyenLoi.push(`[${nhan}] ${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => nhatKy.taiNguyenLoi.push(`[${nhan}] ${r.failure()?.errorText} ${r.url()}`));
}

async function trangVo(ten, noiDung, viewport) {
  trang.set(`/${ten}`, noiDung);
  const ctx = await trinh.newContext({ viewport });
  const page = await ctx.newPage();
  theoDoi(page, ten);
  // chỉ khung chính là "webview"; iframe sân khấu là app thật, không cần API giả
  await page.addInitScript(`if (window === window.top) {${GIA_VSCODE}}`);
  return { ctx, page };
}

let thanhCong = false;
try {
  /* ---------------------------------------- 02: vỏ panel khi vite CHƯA chạy */
  {
    const nonce = html.taoNonce();
    const { ctx, page } = await trangVo(
      'panel-chua-vite.html',
      html.taoHtmlSanKhau({ url: ch.urlSanKhau(CFG), origin: ch.originSanKhau(CFG), cspSource: ORIGIN_TINH, nonce }),
      { width: 900, height: 600 },
    );
    const tinLen = [];
    await page.exposeFunction('__guiHost', (s) => tinLen.push(JSON.parse(s)));
    await page.goto(`${ORIGIN_TINH}/panel-chua-vite.html`);
    await doiDen(() => tinLen.some((m) => m.loai === 'sanSang'), 5000, 'vỏ báo sanSang');
    const coVite = await dc.doSanKhau(CONG.dev);
    ghi('dò vite trước khi bật:', coVite);
    // đúng câu SanKhauPanel.kiemVaNap gửi khi dò thấy cổng trống
    const chuLoi =
      `Vite chưa chạy ở http://127.0.0.1:${CONG.dev}.\n\nCách bật:\n` +
      '  • Lệnh "Gen-Stage: Bật bridge + sân khấu" (cần genStage.tuBat + genStage.root), hoặc\n' +
      `  • Trong repo Gen-Stage: pnpm bridge  và  pnpm dev --host 127.0.0.1 --port ${CONG.dev}\n\n` +
      'Xong thì bấm "Tải lại". Nhật ký: lệnh "Gen-Stage: Xem nhật ký".';
    const baoLoi = () => page.evaluate((chu) => window.postMessage({ lenh: 'trangThai', chu, loi: true }, '*'), chuLoi);
    await baoLoi();
    // bấm "Tải lại" → vỏ gửi taiLai cho host → host dò lại, vẫn trống → báo lại đúng câu đó
    await page.click('#tai-lai');
    await doiDen(() => tinLen.some((m) => m.loai === 'taiLai'), 3000, 'nút Tải lại gửi taiLai');
    await baoLoi();
    await doi(200);
    await page.screenshot({ path: path.join(RA, '02-panel-chua-co-vite.png') });
    nhatKy.panelChuaVite = { tinLen, dongTrangThai: await page.textContent('#trang-thai') };
    await ctx.close();
  }

  /* --------------------------------------------------- bật bridge + vite thật */
  const tsx = path.join(GOC, 'node_modules', '.bin', 'tsx');
  const bridge = batNhom('bridge', tsx, ['bridge/server.ts'], {
    GEN_STAGE_PORT: String(CONG.bridge),
    GEN_STAGE_TTS_PORT: String(CONG.tts),
    GEN_STAGE_MCP_PORT: String(CONG.mcp),
    GEN_STAGE_STT_PORT: String(CONG.stt),
  });
  const vite = batNhom('vite', path.join(GOC, 'node_modules', '.bin', 'vite'), ['--host', '127.0.0.1', '--port', String(CONG.dev), '--strictPort']);
  await doiDen(() => dc.coNgheTcp(CONG.bridge), 30000, 'bridge lên');
  await doiDen(async () => (await dc.doSanKhau(CONG.dev)) === 'gen-stage', 60000, 'vite lên (title Gen-Stage)');
  ghi('bridge + vite đã lên; dò vite:', await dc.doSanKhau(CONG.dev));

  /* ------------------------------ "extension host": CauNoi + SoChatroom thật */
  const so = new SoChatroom(null);
  let veChatroom = () => undefined;
  const cauNoi = new CauNoi({
    url: ch.urlBridge(CFG),
    ghi: (d) => ghi(d),
    khiTrangThai: (n) => {
      so.datBridge(n);
      veChatroom();
    },
    khiSuKien: (event, data) => {
      nhatKy.suKien.push({ t: Date.now(), event, data });
      if (so.nhanSuKien(event, data)) {
        void cauNoi.goi('stage.describe').then((kq) => {
          if (kq.ok) so.nhanDescribe(kq.result);
          veChatroom();
        });
      }
      veChatroom();
    },
  });
  cauNoi.bat();
  await doiDen(() => cauNoi.noi, 10000, 'cầu nối extension → bridge');

  /* --------------------------------------- 01: vỏ panel + iframe sân khấu */
  const nonce = html.taoNonce();
  const htmlPanel = html.taoHtmlSanKhau({ url: ch.urlSanKhau(CFG), origin: ch.originSanKhau(CFG), cspSource: ORIGIN_TINH, nonce });
  nhatKy.cspPanel = html.taoCspSanKhau(ch.originSanKhau(CFG), ORIGIN_TINH, nonce);
  nhatKy.urlIframe = ch.urlSanKhau(CFG);
  const panel = await trangVo('panel.html', htmlPanel, { width: 1100, height: 720 });
  const tinPanel = [];
  await panel.page.exposeFunction('__guiHost', (s) => tinPanel.push(JSON.parse(s)));
  await panel.page.goto(`${ORIGIN_TINH}/panel.html`);
  await doiDen(() => tinPanel.some((m) => m.loai === 'sanSang'), 5000, 'vỏ panel sanSang');
  // host dò thấy vite → napLai (đúng nhánh của SanKhauPanel.kiemVaNap)
  await panel.page.evaluate((url) => window.postMessage({ lenh: 'napLai', url }, '*'), ch.urlSanKhau(CFG));
  await doiDen(() => so.sanKhauNoi && so.nhanVat.length > 0, 120000, 'sân khấu trong iframe nối bridge + describe có nhân vật');
  ghi('nhân vật từ stage.describe:', JSON.stringify(so.nhanVat));
  const khung = panel.page.frames().find((f) => f.url().startsWith(ch.originSanKhau(CFG)));
  if (!khung) throw new Error('không thấy frame sân khấu');
  await khung.waitForFunction(() => window.stage?.san === true, null, { timeout: 120000 }).catch(() => ghi('cảnh báo: window.stage.san chưa true'));
  await doi(10000); // swiftshader ~1 fps: chờ VRM + vài khung hình
  // INT-06: tin ẩn/hiện chuyển tiếp xuống iframe (app chưa nghe — chỉ kiểm là tới nơi)
  await khung.evaluate(() => {
    window.__tinNen = [];
    window.addEventListener('message', (e) => { if (e.data?.nguon === 'gen-stage-vscode') window.__tinNen.push({ origin: e.origin, data: e.data }); });
  });
  await panel.page.evaluate(() => window.postMessage({ lenh: 'hienAn', visible: true, active: false }, '*'));
  await doi(300);
  nhatKy.tinNenToiIframe = await khung.evaluate(() => window.__tinNen);
  // iframe có sandbox: WebGL, Web Audio, localStorage, fetch, ws (đã thấy ở trên), form ô chat vẫn phải chạy
  nhatKy.sandbox = { thuocTinh: await panel.page.getAttribute('#san-khau', 'sandbox') };
  nhatKy.sandbox.trongKhung = await khung.evaluate(async () => {
    const c = document.createElement('canvas');
    const webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    let audio = false;
    try {
      const a = new AudioContext();
      audio = a.state === 'running' || a.state === 'suspended';
      void a.close();
    } catch { /* bị chặn */ }
    let localStorageOk = false;
    try {
      localStorage.setItem('__kiem', '1');
      localStorageOk = localStorage.getItem('__kiem') === '1';
      localStorage.removeItem('__kiem');
    } catch { /* bị chặn */ }
    const fetchTrang = await fetch('/').then((r) => r.status).catch((e) => String(e));
    return { webgl, audio, localStorage: localStorageOk, fetchTrang, origin: location.origin, wsSanKhau: window.stage?.san === true };
  });
  {
    const cau = 'thử ô chat trong iframe sandbox';
    const truoc = nhatKy.suKien.length;
    await khung.fill('#o-chat-nhap', cau);
    await khung.press('#o-chat-nhap', 'Enter');
    await doiDen(() => nhatKy.suKien.slice(truoc).some((e) => e.event === 'user.text' && e.data.text === cau), 15000, 'form ô chat trong iframe gửi được');
    nhatKy.sandbox.formOChat = true;
  }
  // tin giả mạo từ iframe gửi lên vỏ phải bị bỏ qua
  await khung.evaluate(() => window.parent.postMessage({ lenh: 'trangThai', chu: 'GIA-MAO-TU-IFRAME', loi: true }, '*'));
  await doi(300);
  nhatKy.sandbox.voBoQuaTinIframe = !(await panel.page.textContent('#trang-thai')).includes('GIA-MAO');
  ghi('sandbox iframe:', JSON.stringify(nhatKy.sandbox));
  const sb = nhatKy.sandbox.trongKhung;
  if (!sb.webgl || !sb.audio || !sb.localStorage || sb.fetchTrang !== 200 || !nhatKy.sandbox.voBoQuaTinIframe) {
    throw new Error('sandbox iframe phá chức năng sân khấu hoặc vỏ nhận tin giả: ' + JSON.stringify(nhatKy.sandbox));
  }
  await doi(3000);
  await panel.page.screenshot({ path: path.join(RA, '01-panel-san-khau.png') });
  nhatKy.panel = { tinLen: tinPanel, khungUrl: khung.url() };

  /* --------------------------------------------------------- 03/04: chatroom */
  const cr = await trangVo(
    'chatroom.html',
    html.taoHtmlChatroom({
      cspSource: ORIGIN_TINH,
      nonce: html.taoNonce(),
      scriptUri: `${ORIGIN_TINH}/out-web/web/chatroom.js`,
      cssUri: `${ORIGIN_TINH}/media/chatroom.css`,
    }),
    { width: 380, height: 760 },
  );
  // màu theme tối giống VS Code Dark Modern (webview thật nhận biến --vscode-* từ VS Code)
  await cr.page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.documentElement.style;
      const bien = {
        '--vscode-font-family': 'system-ui, sans-serif', '--vscode-font-size': '13px', '--vscode-foreground': '#cccccc',
        '--vscode-sideBar-background': '#181818', '--vscode-panel-border': '#2b2b2b', '--vscode-input-background': '#313131',
        '--vscode-input-foreground': '#cccccc', '--vscode-input-border': '#3c3c3c', '--vscode-button-background': '#0078d4',
        '--vscode-button-foreground': '#ffffff', '--vscode-list-activeSelectionBackground': '#04395e',
        '--vscode-list-activeSelectionForeground': '#ffffff', '--vscode-focusBorder': '#0078d4', '--vscode-badge-background': '#616161',
        '--vscode-badge-foreground': '#f8f8f8', '--vscode-textLink-foreground': '#4daafc', '--vscode-editor-font-family': 'monospace',
      };
      for (const [k, v] of Object.entries(bien)) s.setProperty(k, v);
      document.body.style.background = '#181818';
    });
  });
  const veThat = async () => {
    try {
      await cr.page.evaluate((mh) => window.postMessage({ lenh: 'moHinh', moHinh: mh }, '*'), so.moHinh());
    } catch {
      /* trang đang đóng */
    }
  };
  await cr.page.exposeFunction('__guiHost', async (s) => {
    const m = JSON.parse(s);
    if (m.loai === 'gui') nhatKy.lenhGui.push({ t: Date.now(), ...m });
    if (await xuLyTinChatroom(m, so, cauNoi, (d) => ghi(d))) await veThat();
  });
  veChatroom = () => void veThat();
  await cr.page.goto(`${ORIGIN_TINH}/chatroom.html`);
  await cr.page.waitForSelector('.nhan-vat');

  // chọn Gen làm người nghe (bấm thật vào danh sách)
  const gen = so.nhanVat.find((a) => a.controlledBy === 'agent') ?? so.nhanVat[0];
  await cr.page.click(`.nhan-vat:has(.id:text-is("${gen.id}"))`);
  await doiDen(() => so.dangChon === gen.id, 3000, 'chọn nhân vật');
  // gõ hai câu: một câu gọi tên, một câu không gọi tên (đi tới nhân vật đang chọn)
  for (const cau of ['Gen ơi, chào em', 'hôm nay mình làm gì?']) {
    const truoc = nhatKy.suKien.length;
    await cr.page.fill('#nhap', cau);
    await cr.page.press('#nhap', 'Enter');
    const t0 = Date.now();
    await doiDen(() => nhatKy.suKien.slice(truoc).some((e) => e.event === 'user.text' && e.data.text === cau), 15000, `user.text "${cau}"`);
    ghi(`"${cau}" → user.text sau ${Date.now() - t0} ms`);
    await doi(3500);
  }
  await doiDen(() => so.dong.some((d) => d.loai === 'nhan-vat'), 20000, 'có câu nhân vật nói (actor.sayStart)').catch((e) => ghi('cảnh báo:', e.message));
  await doi(500);
  await veThat();
  await doi(300);
  await cr.page.screenshot({ path: path.join(RA, '03-chatroom.png') });
  await cr.page.setViewportSize({ width: 300, height: 640 });
  await doi(300);
  await cr.page.screenshot({ path: path.join(RA, '04-chatroom-hep.png') });

  nhatKy.chatroom = {
    nhanVat: so.nhanVat,
    dangChon: so.dangChon,
    dong: so.dong,
    userText: nhatKy.suKien.filter((e) => e.event === 'user.text').map((e) => e.data),
    lenhDaGui: nhatKy.lenhGui,
  };
  nhatKy.bridgeLog = bridge.dong.join('').split('\n').filter((d) => /sân khấu|client|→/.test(d)).slice(-40);
  nhatKy.viteLoi = vite.dong.join('').split('\n').filter((d) => /error/i.test(d)).slice(-20);
  cauNoi.tat();
  await panel.ctx.close();
  await cr.ctx.close();
  thanhCong = true;
} catch (e) {
  nhatKy.loi = String(e?.stack ?? e);
  console.error(e);
  for (const n of nhom) nhatKy[`log_${n.ten}`] = n.dong.join('').split('\n').slice(-40);
} finally {
  nhatKy.ketThuc = new Date().toISOString();
  nhatKy.thanhCong = thanhCong;
  nhatKy.tomTat = {
    viPhamCsp: nhatKy.viPhamCsp.length,
    loiConsole: nhatKy.loiConsole.length,
    suKien: nhatKy.suKien.length,
    lenhGui: nhatKy.lenhGui.length,
  };
  fs.writeFileSync(path.join(RA, 'nhat-ky-kiem-vscode.json'), JSON.stringify(nhatKy, null, 2) + '\n');
  await trinh.close();
  svTinh.close();
  donDep();
  console.log('[kiem-vscode] tóm tắt:', JSON.stringify(nhatKy.tomTat), thanhCong ? 'XONG' : 'LỖI');
  process.exit(thanhCong ? 0 : 1);
}
