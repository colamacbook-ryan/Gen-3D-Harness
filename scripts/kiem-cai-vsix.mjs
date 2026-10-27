/**
 * kiem-cai-vsix.mjs — kiểm GÓI CÀI MVP đúng như Sếp sẽ dùng: VS Code THẬT đã cài
 * `.vsix` bằng `scripts/cai-vscode.sh`, mở một thư mục KHÔNG phải repo (dự án bất
 * kỳ), KHÔNG đặt `genStage.root` — extension phải tự tìm repo qua
 * `~/.config/gen-stage/root`, tự bật bridge + sân khấu, và chatroom gõ được.
 *
 * Chạy (Linux không màn hình; VS Code + thư mục cài do bước cài chuẩn bị):
 *   E2E_VSIX_VSC=<thư mục vscode-linux-x64-…> E2E_VSIX_DIR=<thư mục tạm có ext/ ud/ cfg/> \
 *     node scripts/kiem-cai-vsix.mjs
 * Bấm lệnh qua bảng lệnh (Ctrl+Shift+P) như người thật, soi webview qua CDP 9227.
 * Ra: docs/e2e/cai-vsix.json + docs/e2e/cai-vsix-*.png
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VSC = process.env.E2E_VSIX_VSC;
const E = process.env.E2E_VSIX_DIR;
if (!VSC || !E) {
  console.error('Thiếu E2E_VSIX_VSC / E2E_VSIX_DIR');
  process.exit(64);
}
const CDP = 9227;
const DU_AN = path.join(E, 'du-an-bat-ky');
fs.mkdirSync(DU_AN, { recursive: true });
fs.writeFileSync(path.join(DU_AN, 'xin-chao.ts'), 'export const loiChao = "chào";\n');
fs.mkdirSync(path.join(E, 'ud', 'User'), { recursive: true });
fs.writeFileSync(
  path.join(E, 'ud', 'User', 'settings.json'),
  JSON.stringify({ 'security.workspace.trust.enabled': false, 'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false }, null, 2),
);

const kq = { buoc: [], loi: [] };
const t0 = Date.now();
const moc = (ten, them = {}) => {
  const b = { ten, s: Math.round((Date.now() - t0) / 100) / 10, ...them };
  kq.buoc.push(b);
  console.log(JSON.stringify(b));
};

const vsc = spawn(
  'xvfb-run',
  ['-a', '-s', '-screen 0 1600x1000x24', path.join(VSC, 'code'), `--extensions-dir=${path.join(E, 'ext')}`, `--user-data-dir=${path.join(E, 'ud')}`,
    `--remote-debugging-port=${CDP}`, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--no-sandbox', '--disable-gpu-sandbox',
    // máy không GPU (cloud): WebGL phần mềm — máy Sếp có GPU thì đặt E2E_VSIX_GL="" để chạy GPU thật
    ...(process.env.E2E_VSIX_GL ?? '--ignore-gpu-blocklist --use-angle=swiftshader --enable-unsafe-swiftshader').split(' ').filter(Boolean),
    DU_AN],
  { env: { ...process.env, XDG_CONFIG_HOME: path.join(E, 'cfg') }, stdio: 'ignore', detached: true },
);

let br;
let thoat = 1;
try {
  for (let i = 0; i < 90 && !br; i++) {
    try {
      br = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!br) throw new Error('không nối được CDP của VS Code');
  const tim = () => br.contexts().flatMap((c) => c.pages()).find((p) => /workbench/.test(p.url()));
  let wb;
  for (let i = 0; i < 60 && !wb; i++) {
    wb = tim();
    if (!wb) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!wb) throw new Error('không thấy cửa sổ workbench');
  await wb.waitForSelector('.monaco-workbench', { timeout: 120000 });
  moc('VS Code mở thư mục KHÔNG phải repo', { thuMuc: `<thư mục tạm>/${path.basename(DU_AN)}` });
  await wb.waitForTimeout(4000);

  const lenh = async (ten) => {
    await wb.keyboard.press('Control+Shift+P');
    await wb.waitForSelector('.quick-input-widget input', { timeout: 20000 });
    await wb.keyboard.type(ten, { delay: 15 });
    await wb.waitForTimeout(800);
    await wb.keyboard.press('Enter');
  };
  await lenh('Gen-Stage: Mở sân khấu');
  moc('bấm "Gen-Stage: Mở sân khấu"');

  // sân khấu = iframe vite (127.0.0.1:5173) nằm trong webview của tab
  const timSanKhau = () => wb.frames().find((f) => /127\.0\.0\.1:5173/.test(f.url()));
  let sk;
  const het = Date.now() + 240000;
  while (Date.now() < het) {
    sk = timSanKhau();
    if (sk && (await sk.evaluate(() => window.stage?.san === true).catch(() => false))) break;
    sk = undefined;
    await wb.waitForTimeout(1500);
  }
  if (!sk) throw new Error('sân khấu không lên trong 240 s');
  moc('sân khấu lên (window.stage.san) — bridge + vite do extension tự bật');
  kq.actors = await sk.evaluate(() => window.stage.run('stage.describe', {}).then((r) => (r.result.data ?? r.result).actors.map((a) => `${a.id}:${a.label ?? a.name}`)));
  await wb.waitForTimeout(5000);
  await wb.screenshot({ path: path.join(GOC, 'docs/e2e/cai-vsix-san-khau.png') });

  // chatroom ở cột phải: mở view rồi gõ như người thật
  await lenh('Gen-Stage: Focus on Chatroom View');
  let cr;
  for (let i = 0; i < 40 && !cr; i++) {
    for (const f of wb.frames()) {
      if (await f.evaluate(() => document.title === 'Chatroom' && !!document.querySelector('#nhap')).catch(() => false)) cr = f;
    }
    if (!cr) await wb.waitForTimeout(1000);
  }
  if (!cr) throw new Error('không thấy chatroom');
  moc('chatroom mở ở cột phải');
  await sk.evaluate(() => {
    window.__nghe = [];
    window.stage.on('user.text', (e) => window.__nghe.push(e.data?.text ?? e.text));
  });
  await cr.click('#nhap');
  await cr.type('#nhap', 'Nhi ơi, chào em', { delay: 20 });
  await cr.press('#nhap', 'Enter');
  await sk.waitForFunction(() => window.__nghe.some((t) => /chào em/.test(t)), null, { timeout: 30000 });
  moc('gõ ở chatroom → sân khấu nhận user.text');
  await wb.waitForTimeout(2500);
  await wb.screenshot({ path: path.join(GOC, 'docs/e2e/cai-vsix-chatroom.png') });

  // nhật ký extension: root phải lấy từ file cài, KHÔNG phải "(tự dò)"
  const logs = [];
  const quet = (d) => {
    for (const x of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, x.name);
      if (x.isDirectory()) quet(p);
      else if (/Gen-Stage\.log$/.test(x.name)) logs.push(p);
    }
  };
  quet(path.join(E, 'ud', 'logs'));
  const dongRoot = logs.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')).find((d) => d.includes('root:'));
  kq.dongRoot = dongRoot?.trim();
  if (!dongRoot || !dongRoot.includes(`root: ${GOC}`) || dongRoot.includes('tự dò')) throw new Error(`root sai: ${dongRoot}`);
  moc('extension đọc repo từ ~/.config/gen-stage/root (không tự dò, không phải đặt setting)');

  await lenh('Gen-Stage: Tắt dịch vụ do VS Code bật');
  await wb.waitForTimeout(3000);
  moc('tắt dịch vụ do VS Code bật');
  thoat = 0;
} catch (e) {
  kq.loi.push(String(e?.message ?? e).slice(0, 300));
  console.error('LỖI', e?.message ?? e);
} finally {
  kq.dat = thoat === 0;
  fs.writeFileSync(path.join(GOC, 'docs/e2e/cai-vsix.json'), `${JSON.stringify(kq, null, 2)}\n`);
  await br?.close().catch(() => {});
  try {
    process.kill(-vsc.pid, 'SIGTERM');
  } catch {
    /* đã tắt */
  }
}
console.log(kq.dat ? 'ĐẠT' : 'KHÔNG ĐẠT');
process.exit(thoat);
