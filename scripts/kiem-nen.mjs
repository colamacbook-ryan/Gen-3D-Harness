/**
 * kiem-nen.mjs — BẰNG CHỨNG V1 · CHẾ ĐỘ NỀN (INT-06).
 *
 * Chạy:  pnpm -C vscode build && node scripts/kiem-nen.mjs
 *
 * Đo trên app THẬT (vite 127.0.0.1:5213, `?bridge=0` — không cần bridge), hai mặt:
 *   A. Trình duyệt thường (trang top-level):
 *      full → nền qua `visibilitychange` giả (document.hidden=true, rAF vẫn chạy
 *      vì trang thật không ẩn — đúng thứ cần đo: trần fps) → full → nền qua `blur`.
 *   B. Vỏ panel VS Code THẬT (`vscode/out/thuan/html.js` — `taoHtmlSanKhau`, CSP
 *      thật, `acquireVsCodeApi` giả), phục vụ cùng origin với app: "host" gửi
 *      `{lenh:"hienAn", visible, active}` vào vỏ → vỏ chuyển `postMessage` xuống
 *      iframe → app đổi chế độ.
 * Mỗi chế độ: fps = Δ(khung VẼ thật, `window.stage.doVe().soKhung`) / Δt; ghi
 * bloom + pixelRatio + `stage.describe().renderMode`. Ở nền: `actor.moveTo`
 * owner → so `durationMs` hứa với thời gian thật tới `actor.arrived` (±10 %).
 *
 * Cổng RIÊNG của V1: vite 5213 (dải 8870–8879 để dành, script này không cần
 * bridge). Vite bật `detached` → dọn bằng PGID của chính nó (kill(-pgid)).
 *
 * Ra: docs/v1/nhat-ky-kiem-nen.json
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createConnection } from 'node:net';

const require = createRequire(import.meta.url);
const GOC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RA = path.join(GOC, 'docs', 'v1');
fs.mkdirSync(RA, { recursive: true });
const FILE_HTML = path.join(GOC, 'vscode', 'out', 'thuan', 'html.js');
if (!fs.existsSync(FILE_HTML)) {
  console.error('Chưa build extension: chạy `pnpm -C vscode build` trước.');
  process.exit(2);
}
const html = require(FILE_HTML);

const CONG_DEV = 5213;
const ORIGIN = `http://127.0.0.1:${CONG_DEV}`;
// bridge tắt; cổng tts/stt trỏ vào dải riêng 8870–8873 (không ai nghe → bị từ chối,
// KHÔNG gõ cửa 8787/8788 của Sếp hay builder khác)
const Q_APP = 'bridge=0&bridgePort=8870&ttsPort=8871&sttPort=8873';
// nhỏ: renderer phần mềm (swiftshader) mới đủ nhanh để thấy trần 15 fps; đổi bằng KIEM_NEN_KHUNG=WxH
const [KW, KH] = (process.env.KIEM_NEN_KHUNG ?? '320x200').split('x').map(Number);
const KHUNG = { width: KW, height: KH };
const CUA_SO_DO_MS = Number(process.env.KIEM_NEN_DO_MS ?? 6000);
const DUNG_SAI_THOI_LUONG = 0.1;

const nhatKy = { batDau: new Date().toISOString(), cong: { dev: CONG_DEV }, khung: KHUNG, cuaSoDoMs: CUA_SO_DO_MS, buoc: [], do: {}, diChuyen: {}, loiConsole: [], pgidDaDon: [] };
const ghi = (...x) => {
  console.log('[kiem-nen]', ...x);
  nhatKy.buoc.push(x.join(' '));
};
const doi = (ms) => new Promise((r) => setTimeout(r, ms));

function congBan(cong) {
  return new Promise((res) => {
    const sk = createConnection({ host: '127.0.0.1', port: cong });
    const xong = (v) => {
      sk.destroy();
      res(v);
    };
    sk.once('connect', () => xong(true));
    sk.once('error', () => xong(false));
    setTimeout(() => xong(false), 800);
  });
}

if (await congBan(CONG_DEV)) {
  console.error(`⛔ Cổng ${CONG_DEV} đang bận — không đụng tiến trình lạ, dừng.`);
  process.exit(3);
}

ghi(`bật vite riêng 127.0.0.1:${CONG_DEV}`);
const vite = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(CONG_DEV), '--strictPort'], {
  cwd: GOC,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
nhatKy.pgidVite = vite.pid;
function donVite() {
  if (!vite.pid) return;
  try {
    process.kill(-vite.pid, 'SIGTERM');
    if (!nhatKy.pgidDaDon.includes(vite.pid)) nhatKy.pgidDaDon.push(vite.pid);
  } catch {
    /* nhóm đã chết */
  }
}
process.on('exit', donVite);
process.on('SIGINT', () => process.exit(130));
await new Promise((ok, loi) => {
  const han = setTimeout(() => loi(new Error('vite không lên trong 40 s')), 40000);
  const doc = (d) => {
    if (/ready in|Local:/.test(String(d))) {
      clearTimeout(han);
      ok();
    }
  };
  vite.stdout.on('data', doc);
  vite.stderr.on('data', doc);
});

