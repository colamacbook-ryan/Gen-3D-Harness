/**
 * kiem-e2e-nao-local-that.mjs — E2E V1 với OLLAMA THẬT + MODEL THẬT + SÂN KHẤU THẬT.
 *
 * Khác `kiem-nao-local.mjs` (Ollama GIẢ, sân khấu giả): ở đây KHÔNG giả gì cả.
 *   Ollama thật (Sếp/tester tự bật trước, mặc định http://127.0.0.1:9010)
 *     ← máy ghi trong suốt 127.0.0.1:9011 (chỉ chuyển tiếp + ghi request/response, không sửa gì)
 *   bridge thật `bridge/server.ts` 9000 (ws) · 9001 TTS · 9002 MCP · 9003 STT
 *   vite thật 127.0.0.1:9004 --strictPort + Playwright Chromium (swiftshader) = sân khấu THẬT
 *   driver thật `tsx scripts/nao-local.mjs`
 * Sếp nói 3 câu bằng `actor.say` lên `owner` qua ws (đúng đường ô chat).
 *
 * Chạy:  E2E_OLLAMA=http://127.0.0.1:9010 E2E_MODEL=qwen2.5:1.5b node scripts/kiem-e2e-nao-local-that.mjs
 * Ra:    docs/e2e/nao-local-<model>.json
 * Mọi tiến trình con spawn detached, giết bằng PGID (tsx sinh node con — bài học #37).
 */
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium } from 'playwright';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OLLAMA = new URL(process.env.E2E_OLLAMA ?? 'http://127.0.0.1:9010');
const MODEL = process.env.E2E_MODEL ?? '';
const GIA = process.env.E2E_SAN_KHAU === 'gia';
const C = { ws: 9000, tts: 9001, mcp: 9002, stt: 9003, vite: 9004, ghiOllama: 9011 };
const KHOA = resolve(GOC, '.cache/nao-driver-e2e-9000.lock');
const RA = resolve(GOC, `docs/e2e/nao-local-${(MODEL || 'tu-chon').replace(/[^a-z0-9.]+/gi, '_')}${process.env.E2E_SAN_KHAU === 'gia' ? '-san-khau-gia' : ''}.json`);
// 3 câu đề bài + 1 câu tự do (không khớp lớp hiểu lệnh C2) để chắc chắn đi vào model
const CAU = (process.env.E2E_CAU ? JSON.parse(process.env.E2E_CAU) : ['Gen ơi, chào em', 'Gen ơi, ra cửa sổ đi', 'Gen ơi, mở màn hình cho anh', 'Gen ơi, hôm nay mình nên làm gì trước?']);
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const nhom = [];

