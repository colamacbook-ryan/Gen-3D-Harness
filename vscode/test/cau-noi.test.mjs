// Test cầu nối ws với một bridge GIẢ (gói `ws` của repo nền làm server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const { CauNoi, chonNhaMayWs, tinhBackoff } = require('../out/thuan/cau-noi.js');

const doi = (ms) => new Promise((r) => setTimeout(r, ms));
async function doiDen(dk, han = 5000) {
  const het = Date.now() + han;
  while (!dk()) {
    if (Date.now() > het) throw new Error('quá hạn chờ');
    await doi(20);
  }
}

/** Bridge giả: chào như bridge thật, trả stage.describe, đếm query role. */
function bridgeGia(port) {
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  const st = { url: [], lenh: [] };
  wss.on('connection', (ws, req) => {
    st.url.push(req.url);
    ws.send(JSON.stringify({ event: 'bridge.hello', data: { stageOnline: true } }));
    ws.on('message', (b) => {
      const g = JSON.parse(String(b));
      if ('ping' in g) return ws.send(JSON.stringify({ pong: g.ping }));
      st.lenh.push(g);
      if (g.cmd === 'stage.describe') ws.send(JSON.stringify({ id: g.id, ok: true, result: { actors: [{ id: 'gen', name: 'Gen', controlledBy: 'agent' }] } }));
      else if (g.cmd === 'im-lang') { /* không trả lời */ }
      else ws.send(JSON.stringify({ id: g.id, ok: false, error: `Không có lệnh "${g.cmd}"` }));
    });
  });
  return { wss, st, dong: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); }) };
}

test('Node 22 có WebSocket toàn cục → chonNhaMayWs dùng nó', () => {
  assert.equal(typeof globalThis.WebSocket, 'function');
  assert.equal(chonNhaMayWs().nguon, 'toan-cuc');
});

test('tinhBackoff 1 s → 10 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => tinhBackoff(n)), [1000, 2000, 4000, 8000, 10000, 10000]);
});

for (const nguon of ['toan-cuc', 'ws']) {
  test(`CauNoi (${nguon}): nối, nhận sự kiện, gọi lệnh có id, lỗi trả về chứ không ném`, async () => {
    const PORT = nguon === 'ws' ? 18811 : 18812;
    const b = bridgeGia(PORT);
    const WS = require('ws');
    const suKien = [];
    const trangThai = [];
    const cn = new CauNoi({
      url: `ws://127.0.0.1:${PORT}/`,
      taoWs: nguon === 'ws' ? (u) => new WS(u) : undefined,
      khiSuKien: (e, d) => suKien.push([e, d]),
      khiTrangThai: (n) => trangThai.push(n),
      hanLenhMs: 300,
    });
    assert.deepEqual(await cn.goi('stage.describe'), { ok: false, error: 'Chưa nối bridge' });
    cn.bat();
    await doiDen(() => cn.noi && suKien.length > 0);
    assert.deepEqual(suKien[0], ['bridge.hello', { stageOnline: true }]);
    assert.equal(b.st.url[0], '/', 'vai client, không có ?role=');
    const kq = await cn.goi('stage.describe');
    assert.equal(kq.ok, true);
    assert.equal(kq.result.actors[0].id, 'gen');
    assert.deepEqual(await cn.goi('khong.co'), { ok: false, error: 'Không có lệnh "khong.co"' });
    assert.match((await cn.goi('im-lang')).error, /không trả lời trong 300 ms/);
    assert.match(b.st.lenh[0].id, /^vscode-\d+$/);
    cn.tat();
    await b.dong();
    assert.deepEqual(trangThai, [true, false]);
  });
}

test('CauNoi: bridge chết → lệnh đang chờ trả lỗi ngay, bridge sống lại → tự nối lại', async () => {
  const PORT = 18813;
  let b = bridgeGia(PORT);
  const trangThai = [];
  const cn = new CauNoi({ url: `ws://127.0.0.1:${PORT}/`, khiTrangThai: (n) => trangThai.push(n), hanLenhMs: 10000 });
  cn.bat();
  await doiDen(() => cn.noi);
  const dangCho = cn.goi('im-lang');
  await doi(50);
  await b.dong();
  const kq = await dangCho;
  assert.equal(kq.ok, false);
  assert.match(kq.error, /Mất kết nối/);
  await doiDen(() => trangThai.includes(false));
  b = bridgeGia(PORT);
  await doiDen(() => cn.noi, 8000);
  assert.deepEqual(trangThai, [true, false, true]);
  cn.tat();
  await b.dong();
});

test('CauNoi: nhịp tim — bridge không trả pong thì tự đóng để nối lại', async () => {
  const PORT = 18814;
  const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' }); // không bao giờ trả lời gì
  const trangThai = [];
  const cn = new CauNoi({ url: `ws://127.0.0.1:${PORT}/`, khiTrangThai: (n) => trangThai.push(n), nhipTimMs: 50, quaHanTimMs: 200 });
  cn.bat();
  await doiDen(() => trangThai.includes(false), 3000);
  cn.tat();
  await new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(() => r()); });
  assert.equal(trangThai[0], true);
});

test('CauNoi: nhịp tim quá hạn mà close() không bao giờ bắn onclose → tự dọn + nối lại ngay', async () => {
  const tao = [];
  // ws giả "OPEN treo": close() không làm gì, không bao giờ gọi onclose
  const taoWs = () => {
    const ws = { readyState: 0, dong: 0, send: () => undefined, close() { this.dong++; }, onopen: null, onmessage: null, onclose: null, onerror: null };
    tao.push(ws);
    setTimeout(() => { ws.readyState = 1; ws.onopen?.({}); }, 5);
    return ws;
  };
  const trangThai = [];
  const cn = new CauNoi({ url: 'ws://gia/', taoWs, khiTrangThai: (n) => trangThai.push(n), nhipTimMs: 30, quaHanTimMs: 100 });
  cn.bat();
  await doiDen(() => cn.noi);
  const cho = cn.goi('treo');
  await doiDen(() => tao.length >= 2, 3000); // backoff 1 s rồi nối lại, không đợi onclose
  assert.equal(tao[0].dong, 1, 'đã gọi close() đúng một lần');
  assert.match((await cho).error, /Quá hạn nhịp tim/);
  assert.deepEqual(trangThai.slice(0, 2), [true, false]);
  tao[0].onclose?.({ code: 1006 }); // onclose tới muộn: bị bỏ qua, không nối thêm
  await doiDen(() => cn.noi);
  cn.tat();
  assert.equal(tao.length, 2);
});
