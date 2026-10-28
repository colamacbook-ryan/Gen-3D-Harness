/**
 * kiem-ban-duyet.mjs — bằng chứng BÀN DUYỆT (phương án 1, Ryan 28/10) trên trình duyệt thật:
 *   bridge THẬT + vite dev + tab sân khấu + tab Bàn duyệt, sự kiện đội ngũ bơm qua ws như hook Claude Code.
 *   1. báo cáo của Nhi hiện ở "Cần anh quyết" (Nam KHÔNG tự đóng dấu);
 *   2. "Trả lại" khi chưa ghi góp ý ⇒ không gửi, nhắc ghi góp ý;
 *   3. bấm "Ký duyệt" ⇒ sổ có dấu CEO ký tay, hàng chờ rỗng, sân khấu diễn bong bóng của Nam;
 *   4. vòng hai: trả lại kèm góp ý ⇒ dấu CEO TRẢ LẠI mang góp ý;
 *   5. tải lại tab sân khấu ⇒ sổ còn nguyên (localStorage), Bàn duyệt tự cập nhật lại;
 *   6. màn 390 px dùng được (không cuộn ngang trang); 0 lỗi console ở Bàn duyệt.
 * Cổng riêng: bridge GOC..GOC+3 (mặc định 8961, env KIEM_CONG_GOC), web 5481 — không đụng 8787–8790/5173.
 * Chạy: node scripts/kiem-ban-duyet.mjs  →  docs/ban-duyet/ (ảnh + nhat-ky.json)
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from 'playwright';

const GOC_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RA = path.join(GOC_REPO, 'docs/ban-duyet');
fs.mkdirSync(RA, { recursive: true });
const GOC = Number(process.env.KIEM_CONG_GOC ?? 8961);
const WEB = Number(process.env.KIEM_CONG_WEB ?? 5481);
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const ket = { muc: [], loiConsole: [] };
const kiem = (ten, dk, them = {}) => {
  console.log(`${dk ? 'ĐẠT ' : 'HỎNG'} ${ten}`);
  ket.muc.push({ ten, dat: !!dk, ...them });
};

const bat = (lenh, args, env = {}) =>
  spawn(lenh, args, { cwd: GOC_REPO, stdio: 'ignore', detached: true, env: { ...process.env, ...env } });
const bridge = bat('node_modules/.bin/tsx', ['bridge/server.ts'], {
  GEN_STAGE_PORT: String(GOC),
  GEN_STAGE_TTS_PORT: String(GOC + 1),
  GEN_STAGE_MCP_PORT: String(GOC + 2),
  GEN_STAGE_STT_PORT: String(GOC + 3),
});
const vite = bat('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(WEB), '--strictPort']);
const giet = (p) => {
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    /* đã tắt */
  }
};

/** Client ws như hook Claude Code: chỉ gửi `team.event`. */
async function noiHook() {
  for (let i = 0; i < 60; i++) {
    try {
      return await new Promise((res, rej) => {
        const w = new WebSocket(`ws://127.0.0.1:${GOC}/`);
        w.on('open', () => res(w));
        w.on('error', rej);
      });
    } catch {
      await ngu(500);
    }
  }
  throw new Error('không nối được bridge');
}
let soId = 0;
const guiSuKien = (w, kind, them = {}) =>
  new Promise((res) => {
    const id = `k${++soId}`;
    const nghe = (t) => {
      const g = JSON.parse(String(t));
      if (g.id === id) {
        w.off('message', nghe);
        res(g);
      }
    };
    w.on('message', nghe);
    w.send(JSON.stringify({ id, cmd: 'team.event', args: { kind, id: `${kind}-${soId}`, source: 'claude-code', ...them } }));
  });