function bat(ten, lenh, args, env = {}) {
  const p = spawn(lenh, args, { cwd: GOC, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  nhom.push({ ten, pgid: p.pid });
  p.dong = [];
  for (const s of [p.stdout, p.stderr]) {
    s.on('data', (d) => {
      for (const dong of String(d).split('\n').filter(Boolean)) {
        p.dong.push({ t: Date.now(), dong });
        if (process.env.E2E_VERBOSE) console.log(`  [${ten}] ${dong}`);
      }
    });
  }
  return p;
}

/* ---- máy ghi trong suốt trước Ollama thật: chỉ để thấy tool_calls model THẬT trả về ---- */
const ollamaLog = [];
const svGhi = createServer((req, res) => {
  const t0 = Date.now();
  const chunks = [];
  req.on('data', (d) => chunks.push(d));
  req.on('end', () => {
    const than = Buffer.concat(chunks);
    const up = request(
      { host: OLLAMA.hostname, port: OLLAMA.port, path: req.url, method: req.method, headers: { ...req.headers, host: OLLAMA.host } },
      (r) => {
        const ra = [];
        r.on('data', (d) => ra.push(d));
        r.on('end', () => {
          const body = Buffer.concat(ra);
          res.writeHead(r.statusCode ?? 502, r.headers);
          res.end(body);
          if (req.url.startsWith('/v1/chat/completions')) {
            let yc = {};
            let tl = {};
            try {
              yc = JSON.parse(String(than));
              tl = JSON.parse(String(body));
            } catch {
              /* ghi thô */
            }
            const msg = tl.choices?.[0]?.message ?? {};
            ollamaLog.push({
              t0,
              ms: Date.now() - t0,
              model: yc.model,
              soTool: yc.tools?.length,
              soMsg: yc.messages?.length,
              cuoi: yc.messages?.at(-1),
              content: msg.content,
              tool_calls: (msg.tool_calls ?? []).map((x) => ({ name: x.function?.name, arguments: x.function?.arguments })),
              usage: tl.usage,
            });
          }
        });
      },
    );
    // driver huỷ lượt (AbortController) → huỷ luôn yêu cầu lên Ollama, không để model chạy mồ côi
    res.on('close', () => !res.writableFinished && up.destroy());
    up.on('error', (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    up.end(than);
  });
});

/* ------------------------------------------------------------------ chạy */
const nhatKy = { batDau: new Date().toISOString(), ollama: OLLAMA.href, modelMuon: MODEL || '(tự chọn)', cong: C, cau: [], loi: [] };
let browser;
let bridge;
let driver;
let vite;
try {
  const ver = await fetch(new URL('/api/version', OLLAMA)).then((r) => r.json());
  nhatKy.ollamaVersion = ver.version;
  await new Promise((r) => svGhi.listen(C.ghiOllama, '127.0.0.1', r));

  bridge = bat('bridge', 'node_modules/.bin/tsx', ['bridge/server.ts'], {
    GEN_STAGE_PORT: String(C.ws),
    GEN_STAGE_TTS_PORT: String(C.tts),
    GEN_STAGE_MCP_PORT: String(C.mcp),
    GEN_STAGE_STT_PORT: String(C.stt),
  });
  if (!GIA) vite = bat('vite', 'node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(C.vite), '--strictPort']);

  // người quan sát (vai client): nghe mọi sự kiện, gửi câu của Sếp
  let obs;
  for (let i = 0; i < 80 && !obs; i++) {
    try {
      obs = await new Promise((res, rej) => {
        const w = new WebSocket(`ws://127.0.0.1:${C.ws}/`);
        w.on('open', () => res(w));
        w.on('error', rej);
      });
    } catch {
      await ngu(300);
    }
  }
  if (!obs) throw new Error('không nối được bridge 9000');
  const suKien = [];
  const choTraLoi = new Map();
  obs.on('message', (tho) => {
    const g = JSON.parse(String(tho));
    if (g.event) suKien.push({ t: Date.now(), event: g.event, data: g.data });
    else if (g.id && choTraLoi.has(g.id)) {
      choTraLoi.get(g.id)(g);
      choTraLoi.delete(g.id);
    }
  });
  let dem = 0;
  const goi = (cmd, args) =>
    new Promise((res) => {
      const id = `e2e-${++dem}`;
      choTraLoi.set(id, res);
      obs.send(JSON.stringify({ id, cmd, args }));
      setTimeout(() => choTraLoi.has(id) && (choTraLoi.delete(id), res({ ok: false, error: 'hết hạn e2e' })), 60000);
    });

  // sân khấu THẬT
  for (let i = 0; i < 80 && vite && !vite.dong.some((d) => /ready|Local:/i.test(d.dong)); i++) await ngu(250);
  let page;
  const loiConsole = [];
  if (GIA) {
    // SÂN KHẤU GIẢ (ws ?role=stage): chỉ dùng khi WebGL phần mềm ăn hết CPU của LLM. Không có lớp hiểu
    // lệnh C2 → mọi câu đều tới model (đo được chất lượng tool-calling); lệnh nào cũng trả ok (không validate).
    const ACT = [
      { id: 'owner', name: 'Javis', controlledBy: 'owner', state: 'idle', at: 'buc-trung-tam', pos: [-4.5, 0, 2.6] },
      { id: 'gen', name: 'Gen', controlledBy: 'agent', state: 'idle', at: 'ban-dieu-khien', pos: [4, 0, -3] },
    ];
    const st = new WebSocket(`ws://127.0.0.1:${C.ws}/?role=stage`);
    await new Promise((r, j) => (st.on('open', r), st.on('error', j)));
    const ev = (event, data) => st.send(JSON.stringify({ event, data, t: Date.now() }));
    st.on('message', (tho) => {
      const g = JSON.parse(String(tho));
      if (!g.cmd) return;
      const a = g.args ?? {};
      const result = g.cmd === 'stage.describe'
        ? { actors: ACT, screens: [{ id: 'may-tinh', showing: null }, { id: 'tivi', showing: null }], modules: [], brainConnected: true, renderMode: 'full' }
        : { durationMs: 1200 };
      st.send(JSON.stringify({ id: g.id, ok: true, result }));
      if (g.cmd === 'actor.say') {
        ev('actor.sayStart', { actor: a.actor, text: a.text });
        if (a.actor === 'owner') ev('user.text', { actor: 'owner', text: a.text, to: 'gen' });
        setTimeout(() => ev('actor.sayDone', { actor: a.actor, text: a.text }), 1200);
      }
    });
    nhatKy.sanKhau = 'GIẢ (ws ?role=stage) — không WebGL, không lớp hiểu lệnh C2, không validate';
  } else {
  browser = await chromium.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
    });
    page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('console', (m) => m.type() === 'error' && loiConsole.push(m.text().slice(0, 300)));
    page.on('pageerror', (e) => loiConsole.push('pageerror: ' + String(e).slice(0, 300)));
    const tMo = Date.now();
    await page.goto(`http://127.0.0.1:${C.vite}/?bridgePort=${C.ws}&ttsPort=${C.tts}&sttPort=${C.stt}`);
    let dsc;
    for (let i = 0; i < 240; i++) {
      const r = await goi('stage.describe', {});
      if (r.ok && r.result?.actors?.some((a) => a.id === 'gen') && r.result.actors.some((a) => a.id === 'owner')) {
        dsc = r.result;
        break;
      }
      await ngu(500);
    }
    if (!dsc) throw new Error('sân khấu thật không lên (không có gen + owner trong stage.describe)');
    nhatKy.sanKhau = { msLen: Date.now() - tMo, actors: dsc.actors.map((a) => ({ id: a.id, controlledBy: a.controlledBy, at: a.at })) };
    await page.screenshot({ path: resolve(GOC, 'docs/e2e/nao-local-truoc.png') });
  }

  driver = bat('driver', 'node_modules/.bin/tsx', ['scripts/nao-local.mjs'], {
    GEN_STAGE_PORT: String(C.ws),
    GEN_STAGE_OLLAMA_URL: `http://127.0.0.1:${C.ghiOllama}`,
    GEN_STAGE_OLLAMA_MODEL: MODEL,
    GEN_STAGE_NAO_KHOA: KHOA,
    // hạn lượt: mặc định của driver là 60 s; E2E_HAN cho phép nới để ĐO model trên CPU chậm
    ...(process.env.E2E_HAN ? { GEN_STAGE_NAO_LOCAL_HAN: process.env.E2E_HAN } : {}),
  });
  nhatKy.hanLuotMs = Number(process.env.E2E_HAN ?? 60000);
  for (let i = 0; i < 200 && !driver.dong.some((d) => /đang nghe user\.text/.test(d.dong)); i++) await ngu(250);
  nhatKy.driverKhoiDong = driver.dong.map((d) => d.dong).slice(0, 10);
  await ngu(1500);

  for (const text of CAU) {
    const t0 = Date.now();
    const nBridge = bridge.dong.length;
    const nDriver = driver.dong.length;
    const nOl = ollamaLog.length;
    const nSk = suKien.length;
    const kq = await goi('actor.say', { actor: 'owner', text, interrupt: true });
    // chờ: tới khi gen nói câu THẬT (không phải câu xin chờ) xong, hoặc 120 s; rồi yên 5 s
    const het = Date.now() + Math.max(120000, Number(process.env.E2E_HAN ?? 0) + 30000);
    let mocYen = Date.now();
    let demCu = -1;
    while (Date.now() < het) {
      const n = bridge.dong.length + driver.dong.length + suKien.length + ollamaLog.length;
      if (n !== demCu) {
        demCu = n;
        mocYen = Date.now();
      }
      const xongLuot = driver.dong.slice(nDriver).some((d) => /xong lượt|kết thúc lượt|hết lượt|lượt xong/i.test(d.dong));
      const genNoiXong = suKien.slice(nSk).some((s) => s.event === 'actor.sayDone' && s.data?.actor === 'gen');
      // driver nhận lượt ("SẾP →") thì phải chờ "xong lượt"; không nhận (C2 lo) thì chờ gen nói xong
      const driverNhan = driver.dong.slice(nDriver).some((d) => /SẾP →/.test(d.dong));
      const xong = driverNhan ? xongLuot : genNoiXong;
      if (xong && Date.now() - mocYen > 5000) break;
      await ngu(500);
    }
    const lenhToiSanKhau = bridge.dong
      .slice(nBridge)
      .filter((d) => d.dong.includes(' → '))
      .map((d) => ({ ms: d.t - t0, lenh: d.dong.replace(/^\[bridge [^\]]*\]\s*→\s*/, '').slice(0, 300) }))
      .filter((l) => !/^stage\.describe/.test(l.lenh) || true);
    const sk = suKien.slice(nSk);
    const userText = sk.find((s) => s.event === 'user.text');
    const sayStartGen = sk.filter((s) => s.event === 'actor.sayStart' && s.data?.actor === 'gen');
    const phanXa = lenhToiSanKhau.find((l) => /^actor\.(turnTo|emote|faceTo)/.test(l.lenh) && /"gen"/.test(l.lenh));
    const ol = ollamaLog.slice(nOl);
    nhatKy.cau.push({
      text,
      ketQuaSay: kq.ok,
      msUserText: userText && userText.t - t0,
      msPhanXa: phanXa?.ms,
      msGenBatDauNoi: sayStartGen.map((s) => ({ ms: s.t - t0, text: s.data?.text })),
      ollama: ol.map((o) => ({ ms: o.ms, model: o.model, soTool: o.soTool, content: o.content, tool_calls: o.tool_calls, usage: o.usage })),
      lenhToiSanKhau,
      suKien: sk.filter((s) => !/^bridge\./.test(s.event)).map((s) => ({ ms: s.t - t0, event: s.event, actor: s.data?.actor, text: s.data?.text, place: s.data?.place, screen: s.data?.id })),
      driverLog: driver.dong.slice(nDriver).map((d) => ({ ms: d.t - t0, dong: d.dong.slice(0, 300) })),
    });
    console.log(`[e2e] "${text}" → ${ol.length} lượt model, ${lenhToiSanKhau.length} lệnh tới sân khấu, gen nói: ${sayStartGen.map((s) => s.data?.text).join(' | ')}`);
    await ngu(1500);
  }
  const cuoi = await goi('stage.describe', {});
  const gen = cuoi.result?.actors?.find((a) => a.id === 'gen');
  nhatKy.cuoi = { gen: gen && { at: gen.at, state: gen.state, nearest: gen.nearest }, screens: cuoi.result?.screens, brainConnected: cuoi.result?.brainConnected };
  if (!GIA) {
    await page.screenshot({ path: resolve(GOC, 'docs/e2e/nao-local-sau.png') });
    nhatKy.loiConsole = loiConsole.slice(0, 20);
  }
  nhatKy.bridgeLogLoi = bridge.dong.filter((d) => /lỗi|error|502/i.test(d.dong)).map((d) => d.dong.slice(0, 200)).slice(0, 10);
} catch (e) {
  nhatKy.loi.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  nhatKy.driverLogDayDu = driver?.dong.map((d) => d.dong.slice(0, 300)).slice(0, 200);
  try {
    await browser?.close();
  } catch {
    /* */
  }
  for (const { pgid } of nhom) {
    try {
      process.kill(-pgid, 'SIGTERM');
    } catch {
      /* đã chết */
    }
  }
  svGhi.close();
  nhatKy.pgid = nhom;
  nhatKy.ketThuc = new Date().toISOString();
  mkdirSync(dirname(RA), { recursive: true });
  writeFileSync(RA, JSON.stringify(nhatKy, null, 2));
  console.log('[e2e] ghi', RA, '· PGID đã giết:', nhom.map((x) => `${x.ten}=${x.pgid}`).join(' '));
  await ngu(500);
  process.exit(nhatKy.loi.length ? 1 : 0);
}
