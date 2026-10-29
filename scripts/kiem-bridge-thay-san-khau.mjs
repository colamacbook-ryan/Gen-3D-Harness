/**
 * kiem-bridge-thay-san-khau.mjs — CNS-002 (bridge): thay/ngắt sân khấu.
 *   1. Lệnh đang chờ của sân khấu cũ trả lỗi NGAY khi tab mới thay (không treo 30 s).
 *   2. Thay bằng tab mới KHÔNG phát `bridge.stageOffline`; tab cũ nhận mã 4001.
 *   3. Ngắt tab cuối cùng → phát `bridge.stageOffline` đúng một lần.
 *   4. Bridge bật token: kết nối stage KHÔNG token không đá được tab thật, không hứng lệnh.
 * Cổng GOC..GOC+7, GOC mặc định 8797 (env KIEM_CONG_GOC) (không đụng 8787–8790). Chạy: node scripts/kiem-bridge-thay-san-khau.mjs
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

/** Cổng gốc đổi được bằng KIEM_CONG_GOC (mặc định 8797) để builder chạy song song không giẫm nhau; dùng 8 cổng liên tiếp. */
const GOC = Number(process.env.KIEM_CONG_GOC ?? 8797);
const CONG = GOC;
const bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
  stdio: 'ignore',
  detached: true, // tsx sinh thêm tiến trình con: giết cả process group (kill(-pid)) kẻo mồ côi giữ cổng
  env: {
    ...process.env,
    GEN_STAGE_PORT: String(CONG),
    GEN_STAGE_TTS_PORT: String(GOC + 1),
    GEN_STAGE_MCP_PORT: String(GOC + 2),
    GEN_STAGE_STT_PORT: String(GOC + 3),
  },
});
const CONG_T = GOC + 4;
const TOKEN = 'mat-khau-thu';
let bridgeT = null;
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const loi = [];
const kiem = (ten, dk) => {
  console.log(`${dk ? 'OK  ' : 'FAIL'} ${ten}`);
  if (!dk) loi.push(ten);
};
const noi = (q, cong = CONG) =>
  new Promise((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:${cong}/${q}`);
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

  // ---- ca token: bridge bật GEN_STAGE_TOKEN (bật SAU các ca trên để khỏi tranh CPU lúc khởi động) ----
  bridgeT = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
    stdio: 'ignore',
  detached: true, // tsx sinh thêm tiến trình con: giết cả process group (kill(-pid)) kẻo mồ côi giữ cổng
    env: {
      ...process.env,
      GEN_STAGE_PORT: String(CONG_T),
      GEN_STAGE_TTS_PORT: String(GOC + 5),
      GEN_STAGE_MCP_PORT: String(GOC + 6),
      GEN_STAGE_STT_PORT: String(GOC + 7),
      GEN_STAGE_TOKEN: TOKEN,
    },
  });
  for (let i = 0; i < 30; i++) {
    try { (await noi(`?token=${TOKEN}`, CONG_T)).close(); break; } catch { await ngu(300); }
  }
  const clientT = await noi(`?token=${TOKEN}`, CONG_T);
  const tabThat = await noi(`?role=stage&token=${TOKEN}`, CONG_T);
  let tabThatDong = false;
  tabThat.on('close', () => (tabThatDong = true));
  const lenhNhan = [];
  tabThat.on('message', (t) => {
    const g = JSON.parse(String(t));
    if (g.cmd) {
      lenhNhan.push(g.cmd);
      tabThat.send(JSON.stringify({ id: g.id, ok: true, result: { tabThat: true } }));
    }
  });
  await ngu(300);

  const gia = await noi('?role=stage', CONG_T); // không token
  const giaNhan = [];
  gia.on('message', (t) => giaNhan.push(JSON.parse(String(t))));
  await ngu(500);
  kiem('token: stage không token KHÔNG đá được tab thật', !tabThatDong);
  clientT.msgs.length = 0;
  clientT.send(JSON.stringify({ id: 't1', cmd: 'stage.describe' }));
  await ngu(500);
  kiem('token: lệnh vẫn tới tab thật, trả kết quả tab thật', clientT.msgs.find((m) => m.id === 't1')?.result?.tabThat === true);
  kiem('token: stage giả không nhận được lệnh nào', !giaNhan.some((m) => m.cmd));
  await ngu(3300); // quá hạn 3 s chờ khung token → bridge đóng kết nối giả
  kiem('token: stage không token bị đóng sau hạn chờ', gia.readyState === WebSocket.CLOSED);

  // stage có token qua khung đầu vẫn thay được tab thật
  const maThat = new Promise((r) => tabThat.on('close', (ma) => r(ma)));
  const tabMoiT = await noi('?role=stage', CONG_T);
  tabMoiT.send(JSON.stringify({ token: TOKEN }));
  await ngu(500);
  kiem('token: stage xác thực bằng khung đầu thay được tab cũ (mã 4001)', (await maThat) === 4001);
  tabMoiT.close();
  clientT.close();
} finally {
  for (const b of [bridge, bridgeT]) {
    if (b?.pid) try { process.kill(-b.pid, 'SIGTERM'); } catch { /* đã thoát */ }
  }
}
console.log(loi.length ? `\nFAIL ${loi.length}` : '\nTẤT CẢ OK');
process.exit(loi.length ? 1 : 0);
