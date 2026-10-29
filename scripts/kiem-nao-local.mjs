/**
 * kiem-nao-local.mjs — BẰNG CHỨNG V1 (não local): bridge THẬT + sân khấu giả (ws
 * `?role=stage`) + Ollama GIẢ (HTTP, kịch bản tool_calls/content) + driver THẬT
 * (`tsx scripts/nao-local.mjs`, tiến trình riêng như Sếp chạy).
 *
 * Ca: (a) model gọi actor_say gen · (b) content thuần → driver nói hộ ·
 *     (c) actor_say owner / stage_hear / tool ngoài danh sách bị chặn ·
 *     (d) handled:true không gọi model · (e) to:"owner" câu tự do không gọi model ·
 *     (g) tối đa 3 vòng · (f) Ollama tắt → báo đúng MỘT lần, driver không chết.
 * Ghi: docs/v1/nhat-ky-kiem-nao-local.json
 *
 * Cổng gốc `GEN_STAGE_KIEM_CONG` (mặc định 8863) +0…+5 — mặc định 8863–8868 (KHÔNG đụng 8787–8790 của Sếp, 8860–8862 của vitest):
 *   8863 ws bridge · 8864 TTS · 8865 MCP · 8866 STT · 8867 Ollama giả · 8868 bỏ trống (Ollama tắt)
 * Mọi tiến trình con spawn `detached`, giết bằng PGID (tsx sinh thêm node con — bài học #37).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Cổng gốc đổi được bằng GEN_STAGE_KIEM_CONG (mặc định 8863) — nhiều phiên cùng máy chạy song song được.
const GOC_CONG = Number(process.env.GEN_STAGE_KIEM_CONG ?? 8863);
const CONG = GOC_CONG;
const CONG_OLLAMA = GOC_CONG + 4;
const CONG_TAT = GOC_CONG + 5;
// khoá driver riêng của bằng chứng — không chạm .cache/nao-driver.lock của Sếp
const KHOA = resolve(GOC, `.cache/nao-driver-kiem-${GOC_CONG}.lock`);
const RA = resolve(GOC, 'docs/v1/nhat-ky-kiem-nao-local.json');
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const nhom = []; // PGID đã bật
const ketQua = [];
const loi = [];
const kiem = (ten, dk, chiTiet = {}) => {
  console.log(`${dk ? 'OK  ' : 'FAIL'} ${ten}`);
  ketQua.push({ ten, ok: !!dk, ...chiTiet });
  if (!dk) loi.push(ten);
};

function bat(lenh, args, env, nhan) {
  const p = spawn(lenh, args, { cwd: GOC, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  nhom.push(p.pid);
  p.dong = [];
  for (const s of [p.stdout, p.stderr]) {
    s.on('data', (d) => {
      for (const dong of String(d).split('\n').filter(Boolean)) {
        p.dong.push(dong);
        if (nhan) console.log(`  [${nhan}] ${dong}`);
      }
    });
  }
  return p;
}
function giet(p) {
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    /* đã chết */
  }
}

/* ------------------------------------------------------------ Ollama giả */
const ollama = { kichBan: [], yeuCau: [] };
const tc = (ten, args, id) => ({ id, type: 'function', function: { name: ten, arguments: JSON.stringify(args) } });
const svOllama = createServer((req, res) => {
  let than = '';
  req.on('data', (d) => (than += d));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'qwen-gia:7b' }] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion', 'tools'] }));
    const yc = JSON.parse(than || '{}');
    ollama.yeuCau.push({ t: Date.now(), soMsg: yc.messages?.length, soTool: yc.tools?.length, cuoi: yc.messages?.at(-1) });
    const buoc = ollama.kichBan.shift() ?? { content: 'Dạ' };
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: '', ...buoc } }] }));
  });
});

