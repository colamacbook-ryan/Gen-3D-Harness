/**
 * kiem-bridge-thay-san-khau.mjs — CNS-002 (bridge): thay/ngắt sân khấu.
 *   1. Lệnh đang chờ của sân khấu cũ trả lỗi NGAY khi tab mới thay (không treo 30 s).
 *   2. Thay bằng tab mới KHÔNG phát `bridge.stageOffline`; tab cũ nhận mã 4001.
 *   3. Ngắt tab cuối cùng → phát `bridge.stageOffline` đúng một lần.
 * Cổng 8797–8800 (không đụng 8787–8790). Chạy: node scripts/kiem-bridge-thay-san-khau.mjs
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CONG = 8797;
const bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
  stdio: 'ignore',
  env: {
    ...process.env,
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_TTS_PORT: '8798',
    GEN_STAGE_MCP_PORT: '8799',
    GEN_STAGE_STT_PORT: '8800',
  },
});
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const loi = [];
const kiem = (ten, dk) => {
  console.log(`${dk ? 'OK  ' : 'FAIL'} ${ten}`);
  if (!dk) loi.push(ten);
};
const noi = (q) =>
  new Promise((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:${CONG}/${q}`);
    w.msgs = [];
    w.on('message', (t) => w.msgs.push(JSON.parse(String(t))));
    w.on('open', () => res(w));
    w.on('error', rej);
  });

try {
  for (let i = 0; i < 30; i++) {
    try { (await noi('')).close(); break; } catch { await ngu(300); }
  }
  const client = await noi('');
  const tabCu = await noi('?role=stage');
  const maCu = new Promise((r) => tabCu.on('close', (ma) => r(ma)));
  await ngu(200);

  // tab cũ nhận lệnh nhưng không trả lời
  client.send(JSON.stringify({ id: 'x1', cmd: 'stage.describe' }));
  await ngu(200);
  const t0 = Date.now();
  client.msgs.length = 0;
  const tabMoi = await noi('?role=stage');
  await ngu(500);
  const traLoi = client.msgs.find((m) => m.id === 'x1');
  kiem('lệnh chờ của tab cũ trả lỗi ngay khi bị thay', traLoi?.ok === false && Date.now() - t0 < 3000);
  kiem('tab cũ nhận mã 4001', (await maCu) === 4001);
  kiem('thay tab mới KHÔNG phát bridge.stageOffline', !client.msgs.some((m) => m.event === 'bridge.stageOffline'));
  kiem('thay tab mới phát bridge.stageOnline', client.msgs.some((m) => m.event === 'bridge.stageOnline'));

  // lệnh mới đi tới tab mới
  tabMoi.on('message', (t) => {
    const g = JSON.parse(String(t));
    if (g.cmd) tabMoi.send(JSON.stringify({ id: g.id, ok: true, result: {} }));
  });
  client.send(JSON.stringify({ id: 'x2', cmd: 'stage.describe' }));
  await ngu(300);
  kiem('lệnh mới chạy được trên tab mới', client.msgs.find((m) => m.id === 'x2')?.ok === true);

  // ngắt tab cuối khi có lệnh chờ
  tabMoi.removeAllListeners('message');
  client.send(JSON.stringify({ id: 'x3', cmd: 'stage.describe' }));
  await ngu(200);
  client.msgs.length = 0;
  tabMoi.close();
  await ngu(500);
  kiem('ngắt tab cuối: lệnh chờ trả lỗi ngay', client.msgs.find((m) => m.id === 'x3')?.ok === false);
  kiem('ngắt tab cuối: phát stageOffline đúng 1 lần', client.msgs.filter((m) => m.event === 'bridge.stageOffline').length === 1);
  client.close();
} finally {
  bridge.kill('SIGTERM');
}
console.log(loi.length ? `\nFAIL ${loi.length}` : '\nTẤT CẢ OK');
process.exit(loi.length ? 1 : 0);