let br;
let thoat = 1;
try {
  const hook = await noiHook();
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${WEB}/duyet.html`)).ok) break;
    } catch {
      await ngu(500);
    }
  }
  br = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const sk = await ctx.newPage();
  await sk.goto(`http://127.0.0.1:${WEB}/?bridgePort=${GOC}`);
  await sk.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  kiem('sân khấu lên và nối bridge', true);

  const bd = await ctx.newPage();
  bd.on('console', (m) => m.type() === 'error' && ket.loiConsole.push(m.text().slice(0, 200)));
  bd.on('pageerror', (e) => ket.loiConsole.push(String(e).slice(0, 200)));
  await bd.goto(`http://127.0.0.1:${WEB}/duyet.html?bridgePort=${GOC}`);
  await bd.waitForSelector('#tt-san-khau.ok', { timeout: 30000 });
  kiem('Bàn duyệt nối bridge, thấy sân khấu đang nối', true);

  /** Một vòng việc như Claude Code: CEO giao → 2 subagent → nộp → báo cáo. */
  const motVong = async (tag) => {
    await guiSuKien(hook, 'session-start');
    await guiSuKien(hook, 'brief');
    await guiSuKien(hook, 'spawn', { id: `${tag}-a`, role: 'builder', task: 'Viết test cho Bàn duyệt' });
    await guiSuKien(hook, 'spawn', { id: `${tag}-b`, role: 'reviewer', task: 'Rà bảo mật lệnh team.sign' });
    await ngu(4000);
    await guiSuKien(hook, 'done', { id: `${tag}-a` });
    await guiSuKien(hook, 'done', { id: `${tag}-b` });
    await guiSuKien(hook, 'report');
  };
  const doiNgu = () => sk.evaluate(() => window.stage.doiNgu());
  const choBaoCao = async (n) => {
    const het = Date.now() + 300000;
    while (Date.now() < het) {
      const t = await doiNgu();
      if (t && t.choKy.length >= n) return t;
      await ngu(1000);
    }
    throw new Error('báo cáo không vào hàng chờ ký trong 300 s');
  };

  const t0 = Date.now();
  await motVong('v1');
  const tt1 = await choBaoCao(1);
  const soBc1 = tt1.choKy[0].so;
  kiem('báo cáo vào hàng chờ ký, Nam KHÔNG tự đóng dấu', !tt1.soQuyTrinh.some((b) => b.loai === 'ceo-duyet'), {
    giayTo: tt1.soQuyTrinh.map((b) => b.loai),
    giay: Math.round((Date.now() - t0) / 1000),
  });
  await bd.waitForSelector('.viec .chip.nhan', { timeout: 20000 });
  const tieuDe = await bd.textContent('.viec h3');
  kiem('Bàn duyệt hiện "Ký báo cáo" trong Cần anh quyết', tieuDe?.includes(`#${soBc1}`), { tieuDe });
  await bd.click('.giay-to summary');
  await bd.screenshot({ path: path.join(RA, '1-hom-nay-cho-ky.png') });

  // trả lại khi chưa ghi góp ý ⇒ không gửi
  await bd.click('.viec-nut .nut:not(.chinh)');
  await bd.waitForSelector('.toast.hien.loi', { timeout: 5000 });
  const vanCho = (await doiNgu()).choKy.length === 1;
  kiem('Trả lại thiếu góp ý ⇒ không gửi, nhắc ghi góp ý', vanCho);

  await bd.click('.viec-nut .nut.chinh');
  await bd.waitForSelector('.toast.hien.ok', { timeout: 10000 });
  const tt2 = await doiNgu();
  const dau = tt2.soQuyTrinh.at(-1);
  kiem('Ký duyệt ⇒ dấu CEO ký tay, hàng chờ rỗng', dau?.loai === 'ceo-duyet' && dau?.chiTiet?.kyTay === true && tt2.choKy.length === 0, { dau });
  // sân khấu diễn: Nam nói câu đã ký (bong bóng)
  const coBongBong = await sk
    .waitForFunction(() => [...document.querySelectorAll('.bong-bong, .bubble, [class*="bong"]')].some((e) => /Đã ký duyệt/.test(e.textContent ?? '')), null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  kiem('sân khấu: Nam nói "Đã ký duyệt…" bằng bong bóng', coBongBong);
  await sk.screenshot({ path: path.join(RA, '2-san-khau-sau-ky.png') });
  await bd.waitForFunction(() => !document.querySelector('.viec .chip.nhan'), null, { timeout: 10000 });
  await bd.screenshot({ path: path.join(RA, '3-hom-nay-da-ky.png') });

  // vòng 2: trả lại kèm góp ý
  await motVong('v2');
  const tt3 = await choBaoCao(1);
  const soBc2 = tt3.choKy[0].so;
  await bd.waitForSelector('.viec textarea', { timeout: 20000 });
  await bd.fill('.viec textarea', 'Thiếu test cho ca token sai');
  await bd.click('.viec-nut .nut:not(.chinh)');
  await bd.waitForSelector('.toast.hien.ok', { timeout: 10000 });
  const tt4 = await doiNgu();
  const dau2 = tt4.soQuyTrinh.at(-1);
  kiem('Trả lại kèm góp ý ⇒ dấu CEO TRẢ LẠI mang góp ý', dau2?.loai === 'ceo-tra-lai' && dau2?.chiTiet?.gopY === 'Thiếu test cho ca token sai' && dau2?.chiTiet?.baoCao === soBc2, { dau2 });

  // sổ quy trình
  await bd.goto(`http://127.0.0.1:${WEB}/duyet.html?bridgePort=${GOC}#so`);
  await bd.waitForSelector('.bang tbody tr', { timeout: 15000 });
  await bd.click('.bang tbody tr');
  await bd.screenshot({ path: path.join(RA, '4-so-quy-trinh.png') });

  // tải lại sân khấu ⇒ sổ còn
  const soTruoc = tt4.soQuyTrinh.length;
  await sk.reload();
  await sk.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  const tt5 = await doiNgu();
  kiem('tải lại sân khấu ⇒ sổ còn nguyên', tt5.soQuyTrinh.length === soTruoc, { truoc: soTruoc, sau: tt5.soQuyTrinh.length });
  await bd.waitForSelector('#tt-san-khau.ok', { timeout: 30000 });

  // điện thoại 390 px
  const dt = await ctx.newPage();
  await dt.setViewportSize({ width: 390, height: 844 });
  await dt.goto(`http://127.0.0.1:${WEB}/duyet.html?bridgePort=${GOC}`);
  await dt.waitForSelector('.kpis', { timeout: 15000 });
  const rongTrang = await dt.evaluate(() => document.documentElement.scrollWidth);
  kiem('390 px: trang không cuộn ngang', rongTrang <= 390, { rongTrang });
  await dt.screenshot({ path: path.join(RA, '5-dien-thoai-390.png'), fullPage: true });

  kiem('Bàn duyệt: 0 lỗi console', ket.loiConsole.length === 0, { loi: ket.loiConsole });
  thoat = ket.muc.every((m) => m.dat) ? 0 : 1;
} catch (e) {
  ket.loi = String(e?.message ?? e).slice(0, 400);
  console.error('LỖI', ket.loi);
} finally {
  ket.dat = thoat === 0;
  fs.writeFileSync(path.join(RA, 'nhat-ky.json'), `${JSON.stringify(ket, null, 2)}\n`);
  await br?.close().catch(() => {});
  giet(bridge);
  giet(vite);
}
console.log(ket.dat ? 'ĐẠT' : 'KHÔNG ĐẠT');
process.exit(thoat);
