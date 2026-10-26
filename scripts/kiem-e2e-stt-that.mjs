/**
 * kiem-e2e-stt-that.mjs — E2E C1/V2 với STT THẬT (PhoWhisper-small ct2, `bash scripts/fetch-stt.sh`)
 * + bridge THẬT + sân khấu THẬT (vite + Playwright Chromium swiftshader) + tai-nghe THẬT.
 *
 * Nguồn giọng: các wav tiếng Việt sinh sẵn ở E2E_WAV_DIR (cau1.wav… + cau.txt mỗi dòng một câu gốc).
 * Trên cloud: TTS Edge của bridge trả lỗi qua proxy → wav sinh bằng Piper (giọng vi_VN-vais1000-medium,
 * CC BY 4.0) ở thư mục ngoài repo. KHÔNG commit wav/model.
 *
 * Pha A (không trình duyệt, để số đo STT ít bị tranh CPU): POST /stt thẳng từng wav —
 *   lần đầu = bật thợ python + nạp model + hâm máy; các lần sau = máy đã ấm.
 * Pha B: sân khấu thật lên, chạy `node scripts/tai-nghe.mjs --nguon <wav>` (đường extension dùng):
 *   VAD → /stt → stage.hear → user.text/user.speech → phản ứng trên sân khấu.
 *
 * Cổng: 9000 ws · 9001 TTS · 9002 MCP · 9003 STT · 9004 vite. Ra: docs/e2e/stt-that.json
 * Chạy: E2E_WAV_DIR=/đường/wav node scripts/kiem-e2e-stt-that.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from 'playwright';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAV = process.env.E2E_WAV_DIR;
if (!WAV) {
  console.error('Thiếu E2E_WAV_DIR');
  process.exit(64);
}
const CAU = readFileSync(join(WAV, 'cau.txt'), 'utf8').split('\n').filter(Boolean);
const C = { ws: 9000, tts: 9001, mcp: 9002, stt: 9003, vite: 9004 };
const RA = resolve(GOC, 'docs/e2e/stt-that.json');
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const nhom = [];
function bat(ten, lenh, args, env = {}) {
  const p = spawn(lenh, args, { cwd: GOC, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  nhom.push({ ten, pgid: p.pid });
  p.dong = [];
  p.loi = [];
  p.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((x) => p.dong.push({ t: Date.now(), x })));
  p.stderr.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((x) => p.loi.push({ t: Date.now(), x })));
  return p;
}
const nhatKy = { batDau: new Date().toISOString(), cong: C, cau: CAU, phaA: [], phaB: [], loi: [] };
let browser;
let bridge;
try {
  bridge = bat('bridge', 'node_modules/.bin/tsx', ['bridge/server.ts'], {
    GEN_STAGE_PORT: String(C.ws),
    GEN_STAGE_TTS_PORT: String(C.tts),
    GEN_STAGE_MCP_PORT: String(C.mcp),
    GEN_STAGE_STT_PORT: String(C.stt),
  });
  for (let i = 0; i < 80; i++) {
    const r = await fetch(`http://127.0.0.1:${C.stt}/stt/khoe`).then((x) => x.json()).catch(() => null);
    if (r) {
      nhatKy.khoe = r;
      break;
    }
    await ngu(250);
  }

  /* ---------------- Pha A: POST /stt thẳng ---------------- */
  for (let i = 0; i < CAU.length; i++) {
    const am = readFileSync(join(WAV, `cau${i + 1}.wav`));
    const t0 = Date.now();
    const r = await fetch(`http://127.0.0.1:${C.stt}/stt`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: am, signal: AbortSignal.timeout(300000) });
    const k = await r.json();
    nhatKy.phaA.push({ goc: CAU[i], http: r.status, msTuongDoi: Date.now() - t0, text: k.text, confidence: k.confidence, durationMsServer: k.durationMs, audioMs: k.audioMs, goiGen: k.goiGen, error: k.error });
    console.log(`[A] ${Date.now() - t0} ms · "${CAU[i]}" → "${k.text}" (tin ${k.confidence})`);
  }
  // cùng file lần hai → cache sha1
  {
    const t0 = Date.now();
    const k = await fetch(`http://127.0.0.1:${C.stt}/stt`, { method: 'POST', body: readFileSync(join(WAV, 'cau1.wav')) }).then((x) => x.json());
    nhatKy.phaACache = { ms: Date.now() - t0, text: k.text };
  }

  /* ---------------- Pha B: sân khấu thật + tai-nghe thật ---------------- */
  const vite = bat('vite', 'node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(C.vite), '--strictPort']);
  for (let i = 0; i < 80 && !vite.dong.some((d) => /Local:/.test(d.x)); i++) await ngu(250);
  const obs = new WebSocket(`ws://127.0.0.1:${C.ws}/`);
  await new Promise((r, j) => (obs.on('open', r), obs.on('error', j)));
  const suKien = [];
  const cho = new Map();
  obs.on('message', (t) => {
    const g = JSON.parse(String(t));
    if (g.event) suKien.push({ t: Date.now(), event: g.event, data: g.data });
    else if (cho.has(g.id)) (cho.get(g.id)(g), cho.delete(g.id));
  });
  let dem = 0;
  const goi = (cmd, args = {}) => new Promise((res) => {
    const id = `stt-${++dem}`;
    cho.set(id, res);
    obs.send(JSON.stringify({ id, cmd, args }));
  });
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${C.vite}/?bridgePort=${C.ws}&ttsPort=${C.tts}&sttPort=${C.stt}`);
  let dsc;
  for (let i = 0; i < 240 && !dsc; i++) {
    const r = await goi('stage.describe');
    if (r.ok && r.result?.actors?.length >= 2) dsc = r.result;
    else await ngu(500);
  }
  if (!dsc) throw new Error('sân khấu thật không lên');

  // câu 3 (gọi Gen, mở màn hình) · câu 5 (gửi cho Javis — INT-02) · câu 6 (câu tự do cho Gen)
  const CHON = [
    { i: 3, to: 'gen' },
    { i: 5, to: 'owner' },
    { i: 6, to: 'gen' },
  ].filter((x) => x.i <= CAU.length);
  for (const { i, to } of CHON) {
    // đợi mọi actor agent im (bán song công: tai-nghe sẽ bỏ qua nếu Gen đang nói)
    for (let k = 0; k < 60; k++) {
      const d = await goi('stage.describe');
      if (!d.result?.actors?.some((a) => a.controlledBy === 'agent' && a.state === 'speaking')) break;
      await ngu(500);
    }
    const nSk = suKien.length;
    const t0 = Date.now();
    const tn = bat(`tai-nghe-${i}`, process.execPath, ['scripts/tai-nghe.mjs', '--port', String(C.ws), '--stt-port', String(C.stt), '--to', to, '--nguon', join(WAV, `cau${i}.wav`), '--im-lang-ms', '1200']);
    const ma = await new Promise((r) => tn.on('exit', (c) => r(c)));
    await ngu(6000);
    const json = tn.dong.map((d) => {
      try {
        return { ms: d.t - t0, ...JSON.parse(d.x) };
      } catch {
        return { ms: d.t - t0, tho: d.x };
      }
    });
    const ketQua = json.find((j) => j.su === 'ket-qua');
    nhatKy.phaB.push({
      goc: CAU[i - 1],
      to,
      maThoat: ma,
      msTong: Date.now() - t0,
      tomTat: ketQua && { text: ketQua.text, confidence: ketQua.confidence, daGui: ketQua.daGui, durationMs: ketQua.durationMs },
      suKienJson: json.filter((j) => j.su !== 'muc'),
      soVachMuc: json.filter((j) => j.su === 'muc').length,
      stderr: tn.loi.map((d) => d.x).slice(0, 12),
      suKienSanKhau: suKien
        .slice(nSk)
        .filter((s) => /^(user\.|actor\.(sayStart|moveTo|arrived|emote)|cmd\.|screen\.)/.test(s.event))
        .map((s) => ({ ms: s.t - t0, event: s.event, actor: s.data?.actor, to: s.data?.to, text: s.data?.text, handled: s.data?.handled })),
    });
    console.log(`[B] cau${i} → mã ${ma} · ${JSON.stringify(nhatKy.phaB.at(-1).tomTat)}`);
  }
  await page.screenshot({ path: resolve(GOC, 'docs/e2e/stt-that-san-khau.png') });
  nhatKy.bridgeSttLog = [...bridge.dong, ...bridge.loi].map((d) => d.x).filter((x) => /\[stt/.test(x)).slice(0, 30);
} catch (e) {
  nhatKy.loi.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser?.close().catch(() => {});
  for (const { pgid } of nhom) {
    try {
      process.kill(-pgid, 'SIGTERM');
    } catch {
      /* đã chết */
    }
  }
  nhatKy.pgid = nhom;
  mkdirSync(dirname(RA), { recursive: true });
  writeFileSync(RA, JSON.stringify(nhatKy, null, 2));
  console.log('[e2e-stt] ghi', RA, '· PGID:', nhom.map((x) => `${x.ten}=${x.pgid}`).join(' '));
  await ngu(300);
  process.exit(nhatKy.loi.length ? 1 : 0);
}
