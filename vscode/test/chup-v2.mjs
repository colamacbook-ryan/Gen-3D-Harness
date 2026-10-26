/**
 * chup-v2.mjs — ảnh bằng chứng V2 (giọng nói trong chatroom) vào `docs/vscode-v2/`.
 *
 * Chạy:  pnpm -C vscode build && node vscode/test/chup-v2.mjs
 *
 * Chatroom THẬT (taoHtmlChatroom + out-web/web/chatroom.js + media/chatroom.css, CSP thật)
 * trong Playwright Chromium với `acquireVsCodeApi` giả; "extension host" = code đã build
 * (SoChatroom + DieuKhienGiong + xuLyTinChatroom) điều khiển tai-nghe GIẢ
 * (test/gia/scripts/tai-nghe.mjs). Cổng riêng V2: 8935 (bridge giả), 8936 (server tĩnh).
 * Ba trạng thái: 01 đang nghe (vạch mức), 02 chờ xác nhận (tin cậy thấp), 03 lỗi thiết bị.
 * Nút 🎤 được BẤM THẬT (pointerdown/pointerup của Chromium) — tin đi qua đúng đường webview → host.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const VS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RA = path.resolve(VS, '..', 'docs', 'vscode-v2');
fs.mkdirSync(RA, { recursive: true });
const { SoChatroom } = require(path.join(VS, 'out/thuan/so-chatroom.js'));
const { DieuKhienGiong } = require(path.join(VS, 'out/thuan/giong.js'));
const { xuLyTinChatroom } = require(path.join(VS, 'out/thuan/xu-ly-chatroom.js'));
const { CauNoi } = require(path.join(VS, 'out/thuan/cau-noi.js'));
const html = require(path.join(VS, 'out/thuan/html.js'));

const CONG = { bridge: 8935, tinh: 8936 };
const ORIGIN = `http://127.0.0.1:${CONG.tinh}`;
const doi = (ms) => new Promise((r) => setTimeout(r, ms));
async function cho(dk, han = 8000, ten = '') {
  const het = Date.now() + han;
  while (!dk()) {
    if (Date.now() > het) throw new Error('quá hạn chờ ' + ten);
    await doi(30);
  }
}
const nhatKy = { batDau: new Date().toISOString(), tinLen: [], lenhBridge: [], viPhamCsp: [], loiConsole: [], anh: [] };

/* bridge giả: nhận stage.hear (của tai-nghe giả và của nút Gửi) */
const wss = new WebSocketServer({ port: CONG.bridge, host: '127.0.0.1' });
wss.on('connection', (ws) => ws.on('message', (b) => {
  const g = JSON.parse(String(b));
  if ('ping' in g) return ws.send(JSON.stringify({ pong: g.ping }));
  nhatKy.lenhBridge.push(g);
  ws.send(JSON.stringify({ id: g.id, ok: true, result: { ok: true } }));
}));