/** Đo fps trong một frame (page hoặc iframe) — Δ khung vẽ thật / Δ thời gian. */
async function doFps(khung, nhan) {
  const a = await khung.evaluate(() => ({ ...window.stage.doVe(), t: performance.now() }));
  await doi(CUA_SO_DO_MS);
  const b = await khung.evaluate(() => ({ ...window.stage.doVe(), t: performance.now() }));
  const r = await khung.evaluate(() => window.stage.describe());
  const fps = ((b.soKhung - a.soKhung) * 1000) / (b.t - a.t);
  const ket = {
    fps: Math.round(fps * 100) / 100,
    soKhung: b.soKhung - a.soKhung,
    ms: Math.round(b.t - a.t),
    renderMode: b.renderMode,
    describeRenderMode: r.result?.renderMode,
    bloom: b.bloom,
    pixelRatio: b.pixelRatio,
  };
  nhatKy.do[nhan] = ket;
  ghi(`${nhan}: ${ket.fps} fps (${ket.soKhung} khung / ${ket.ms} ms) · mode=${ket.renderMode} · describe=${ket.describeRenderMode} · bloom=${ket.bloom} · pr=${ket.pixelRatio}`);
  return ket;
}

/** actor.moveTo owner → so durationMs hứa với thời gian thật tới actor.arrived. */
async function doDiChuyen(khung, nhan, toi) {
  const ket = await khung.evaluate(async (toi) => {
    const t0 = performance.now();
    let tDen = 0;
    const den = new Promise((ok) => {
      const bo = window.stage.on('actor.arrived', (e) => {
        if (e.data?.actor === 'owner') {
          tDen = performance.now();
          bo();
          ok();
        }
      });
    });
    const r = await window.stage.run('actor.moveTo', { actor: 'owner', to: toi });
    if (!r.ok) return { loi: r.error };
    await den;
    return { durationMs: r.result.durationMs, thucMs: Math.round(tDen - t0), renderMode: window.stage.doVe().renderMode };
  }, toi);
  if (!ket.loi) {
    ket.lech = Math.round(((ket.thucMs - ket.durationMs) / ket.durationMs) * 1000) / 1000;
    ket.dat = Math.abs(ket.lech) <= DUNG_SAI_THOI_LUONG;
  }
  nhatKy.diChuyen[nhan] = ket;
  ghi(`${nhan}: moveTo ${toi} hứa ${ket.durationMs} ms, thật ${ket.thucMs} ms, lệch ${(ket.lech * 100).toFixed(1)} % (${ket.dat ? 'ĐẠT' : 'KHÔNG ĐẠT'}) · mode=${ket.renderMode}`);
  return ket;
}

