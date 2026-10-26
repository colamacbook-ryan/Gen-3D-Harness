// Test dò cổng + bật/tắt tiến trình bằng server/pnpm GIẢ (không đụng 8787/5173 thật).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dc = require('../out/thuan/do-cong.js');
const tt = require('../out/thuan/tien-trinh.js');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNPM_GIA = path.join(DIR, 'gia', 'pnpm-gia.sh');
const SERVER_GIA = path.join(DIR, 'gia', 'server-gia.mjs');

// cổng riêng cho test, xa 8787/5173 của Sếp
const C = { bridge: 18797, tts: 18798, dev: 15183, lạ: 15184 };
const conPhaiDon = [];
after(() => {
  for (const p of conPhaiDon) try { process.kill(p.pid); } catch { /* đã chết */ }
});

function batServer(kieu, cong, tieuDe) {
  const p = spawn(process.execPath, [SERVER_GIA, kieu, String(cong), ...(tieuDe ? [tieuDe] : [])], { stdio: 'ignore' });
  conPhaiDon.push(p);
  return p;
}

test('laTrangGenStage: chỉ nhận title có "Gen-Stage"', () => {
  assert.equal(dc.laTrangGenStage('<html><title>Gen-Stage · Sân khấu</title>'), true);
  assert.equal(dc.laTrangGenStage('<TITLE lang="vi">x gen-stage y</TITLE>'), true);
  assert.equal(dc.laTrangGenStage('<title>Vite App</title>'), false);
  assert.equal(dc.laTrangGenStage('Gen-Stage nhưng không có title'), false);
});

test('coNgheTcp + doSanKhau với server thật', async () => {
  assert.equal(await dc.coNgheTcp(C.bridge), false);
  assert.equal(await dc.doSanKhau(C.dev), 'khong-co');
  const a = batServer('tcp', C.bridge);
  const b = batServer('http', C.dev);
  const c = batServer('http', C.lạ, 'Vite App khác');
  assert.equal(await dc.doiToi(() => dc.coNgheTcp(C.bridge), 5000, 50), true);
  assert.equal(await dc.doiToi(async () => (await dc.doSanKhau(C.dev)) === 'gen-stage', 5000, 50), true);
  assert.equal(await dc.doiToi(async () => (await dc.doSanKhau(C.lạ)) === 'app-khac', 5000, 50), true);
  for (const p of [a, b, c]) p.kill();
  await new Promise((r) => setTimeout(r, 200));
});

test('lenhBridge/lenhVite: ép 127.0.0.1 + strictPort, truyền cổng qua env', () => {
  const cfg = { pnpm: 'pnpm', bridgePort: 8797, ttsPort: 8798, devPort: 5180 };
  assert.deepEqual(tt.lenhVite(cfg).args, ['exec', 'vite', '--host', '127.0.0.1', '--port', '5180', '--strictPort']);
  assert.deepEqual(tt.lenhBridge(cfg).env, { GEN_STAGE_PORT: '8797', GEN_STAGE_TTS_PORT: '8798' });
  assert.deepEqual(tt.lenhBridge(cfg).args, ['bridge']);
});

test('keHoachBat: chỉ bật cái thiếu; có sẵn thì không đụng', () => {
  const k = (bridge, sanKhau, tuBat = true, coRoot = true) => tt.keHoachBat({ bridge, sanKhau }, tuBat, coRoot);
  assert.deepEqual(k(true, 'gen-stage'), { batBridge: false, batVite: false, canhBao: [] });
  assert.deepEqual(k(false, 'gen-stage'), { batBridge: true, batVite: false, canhBao: [] });
  assert.deepEqual(k(true, 'khong-co'), { batBridge: false, batVite: true, canhBao: [] });
  const appKhac = k(true, 'app-khac');
  assert.equal(appKhac.batVite, false);
  assert.match(appKhac.canhBao[0], /app KHÁC/);
  const tat = k(false, 'khong-co', false);
  assert.equal(tat.batBridge || tat.batVite, false);
  assert.match(tat.canhBao.join(), /tuBat/);
  const khongRoot = k(false, 'khong-co', true, false);
  assert.equal(khongRoot.batBridge || khongRoot.batVite, false);
  assert.match(khongRoot.canhBao.join(), /genStage.root/);
});