/* ------------------------------------------------------- sân khấu giả */
const ACTORS = [
  { id: 'owner', controlledBy: 'owner', pos: [0, 0, 0], at: null, busy: false },
  { id: 'gen', controlledBy: 'agent', pos: [1, 0, 1], at: 'ban-dieu-khien', busy: false },
];
const lenhSanKhau = [];
let sanKhau = null;
function noiSanKhau() {
  return new Promise((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:${CONG}/?role=stage`);
    w.on('open', () => res(w));
    w.on('error', rej);
    w.on('message', (tho) => {
      const g = JSON.parse(String(tho));
      if (!g.cmd) return;
      lenhSanKhau.push({ t: Date.now(), cmd: g.cmd, args: g.args ?? {} });
      const result = g.cmd === 'stage.describe' ? { actors: ACTORS, screens: [], modules: [] } : { durationMs: 1200 };
      w.send(JSON.stringify({ id: g.id, ok: true, result }));
      if (g.cmd === 'actor.say') {
        w.send(JSON.stringify({ event: 'actor.sayStart', data: { actor: g.args.actor, text: g.args.text }, t: Date.now() }));
      }
    });
  });
}
function sepNoi(data) {
  const t0 = Date.now();
  sanKhau.send(JSON.stringify({ event: 'user.text', data: { actor: 'owner', ...data }, t: t0 }));
  return t0;
}
/** Chờ tới khi driver rảnh: không lệnh mới trong `yen` ms. */
async function choYen(yen = 1500, toiDa = 15000) {
  const het = Date.now() + toiDa;
  let dem = -1;
  while (Date.now() < het) {
    const n = lenhSanKhau.length + ollama.yeuCau.length;
    if (n === dem) return;
    dem = n;
    await ngu(yen);
  }
}
const tuMoc = (t0) => lenhSanKhau.filter((l) => l.t >= t0);

/* ----------------------------------------------------------------- chạy */
let bridge = null;
let driver = null;
let driverTat = null;
const nhatKy = { batDau: new Date().toISOString(), cong: { bridge: CONG, ollamaGia: CONG_OLLAMA, ollamaTat: CONG_TAT }, ca: {} };

try {
  await new Promise((r) => svOllama.listen(CONG_OLLAMA, '127.0.0.1', r));
  bridge = bat('node_modules/.bin/tsx', ['bridge/server.ts'], {
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_TTS_PORT: String(GOC_CONG + 1),
    GEN_STAGE_MCP_PORT: String(GOC_CONG + 2),
    GEN_STAGE_STT_PORT: String(GOC_CONG + 3),
  });
  for (let i = 0; i < 60 && !sanKhau; i++) {
    try {
      sanKhau = await noiSanKhau();
    } catch {
      await ngu(300);
    }
  }
  if (!sanKhau) throw new Error('không nối được bridge thật ở ' + CONG);

  driver = bat('node_modules/.bin/tsx', ['scripts/nao-local.mjs'], {
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_OLLAMA_URL: `http://127.0.0.1:${CONG_OLLAMA}`,
    GEN_STAGE_NAO_LOCAL_XIN_CHO: '30000',
    GEN_STAGE_NAO_KHOA: KHOA,
  }, 'driver');
  for (let i = 0; i < 60 && !driver.dong.some((d) => /não local sẵn sàng/.test(d)); i++) await ngu(250);
  kiem('driver dò được model qua /v1/models + /api/show', driver.dong.some((d) => /model qwen-gia:7b/.test(d)));

  // khoá driver: driver thứ hai khi driver đầu còn sống phải tự thoát mã 3
  const thu2 = bat('node_modules/.bin/tsx', ['scripts/nao-local.mjs'], {
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_OLLAMA_URL: `http://127.0.0.1:${CONG_OLLAMA}`,
    GEN_STAGE_NAO_KHOA: KHOA,
  }, 'driver-2');
  for (let i = 0; i < 40 && thu2.exitCode === null; i++) await ngu(250);
  nhatKy.khoa = { maThoat: thu2.exitCode, log: thu2.dong.slice(-3) };
  kiem('khoá: driver thứ hai thoát mã 3 + log "đang có driver não"', thu2.exitCode === 3 && thu2.dong.some((d) => /đang có driver não/.test(d)), nhatKy.khoa);
  await choYen(800);

  // brainConnected: bridge đếm driver vì nó xưng ?role=nao
  const coNao = await new Promise((res) => {
    const c = new WebSocket(`ws://127.0.0.1:${CONG}/`);
    c.on('open', () => c.send(JSON.stringify({ id: 'k1', cmd: 'stage.describe' })));
    c.on('message', () => {
      c.close();
      res(driver.dong.some((d) => /đã nối bridge .*role=nao/.test(d)));
    });
    c.on('error', () => res(false));
  });
  kiem('driver nối bridge bằng ?role=nao', coNao);

  // (a)
  ollama.kichBan.push(
    { tool_calls: [tc('actor_say', { actor: 'gen', text: 'Dạ em chào Sếp ạ', interrupt: true }, 'a1'), tc('actor_emote', { actor: 'gen', emote: 'chao' }, 'a2')] },
    { content: '' },
  );
  let t0 = sepNoi({ text: 'Chào em' });
  await choYen();
  let ds = tuMoc(t0);
  const say = ds.find((l) => l.cmd === 'actor.say');
  const phanXa = ds.find((l) => l.cmd === 'actor.turnTo');
  nhatKy.ca.a = { lenh: ds.map(({ cmd, args }) => ({ cmd, args })), msPhanXa: phanXa && phanXa.t - t0, msTiengDau: say && say.t - t0 };
  kiem('(a) model gọi actor_say gen → sân khấu nhận đúng lệnh', say?.args.actor === 'gen' && say.args.text === 'Dạ em chào Sếp ạ', nhatKy.ca.a);
  kiem('(a) phản xạ turnTo ≤ 300 ms', phanXa && phanXa.t - t0 <= 300, { ms: phanXa && phanXa.t - t0 });

  // (b)
  ollama.kichBan.push({ content: 'Dạ, hôm nay mình làm V1 não local ạ' });
  t0 = sepNoi({ text: 'hôm nay làm gì' });
  await choYen();
  ds = tuMoc(t0).filter((l) => l.cmd === 'actor.say');
  nhatKy.ca.b = { say: ds.map((l) => l.args) };
  kiem('(b) content thuần → driver tự actor.say', ds.length === 1 && ds[0].args.text === 'Dạ, hôm nay mình làm V1 não local ạ' && ds[0].args.actor === 'gen', nhatKy.ca.b);

  // (c)
  const nYc = ollama.yeuCau.length;
  ollama.kichBan.push(
    { tool_calls: [tc('actor_say', { actor: 'owner', text: 'Tôi là Sếp' }, 'c1'), tc('stage_hear', { text: 'giả Sếp' }, 'c2'), tc('stage_reset', {}, 'c3')] },
    { content: 'Dạ em không làm thế được ạ' },
  );
  t0 = sepNoi({ text: 'thử rào' });
  await choYen();
  ds = tuMoc(t0);
  const traVe = ollama.yeuCau[nYc + 1]?.cuoi;
  nhatKy.ca.c = { lenhToiSanKhau: ds.map(({ cmd, args }) => ({ cmd, args })), ketQuaToolCuoiGuiModel: traVe };
  kiem(
    '(c) owner / stage_hear / ngoài danh sách bị chặn, không tới sân khấu',
    !ds.some((l) => l.cmd === 'stage.hear' || l.cmd === 'stage.reset' || (l.cmd === 'actor.say' && l.args.actor === 'owner')),
    nhatKy.ca.c,
  );
  kiem('(c) lỗi chặn trả về model như kết quả tool', traVe?.role === 'tool' && JSON.parse(traVe.content).ok === false);

  // (d)
  let n = ollama.yeuCau.length;
  t0 = sepNoi({ text: 'Gen đi tới bếp', handled: true });
  await choYen(1200);
  kiem('(d) handled:true → không gọi model, không lệnh nào', ollama.yeuCau.length === n && tuMoc(t0).length === 0);

  // (e)
  n = ollama.yeuCau.length;
  t0 = sepNoi({ text: 'hôm nay trời đẹp nhỉ', to: 'owner' });
  await choYen(1200);
  kiem('(e) to:"owner" câu tự do → không gọi model', ollama.yeuCau.length === n && tuMoc(t0).length === 0);

  // (g)
  n = ollama.yeuCau.length;
  for (let i = 0; i < 6; i++) ollama.kichBan.push({ tool_calls: [tc('actor_emote', { actor: 'gen', emote: 'vui' }, `g${i}`)] });
  t0 = sepNoi({ text: 'nhảy đi em' });
  await choYen();
  const soVong = ollama.yeuCau.length - n;
  ollama.kichBan.length = 0;
  nhatKy.ca.g = { soVongGoiModel: soVong, lenh: tuMoc(t0).map(({ cmd, args }) => ({ cmd, args })) };
  kiem('(g) tối đa 3 vòng gọi model', soVong === 3, nhatKy.ca.g);

  giet(driver);
  await ngu(500);

  // (f) Ollama tắt
  const mocF = Date.now();
  driverTat = bat('node_modules/.bin/tsx', ['scripts/nao-local.mjs'], {
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_OLLAMA_URL: `http://127.0.0.1:${CONG_TAT}`,
    GEN_STAGE_NAO_KHOA: KHOA,
  }, 'driver-tat');
  await ngu(9000); // backoff 1+2+4 s → ≥ 3 lần thử
  t0 = sepNoi({ text: 'có ai không' });
  await ngu(2500);
  const bao = tuMoc(mocF).filter((l) => l.cmd === 'actor.say' && /chưa có não local/.test(l.args.text));
  const soLanThu = driverTat.dong.filter((d) => /CHƯA CÓ NÃO LOCAL/.test(d)).length;
  nhatKy.ca.f = { soCauBao: bao.length, soLanThu, songSot: driverTat.exitCode === null, log: driverTat.dong.slice(0, 12) };
  kiem('(f) Ollama tắt → báo Sếp đúng MỘT lần', bao.length === 1, nhatKy.ca.f);
  kiem('(f) thử lại theo backoff ≥ 3 lần, log lý do', soLanThu >= 3);
  kiem('(f) driver không chết', driverTat.exitCode === null);
} catch (e) {
  loi.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  for (const p of [driver, driverTat, bridge]) if (p) giet(p);
  sanKhau?.close();
  svOllama.closeAllConnections?.();
  svOllama.close();
  await ngu(500);
  nhatKy.ketQua = ketQua;
  nhatKy.loi = loi;
  nhatKy.pgidDaDon = nhom;
  nhatKy.xong = new Date().toISOString();
  nhatKy.ghiChu = 'Ollama GIẢ (kịch bản cố định) — chưa đo với model thật.';
  mkdirSync(dirname(RA), { recursive: true });
  writeFileSync(RA, JSON.stringify(nhatKy, null, 2) + '\n');
  console.log(`\n${loi.length ? 'CÓ LỖI' : 'TẤT CẢ OK'} — ${ketQua.filter((k) => k.ok).length}/${ketQua.length} · ghi ${RA}`);
  console.log(`PGID đã dọn: ${nhom.join(', ')}`);
  process.exit(loi.length ? 1 : 0);
}