let browser;
let loi = null;
try {
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  // deviceScaleFactor 2: để thấy pixelRatio 2 (thường) → 1 (nền) → 2 (khôi phục)
  const ctx = await browser.newContext({ viewport: KHUNG, deviceScaleFactor: 2 });
  // vỏ VS Code gọi acquireVsCodeApi — giả một bản ghi lại tin gửi lên host
  await ctx.addInitScript(() => {
    if (typeof window.acquireVsCodeApi !== 'function') {
      window.__tinLenHost = [];
      window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__tinLenHost.push(m) });
    }
  });
  /* -------------------------- C. cổng khung trên rAF THẬT (không vẽ cảnh) */
  // Renderer phần mềm của máy kiểm chỉ ~3–5 fps nên KHÔNG chạm được trần 15 ở
  // A/B. Đo riêng cổng bỏ khung trên một trang TRỐNG cùng origin (không có sân khấu chia CPU): chạy đúng `nenVeKhung` (nạp module thật qua
  // vite) trên mốc rAF thật của Chromium trong 5 s, đếm khung được phép vẽ.
  ghi('C. cổng bỏ khung (nenVeKhung) trên rAF thật của Chromium, không vẽ');
  const trang = await ctx.newPage();
  await trang.route(`${ORIGIN}/__trong.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>trống</title>' }));
  await trang.goto(`${ORIGIN}/__trong.html`);
  nhatKy.congRaf = await trang.evaluate(async () => {
    const m = await import('/src/stage/che-do-nen.ts');
    const dem = (mode) =>
      new Promise((ok) => {
        let raf = 0;
        let ve = 0;
        let cuoi = -Infinity;
        let t0 = 0;
        const buoc = (t) => {
          if (!t0) t0 = t;
          raf++;
          if (m.nenVeKhung(mode, t, cuoi)) {
            cuoi = t;
            ve++;
          }
          if (t - t0 < 5000) requestAnimationFrame(buoc);
          else ok({ mode, rafHz: Math.round((raf * 10000) / (t - t0)) / 10, fpsVe: Math.round((ve * 10000) / (t - t0)) / 10 });
        };
        requestAnimationFrame(buoc);
      });
    return [await dem('full'), await dem('nen')];
  });
  await trang.close();
  ghi(`cổng rAF: ${JSON.stringify(nhatKy.congRaf)}`);

  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && nhatKy.loiConsole.push(`[trang] ${m.text()}`));
  page.on('pageerror', (e) => nhatKy.loiConsole.push(`[trang] pageerror ${e.message}`));

  /* ---------------------------------------------- A. trình duyệt thường */
  ghi('A. mở app top-level');
  await page.goto(`${ORIGIN}/?${Q_APP}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await page.bringToFront();
  // headless có thể chưa có focus lúc mở → ép về "đang xem" bằng sự kiện focus thật của cửa sổ
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await doi(1500);
  // hâm: cú đi đầu tiên dựng clip đi bộ + biên dịch shader bóng → khung đầu rất dài, chặn hẹn giờ
  await doDiChuyen(page, 'A0-ham-may', 'cua');
  await doFps(page, 'A1-thuong');
  await doDiChuyen(page, 'A1-thuong', 'cua-so');

  ghi('A2. nền qua visibilitychange giả (document.hidden = true)');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await doi(500);
  await doFps(page, 'A2-nen-visibility');
  await doDiChuyen(page, 'A2-nen-visibility', 'cua');

  ghi('A3. hiện lại (visibilitychange) → phải về full, bloom về đúng như trước nền');
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await doi(500);
  await doFps(page, 'A3-thuong-lai');

  ghi('A4. nền qua blur của cửa sổ');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await doi(500);
  await doFps(page, 'A4-nen-blur');
  await doDiChuyen(page, 'A4-nen-blur', 'cua-so');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await doi(300);
  nhatKy.suKienRenderModeA = await page.evaluate(() =>
    JSON.parse(window.stage.log()).banGhi.filter((d) => d.event === 'stage.renderMode').map((d) => d.data),
  ).catch(() => null);

  /* ----------------------------------------------- B. vỏ panel VS Code */
  ghi('B. vỏ panel VS Code thật (taoHtmlSanKhau) cùng origin với app');
  const voHtml = html.taoHtmlSanKhau({ url: `${ORIGIN}/?${Q_APP}`, origin: ORIGIN, cspSource: ORIGIN, nonce: html.taoNonce() });
  const page2 = await ctx.newPage();
  page2.on('console', (m) => m.type() === 'error' && nhatKy.loiConsole.push(`[vỏ] ${m.text()}`));
  page2.on('pageerror', (e) => nhatKy.loiConsole.push(`[vỏ] pageerror ${e.message}`));
  await page2.route(`${ORIGIN}/__vo-vscode.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: voHtml }));
  await page.close(); // một sân khấu một lúc — đỡ chia CPU cho renderer phần mềm
  await page2.goto(`${ORIGIN}/__vo-vscode.html`, { waitUntil: 'load' });
  // "host" → vỏ: giống san-khau.ts (napLai rồi hienAn)
  const host = (m) => page2.evaluate((m) => window.postMessage(m, '*'), m);
  await host({ lenh: 'napLai', url: `${ORIGIN}/?${Q_APP}` });
  await host({ lenh: 'hienAn', visible: true, active: true });
  let iframe = null;
  for (let i = 0; i < 300 && !iframe; i++) {
    iframe = page2.frames().find((f) => f.url().startsWith(`${ORIGIN}/?${Q_APP}`));
    if (!iframe) await doi(200);
  }
  if (!iframe) throw new Error('vỏ không nạp iframe');
  await iframe.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await doi(1500);
  nhatKy.tinVoGuiHost = await page2.evaluate(() => window.__tinLenHost);
  await doFps(iframe, 'B1-vscode-active');

  ghi('B2. host báo panel mất active → vỏ postMessage xuống iframe');
  await host({ lenh: 'hienAn', visible: true, active: false });
  await doi(500);
  await doFps(iframe, 'B2-vscode-khong-active');
  await doDiChuyen(iframe, 'B2-vscode-khong-active', 'cua');

  ghi('B3. tin giả từ CHÍNH iframe (không phải cửa sổ cha) phải bị bỏ qua');
  await iframe.evaluate(() => window.postMessage({ nguon: 'gen-stage-vscode', loai: 'nen', visible: true, active: true }, '*'));
  await doi(300);
  nhatKy.tinGiaBiBo = (await iframe.evaluate(() => window.stage.doVe().renderMode)) === 'nen';
  ghi(`tin giả bị bỏ: ${nhatKy.tinGiaBiBo}`);

  ghi('B4. host báo active lại → full');
  await host({ lenh: 'hienAn', visible: true, active: true });
  await doi(500);
  await doFps(iframe, 'B4-vscode-active-lai');

  ghi('B5. "Tải lại" iframe khi panel đang KHÔNG active → app mới nạp phải vào nền ngay (vỏ gửi lại tin cuối khi load)');
  await host({ lenh: 'hienAn', visible: true, active: false });
  await host({ lenh: 'napLai', url: `${ORIGIN}/?${Q_APP}&lan=2` });
  let iframe2 = null;
  for (let i = 0; i < 300 && !iframe2; i++) {
    iframe2 = page2.frames().find((f) => f.url().includes('lan=2'));
    if (!iframe2) await doi(200);
  }
  await iframe2.waitForFunction(() => window.stage?.san === true, null, { timeout: 180000 });
  await doi(1000);
  nhatKy.taiLaiKhiNen = await iframe2.evaluate(() => window.stage.doVe());
  ghi(`sau tải lại: ${JSON.stringify(nhatKy.taiLaiKhiNen)}`);
} catch (e) {
  loi = e;
  nhatKy.loi = String(e?.stack ?? e);
  console.error(e);
} finally {
  await browser?.close().catch(() => undefined);
  donVite();
}

/* ------------------------------------------------------------ kết luận */
const d = nhatKy.do;
const tatCaNen = Object.entries(d).filter(([k]) => /nen|khong-active/.test(k)).map(([, v]) => v);
const tatCaThuong = Object.entries(d).filter(([k]) => !/nen|khong-active/.test(k)).map(([, v]) => v);
nhatKy.ketLuan = {
  fpsThuong: tatCaThuong.map((v) => v.fps),
  fpsNen: tatCaNen.map((v) => v.fps),
  nenToiDa15Fps: tatCaNen.every((v) => v.fps <= 15.5),
  nenTatBloom: tatCaNen.every((v) => v.bloom === false),
  nenPixelRatio1: tatCaNen.every((v) => v.pixelRatio === 1),
  describeDung: Object.values(d).every((v) => v.describeRenderMode === v.renderMode),
  modeDung: tatCaNen.every((v) => v.renderMode === 'nen') && tatCaThuong.every((v) => v.renderMode === 'full'),
  bloomKhoiPhucDung: d['A3-thuong-lai']?.bloom === d['A1-thuong']?.bloom && d['B4-vscode-active-lai']?.bloom === d['B1-vscode-active']?.bloom,
  // ±10 % là yêu cầu cho chế độ NỀN; chế độ thường ghi để so (không chặn)
  thoiLuongNenDung10: Object.entries(nhatKy.diChuyen).filter(([k]) => /nen|khong-active/.test(k)).every(([, v]) => v.dat === true),
  tinGiaBiBo: nhatKy.tinGiaBiBo === true,
  taiLaiKhiNenVaoNen: nhatKy.taiLaiKhiNen?.renderMode === 'nen',
  congRafNenToiDa15: (nhatKy.congRaf ?? []).some((v) => v.mode === 'nen' && v.fpsVe <= 15.5 && v.fpsVe >= 12),
  pixelRatioKhoiPhuc: d['A1-thuong']?.pixelRatio === 2 && d['A3-thuong-lai']?.pixelRatio === 2,
  // lỗi console mong đợi: tts/stt gõ cổng 8871/8873 không ai nghe (bridge tắt có chủ đích)
  loiConsoleLa: nhatKy.loiConsole.filter((x) => !/ERR_CONNECTION_REFUSED/.test(x)).length,
};
nhatKy.xong = new Date().toISOString();
fs.writeFileSync(path.join(RA, 'nhat-ky-kiem-nen.json'), JSON.stringify(nhatKy, null, 2) + '\n');
ghi('kết luận:', JSON.stringify(nhatKy.ketLuan));
ghi(`ghi ${path.relative(GOC, path.join(RA, 'nhat-ky-kiem-nen.json'))} · PGID đã dọn: ${nhatKy.pgidDaDon.join(', ') || '(không có)'}`);
const dat = !loi && Object.entries(nhatKy.ketLuan).every(([k, v]) => (k === 'fpsThuong' || k === 'fpsNen' || k === 'loiConsoleLa' ? v === 0 : v === true));
process.exit(dat ? 0 : 1);