function cfgThu(root) {
  return { root, bridgePort: C.bridge, ttsPort: C.tts, devPort: C.dev, tuBat: true, pnpm: PNPM_GIA };
}

function pidCon(pidCha) {
  // con trực tiếp của pnpm giả (server node) — đọc từ /proc
  const ra = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (ppid === pidCha) ra.push(Number(d));
    } catch { /* tiến trình vừa chết */ }
  }
  return ra;
}

test('QuanLyTienTrinh: bật cả nhóm, nhận lại sau khi host "chết", tắt sạch cả cháu', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-vscode-'));
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfgThu(root), (d) => log.push(d));
  const kq = await ql.batNeuCan();
  assert.equal(kq.tt.bridge, true, log.join('\n'));
  assert.equal(kq.tt.sanKhau, 'gen-stage', log.join('\n'));
  assert.equal(ql.laCuaMinh('bridge') && ql.laCuaMinh('vite'), true);

  const so = JSON.parse(fs.readFileSync(path.join(root, '.cache/vscode/tien-trinh.json'), 'utf8'));
  const chau = [...pidCon(so.bridge.pid), ...pidCon(so.vite.pid)];
  assert.equal(chau.length, 2, 'mỗi pnpm giả có một con nghe cổng');

  // "extension host chết ngang": quản lý mới, đọc sổ, nhận lại quyền
  const ql2 = new tt.QuanLyTienTrinh(cfgThu(root), (d) => log.push(d));
  ql2.nhanLai();
  assert.equal(ql2.laCuaMinh('bridge') && ql2.laCuaMinh('vite'), true);

  const da = ql2.tatCuaMinh();
  assert.equal(da.length, 2);
  await new Promise((r) => setTimeout(r, 400));
  for (const p of [so.bridge.pid, so.vite.pid, ...chau]) assert.equal(tt.conSong(p), false, `pid ${p} phải chết`);
  assert.equal(await dc.coNgheTcp(C.bridge), false);
  assert.equal(await dc.doSanKhau(C.dev), 'khong-co');
  fs.rmSync(root, { recursive: true, force: true });
});

test('QuanLyTienTrinh: dịch vụ có sẵn thì dùng lại và KHÔNG BAO GIỜ tắt', async () => {
  const a = batServer('tcp', C.bridge);
  const b = batServer('http', C.dev);
  await dc.doiToi(() => dc.coNgheTcp(C.bridge), 5000, 50);
  await dc.doiToi(async () => (await dc.doSanKhau(C.dev)) === 'gen-stage', 5000, 50);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-vscode-'));
  const ql = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined);
  const kq = await ql.batNeuCan();
  assert.equal(kq.tt.bridge && kq.tt.sanKhau === 'gen-stage', true);
  assert.equal(ql.laCuaMinh('bridge') || ql.laCuaMinh('vite'), false);
  assert.deepEqual(ql.tatCuaMinh(), []);
  assert.equal(tt.conSong(a.pid) && tt.conSong(b.pid), true, 'server của "Sếp" vẫn sống');
  // sổ ghi PID lạ vào cũng không nhận bừa: PID của "Sếp" nhưng dòng lệnh không khớp dấu hiệu
  fs.mkdirSync(path.join(root, '.cache/vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cache/vscode/tien-trinh.json'), JSON.stringify({ vite: { pid: b.pid, dauHieu: 'vite' } }));
  const ql2 = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined);
  ql2.nhanLai();
  assert.equal(ql2.laCuaMinh('vite'), false);
  a.kill();
  b.kill();
  fs.rmSync(root, { recursive: true, force: true });
});