const sv = http.createServer((q, r) => {
  const u = decodeURIComponent((q.url ?? '/').split('?')[0]);
  if (u === '/chatroom.html') {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return r.end(html.taoHtmlChatroom({ cspSource: ORIGIN, nonce: html.taoNonce(), scriptUri: `${ORIGIN}/out-web/web/chatroom.js`, cssUri: `${ORIGIN}/media/chatroom.css` }));
  }
  const f = path.join(VS, path.normalize(u));
  if (!f.startsWith(VS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.writeHead(404).end();
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => sv.listen(CONG.tinh, '127.0.0.1', ok));

const so = new SoChatroom('gen');
so.datBridge(true);
so.nhanSuKien('bridge.hello', { stageOnline: true });
so.nhanDescribe({ actors: [
  { id: 'owner', name: 'Javis', controlledBy: 'owner' },
  { id: 'gen', name: 'Gen', controlledBy: 'agent' },
], renderMode: 'full', brainConnected: true });
const t0 = Date.now() - 60_000;
so.nhanSuKien('user.text', { actor: 'owner', text: 'Gen ơi, hôm nay mình làm gì?', to: 'gen' }, t0);
so.nhanSuKien('actor.sayStart', { actor: 'gen', text: 'Dạ, em đề xuất dựng connector Baserow trước ạ.' }, t0 + 4000);
so.nhanSuKien('actor.sayDone', { actor: 'gen', text: '' }, t0 + 9000);

const cauNoi = new CauNoi({ url: `ws://127.0.0.1:${CONG.bridge}/` });
cauNoi.bat();
await cho(() => cauNoi.noi, 5000, 'cầu nối');

let page;
const ve = async () => {
  try {
    await page?.evaluate((mh) => window.postMessage({ lenh: 'moHinh', moHinh: mh }, '*'), so.moHinh());
  } catch { /* trang đang đóng */ }
};
const GIA = path.join(VS, 'test', 'gia');
const giong = new DieuKhienGiong({
  so,
  layCfg: () => ({ root: GIA, pnpm: path.join(GIA, 'pnpm-gia.sh'), bridgePort: CONG.bridge, sttPort: 8937, taiNgheNguon: '' }),
  choPhep: async () => null,
  ve: () => void ve(),
  guiMuc: (rms) => void page?.evaluate((x) => window.postMessage({ lenh: 'muc', rms: x }, '*'), rms).catch(() => undefined),
  ghi: (d) => console.log('[host]', d),
});

const trinh = await chromium.launch();
let thanhCong = false;
try {
  const ctx = await trinh.newContext({ viewport: { width: 380, height: 640 }, deviceScaleFactor: 2 });
  page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|CSP-VIOLATION/i.test(t)) nhatKy.viPhamCsp.push(t);
    else if (m.type() === 'error') nhatKy.loiConsole.push(t);
  });
  page.on('pageerror', (e) => nhatKy.loiConsole.push('pageerror ' + e.message));
  await page.addInitScript(() => {
    window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__guiHost(JSON.stringify(m)), getState: () => undefined, setState: () => undefined });
    document.addEventListener('securitypolicyviolation', (e) => console.error('CSP-VIOLATION ' + e.violatedDirective));
    document.addEventListener('DOMContentLoaded', () => {
      const bien = {
        '--vscode-font-family': 'system-ui, sans-serif', '--vscode-font-size': '13px', '--vscode-foreground': '#cccccc',
        '--vscode-sideBar-background': '#181818', '--vscode-panel-border': '#2b2b2b', '--vscode-input-background': '#313131',
        '--vscode-input-foreground': '#cccccc', '--vscode-input-border': '#3c3c3c', '--vscode-button-background': '#0078d4',
        '--vscode-button-foreground': '#ffffff', '--vscode-button-secondaryBackground': '#313131', '--vscode-button-secondaryForeground': '#cccccc',
        '--vscode-list-activeSelectionBackground': '#04395e', '--vscode-list-activeSelectionForeground': '#ffffff',
        '--vscode-focusBorder': '#0078d4', '--vscode-badge-background': '#616161', '--vscode-badge-foreground': '#f8f8f8',
        '--vscode-textLink-foreground': '#4daafc', '--vscode-editor-font-family': 'monospace', '--vscode-errorForeground': '#f85149',
      };
      for (const [k, v] of Object.entries(bien)) document.documentElement.style.setProperty(k, v);
      document.body.style.background = '#181818';
    });
  });
  await page.exposeFunction('__guiHost', async (s) => {
    const m = JSON.parse(s);
    nhatKy.tinLen.push({ t: Date.now(), ...m });
    if (await xuLyTinChatroom(m, so, cauNoi, (d) => console.log('[host]', d), giong)) await ve();
  });
  await page.goto(`${ORIGIN}/chatroom.html`);
  await page.waitForSelector('.nhan-vat');
  const nut = page.locator('#nut-mic');
  // nhấn giữ nút thật (đo lại vị trí mỗi lần — khu giọng hiện/ẩn làm nút xê dịch)
  const giuNut = async () => {
    const hop = await nut.boundingBox();
    await page.mouse.move(hop.x + hop.width / 2, hop.y + hop.height / 2);
    await page.mouse.down();
  };

  // 01 — đang nghe: giữ nút thật, tai-nghe giả kịch bản `giu` đẩy `muc`
  process.env.TAI_NGHE_KICH_BAN = 'giu';
  await giuNut();
  await cho(() => so.giong.pha === 'nghe', 8000, 'pha nghe');
  await doi(700);
  await page.screenshot({ path: path.join(RA, '01-dang-nghe.png') });
  nhatKy.anh.push({ anh: '01-dang-nghe.png', giong: so.moHinh().giong });
  await page.mouse.up();
  await cho(() => !giong.dangThu, 8000, 'thả → kết quả');

  // 02 — chờ xác nhận: tin cậy 0,41
  process.env.TAI_NGHE_KICH_BAN = 'thap';
  await giuNut();
  await cho(() => so.giong.pha === 'nghe', 8000);
  await doi(300);
  await page.mouse.up();
  await cho(() => so.giong.pha === 'cho-xac-nhan', 8000, 'chờ xác nhận');
  await doi(300);
  await page.fill('#giong-sua', 'Gen ơi, mở màn hình');
  await page.screenshot({ path: path.join(RA, '02-cho-xac-nhan.png') });
  nhatKy.anh.push({ anh: '02-cho-xac-nhan.png', giong: so.moHinh().giong });
  const truoc = nhatKy.lenhBridge.length;
  await page.click('#giong-gui');
  await cho(() => nhatKy.lenhBridge.slice(truoc).some((l) => l.cmd === 'stage.hear'), 5000, 'Gửi → stage.hear');
  nhatKy.guiSauSua = nhatKy.lenhBridge.slice(truoc).find((l) => l.cmd === 'stage.hear').args;

  // 03 — lỗi thiết bị (mã 2)
  process.env.TAI_NGHE_KICH_BAN = 'thiet-bi';
  await giuNut();
  await cho(() => so.giong.pha === 'loi', 8000, 'lỗi');
  await page.mouse.up();
  await doi(300);
  await page.screenshot({ path: path.join(RA, '03-loi-thiet-bi.png') });
  nhatKy.anh.push({ anh: '03-loi-thiet-bi.png', giong: so.moHinh().giong });

  // 04 — nút 🎤 tắt khi Gen đang nói
  so.nhanSuKien('actor.sayStart', { actor: 'gen', text: 'Dạ, em mở màn hình ngay ạ.' });
  so.giongNghi();
  await ve();
  await doi(300);
  nhatKy.nutKhiGenNoi = await nut.evaluate((e) => ({ disabled: e.disabled, title: e.title }));
  await page.screenshot({ path: path.join(RA, '04-mic-tat-khi-gen-noi.png') });
  thanhCong = true;
} catch (e) {
  nhatKy.loi = String(e?.stack ?? e);
  console.error(e);
} finally {
  giong.huy('kết thúc chụp');
  cauNoi.tat();
  await trinh.close();
  sv.close();
  for (const c of wss.clients) c.terminate();
  wss.close();
  nhatKy.thanhCong = thanhCong;
  nhatKy.ketThuc = new Date().toISOString();
  fs.writeFileSync(path.join(RA, 'nhat-ky-chup-v2.json'), JSON.stringify(nhatKy, null, 2) + '\n');
  console.log(`[chup-v2] ${thanhCong ? 'xong' : 'LỖI'} → ${RA} · CSP ${nhatKy.viPhamCsp.length} · console lỗi ${nhatKy.loiConsole.length}`);
  process.exit(thanhCong ? 0 : 1);
}
