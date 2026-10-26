/**
 * kiem-vscode-that.mjs — E2E extension `vscode/` trong VS Code THẬT (Electron, tải bằng
 * @vscode/test-electron), không giả "VS Code" như kiem-vscode.mjs.
 *
 * @vscode/test-electron KHÔNG có trong package.json của repo: cài ở thư mục ngoài rồi trỏ
 * bằng E2E_VSC_DIR (thư mục có node_modules/@vscode/test-electron).
 *
 * Chạy (Linux không màn hình):
 *   pnpm -C vscode build
 *   E2E_VSC_DIR=/đường/tới/thư-mục-cài xvfb-run -a node scripts/kiem-vscode-that.mjs
 *
 * Cổng: bridge 9012 · TTS 9013 · vite 9014 · STT 9015 · MCP 9016 (qua env thừa hưởng —
 * extension không có setting mcpPort). Không đụng 8787–8790/5173 của Sếp.
 * user-data-dir + extensions-dir tạm trong E2E_VSC_DIR (không ghi vào repo, không đụng VS Code của Sếp).
 * Ra: docs/e2e/vscode-that.json (kết quả từ trong extension host + trích log extension host + log kênh Gen-Stage).
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VSC_DIR = process.env.E2E_VSC_DIR;
if (!VSC_DIR) {
  console.error('Thiếu E2E_VSC_DIR (thư mục đã `npm i @vscode/test-electron`).');
  process.exit(64);
}
if (!fs.existsSync(path.join(GOC, 'vscode/out/extension.js'))) {
  console.error('Chưa build extension: pnpm -C vscode build');
  process.exit(2);
}
const require = createRequire(path.join(VSC_DIR, 'x.cjs'));
const { runTests, downloadAndUnzipVSCode } = require('@vscode/test-electron');

const C = { bridge: 9012, tts: 9013, dev: 9014, stt: 9015, mcp: 9016 };
const UD = path.join(VSC_DIR, 'user-data');
const EXTD = path.join(VSC_DIR, 'extensions');
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(path.join(UD, 'User'), { recursive: true });
fs.mkdirSync(EXTD, { recursive: true });
fs.writeFileSync(
  path.join(UD, 'User', 'settings.json'),
  JSON.stringify(
    {
      'genStage.root': GOC,
      'genStage.bridgePort': C.bridge,
      'genStage.ttsPort': C.tts,
      'genStage.devPort': C.dev,
      'genStage.sttPort': C.stt,
      'genStage.nao': 'tat',
      'genStage.tuBat': true,
      'security.workspace.trust.enabled': false,
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'extensions.autoUpdate': false,
    },
    null,
    2,
  ),
);
const RA_TRONG = path.join(VSC_DIR, 'ket-qua-suite.json');
fs.rmSync(RA_TRONG, { force: true });

const exe = await downloadAndUnzipVSCode({ version: process.env.E2E_VSC_VERSION ?? 'stable', cachePath: path.join(VSC_DIR, '.vscode-test') });
const t0 = Date.now();
// Soi bên trong webview qua CDP của Electron (cổng 9017): frame nào đã nạp, console có lỗi gì,
// iframe sân khấu có WebGL không — VS Code không cho đọc console webview qua API.
const CDP = 9017;
const soi = { frames: [], console: [], danhGia: [] };
async function soiWebview() {
  const { chromium } = await import('playwright');
  let br;
  for (let i = 0; i < 60 && !br; i++) {
    try {
      br = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!br) return void (soi.loi = 'không nối được CDP');
  const daGan = new Set();
  const het = Date.now() + 70000;
  while (Date.now() < het) {
    for (const ctx of br.contexts())
      for (const pg of ctx.pages()) {
        if (!daGan.has(pg)) {
          daGan.add(pg);
          pg.on('console', (m) => soi.console.push({ t: Date.now() - t0, type: m.type(), url: m.location()?.url?.slice(0, 120), text: m.text().slice(0, 300) }));
          pg.on('pageerror', (e) => soi.console.push({ t: Date.now() - t0, type: 'pageerror', text: String(e).slice(0, 300) }));
        }
        for (const f of pg.frames()) {
          const u = f.url();
          if (!soi.frames.includes(u)) soi.frames.push(u);
          if (/fake\.html/.test(u) && (soi.vo ?? []).length < 14) {
            try {
              (soi.vo ??= []).push({
                t: Date.now() - t0,
                ...(await f.evaluate(() => {
                  const k = document.getElementById('san-khau');
                  return {
                    title: document.title,
                    trangThai: document.getElementById('trang-thai')?.textContent ?? null,
                    iframe: k && { src: k.getAttribute('src'), dataUrl: k.dataset.url, sandbox: k.getAttribute('sandbox') },
                    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null,
                    soScript: document.scripts.length,
                    coAcquire: typeof acquireVsCodeApi,
                    // tin host → vỏ có tới không, và có qua được bộ lọc `ev.source === window.parent` không
                    tinDaNhan: (window.__tinE2E ?? []).slice(0, 6),
                    ...(window.__tinE2E ? {} : (() => {
                      window.__tinE2E = [];
                      window.addEventListener('message', (ev) => window.__tinE2E.push({ sourceLaParent: ev.source === window.parent, sourceNull: ev.source === null, sourceLaChinhNo: ev.source === window, sourceLaTop: ev.source === window.top, parentLaTop: window.parent === window.top, origin: ev.origin, lenh: ev.data && ev.data.lenh }));
                      return { daGanBoGhi: true };
                    })()),
                  };
                })),
              });
              // E2E_VSC_GIA_SUA=1: MÔ PHỎNG bản sửa bộ lọc (gán src iframe y như napLai sẽ làm) để đo phần sau
              // của luồng (iframe nạp, WebGL, sân khấu nối bridge). KHÔNG sửa code sản phẩm; ghi rõ trong kết quả.
              if (process.env.E2E_VSC_GIA_SUA && !soi.giaSua && soi.vo.at(-1)?.title === 'Sân khấu' && (soi.vo.at(-1)?.tinDaNhan ?? []).some((x) => x.lenh === 'napLai')) {
                soi.giaSua = Date.now() - t0;
                await f.evaluate(() => {
                  const k = document.getElementById('san-khau');
                  k.src = k.dataset.url;
                });
              }
              if (!soi.daBamTaiLai && soi.vo.at(-1)?.title === 'Sân khấu' && soi.vo.at(-1)?.daGanBoGhi) {
                soi.daBamTaiLai = Date.now() - t0;
                await f.click('#tai-lai').catch((e) => (soi.loiBam = String(e).slice(0, 200)));
              }
            } catch (e) {
              (soi.vo ??= []).push({ loi: String(e).slice(0, 200) });
            }
          }
          if (/127\.0\.0\.1:9014/.test(u) && soi.danhGia.length < 3) {
            try {
              soi.danhGia.push({
                t: Date.now() - t0,
                ...(await f.evaluate(() => ({
                  href: location.href,
                  title: document.title,
                  coWindowStage: typeof window.stage,
                  webgl2: !!document.createElement('canvas').getContext('webgl2'),
                  webgl: !!document.createElement('canvas').getContext('webgl'),
                  bodyText: document.body.innerText.slice(0, 300),
                }))),
              });
            } catch (e) {
              soi.danhGia.push({ loi: String(e).slice(0, 200) });
            }
          }
        }
      }
    await new Promise((r) => setTimeout(r, 3000));
  }
  await br.close().catch(() => {});
}
const soiXong = process.env.E2E_VSC_CDP ? soiWebview().catch((e) => (soi.loi = String(e))) : Promise.resolve();
let maThoat = null;
let loiChay = null;
try {
  maThoat = await runTests({
    vscodeExecutablePath: exe,
    extensionDevelopmentPath: path.join(GOC, 'vscode'),
    extensionTestsPath: path.join(GOC, 'scripts/e2e-vscode/suite.cjs'),
    extensionTestsEnv: { E2E_VSC_RA: RA_TRONG, E2E_VSC_CONG: JSON.stringify(C), GEN_STAGE_MCP_PORT: String(C.mcp) },
    launchArgs: [GOC, '--user-data-dir', UD, '--extensions-dir', EXTD, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-gpu-sandbox', '--no-sandbox', ...(process.env.E2E_VSC_CDP ? [`--remote-debugging-port=${CDP}`] : []), ...(process.env.E2E_VSC_GL ? process.env.E2E_VSC_GL.split(' ') : [])],
  });
} catch (e) {
  loiChay = String(e?.stack ?? e);
}

await soiXong;
// gom log: extension host + kênh output "Gen-Stage" (VS Code ghi kênh output ra file trong logs/)
const logs = [];
const duyet = (d) => {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) duyet(p);
    else if (f.name.endsWith('.log')) logs.push(p);
  }
};
duyet(path.join(UD, 'logs'));
const doc = (p) => fs.readFileSync(p, 'utf8');
const exthost = logs.filter((p) => /exthost\.log$/.test(p)).map(doc).join('\n');
const genStageLog = logs.filter((p) => /Gen-Stage\.log$/.test(p)).map(doc).join('\n');
const dongLoiExthost = exthost
  .split('\n')
  .filter((d) => /\[error\]|\[warning\]/i.test(d))
  .filter((d) => /gen-stage|genStage|gen-labs/i.test(d) || !/(ms-vscode|vscode\.git|github)/i.test(d))
  .slice(0, 40);

const suite = fs.existsSync(RA_TRONG) ? JSON.parse(fs.readFileSync(RA_TRONG, 'utf8')) : null;
const ketQua = {
  batDau: new Date(t0).toISOString(),
  msTong: Date.now() - t0,
  vscodeExe: exe,
  maThoat,
  loiChay,
  cong: C,
  coGl: process.env.E2E_VSC_GL ?? null,
  moPhongSuaBoLoc: !!process.env.E2E_VSC_GIA_SUA,
  suite,
  soiWebviewQuaCdp: process.env.E2E_VSC_CDP ? { frames: soi.frames, vo: soi.vo, daBamTaiLaiMs: soi.daBamTaiLai, moPhongSuaBoLocMs: soi.giaSua ?? null, loiBam: soi.loiBam, danhGia: soi.danhGia, console: soi.console.slice(0, 60), loi: soi.loi } : '(tắt — đặt E2E_VSC_CDP=1)',
  logExthost: { soFile: logs.filter((p) => /exthost\.log$/.test(p)).length, dongLoiCanhBao: dongLoiExthost, dongGenStage: exthost.split('\n').filter((d) => /gen-stage|genStage|gen-labs/i.test(d)).slice(0, 30) },
  logKenhGenStage: genStageLog.split('\n').filter(Boolean).slice(0, 60),
};
fs.mkdirSync(path.join(GOC, 'docs/e2e'), { recursive: true });
fs.writeFileSync(path.join(GOC, 'docs/e2e/vscode-that.json'), JSON.stringify(ketQua, null, 2));
const buoc = suite?.buoc ?? [];
for (const b of buoc) console.log(`${b.ok ? 'OK  ' : 'FAIL'} ${b.ten}`);
console.log('VS Code', suite?.vscodeVersion, '· ext host node', suite?.extHost?.node, '· lỗi suite:', suite?.loi?.length ?? 'không có kết quả', '· loiChay:', loiChay);
process.exit(suite && !suite.loi.length && buoc.every((b) => b.ok) ? 0 : 1);
