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
  assert.deepEqual(tt.lenhBridge(cfg).env, { GEN_STAGE_PORT: '8797', GEN_STAGE_TTS_PORT: '8798', GEN_STAGE_MCP_PORT: '8799' });
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

function cfgThu(root, pnpm = PNPM_GIA) {
  return { root, bridgePort: C.bridge, ttsPort: C.tts, devPort: C.dev, tuBat: true, pnpm };
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

const doi = (ms) => new Promise((r) => setTimeout(r, ms));
const thuMucTam = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-vscode-'));

/** "Extension host" giả: một tiến trình sleep — giết nó = cửa sổ VS Code chủ chết. */
function hostGia() {
  const p = spawn('sleep', ['600'], { stdio: 'ignore' });
  conPhaiDon.push(p);
  return { p, chu: tt.danhTinhCua(p.pid) };
}

/**
 * Cổng đóng hẳn. Không kiểm ngay sau `choChet`: leader node thành zombie khi
 * luồng chính thoát nhưng luồng libuv còn dọn → socket còn mở thêm vài ms.
 */
function congDaDong() {
  return dc.doiToi(async () => !(await dc.coNgheTcp(C.bridge)) && (await dc.doSanKhau(C.dev)) === 'khong-co', 3000, 50);
}

async function choChet(pid, han = 3000) {
  const het = Date.now() + han;
  while (tt.conSong(pid) && Date.now() < het) await doi(50);
  return !tt.conSong(pid);
}

test('pidHopLe/conSong: 0, -1, 1, chính mình đều bị chặn; /proc đọc hỏng = chết', () => {
  for (const p of [0, -1, 1, process.pid, 1.5, NaN, '123']) assert.equal(tt.pidHopLe(p), false, `pid ${p}`);
  assert.equal(tt.conSong(0), false);
  assert.equal(tt.conSong(-1), false);
  assert.equal(tt.docStat(-1), null);
  assert.equal(tt.conSong(process.pid), true);
  assert.match(tt.bootId(), /^[0-9a-f-]{36}$/);
});

test('timLenh: tên trong PATH (bỏ mục tương đối) hoặc đường dẫn tuyệt đối; từ chối đường dẫn tương đối', () => {
  const d = thuMucTam();
  const f = path.join(d, 'pnpm');
  fs.writeFileSync(f, '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(tt.timLenh(f), f);
  assert.equal(tt.timLenh('pnpm', `relative/dir${path.delimiter}${d}`), f);
  assert.equal(tt.timLenh('pnpm', `.${path.delimiter}`), null, 'mục PATH "." bị bỏ qua');
  assert.equal(tt.timLenh('./pnpm', d), null);
  assert.equal(tt.timLenh('bin/pnpm', d), null);
  assert.equal(tt.timLenh('..', d), null);
  assert.equal(tt.timLenh(''), null);
  assert.equal(tt.timLenh(path.join(d, 'khong-co')), null);
  fs.rmSync(d, { recursive: true, force: true });
});

test('khopChuKy: đuôi argv phải trùng hẳn args, phần tử trước là cmd', () => {
  const cmd = PNPM_GIA;
  assert.equal(tt.khopChuKy(['bash', cmd, 'bridge'], cmd, ['bridge']), true);
  assert.equal(tt.khopChuKy(['bash', cmd, 'bridge', 'x'], cmd, ['bridge']), false);
  assert.equal(tt.khopChuKy(['bash', '/khac/pnpm', 'bridge'], cmd, ['bridge']), false);
  assert.equal(tt.khopChuKy(['sleep', '600'], cmd, ['bridge']), false);
  assert.equal(tt.khopChuKy([], cmd, []), false);
});

test('QuanLyTienTrinh: bật cả nhóm, sổ + log ở thư mục storage, chủ còn sống thì cửa sổ khác KHÔNG nhận/tắt, chủ chết mới nhận', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const log = [];
  const A = hostGia();
  const ql = new tt.QuanLyTienTrinh(cfgThu(root), (d) => log.push(d), { thuMuc: kho, chu: A.chu });
  const kq = await ql.batNeuCan();
  assert.equal(kq.tt.bridge, true, log.join('\n'));
  assert.equal(kq.tt.sanKhau, 'gen-stage', log.join('\n'));
  assert.equal(ql.laCuaMinh('bridge') && ql.laCuaMinh('vite'), true);
  assert.equal(fs.existsSync(path.join(root, '.cache')), false, 'không ghi gì vào repo');

  const so = JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8'));
  const b = so.dichVu[`bridge@${C.bridge}`];
  const v = so.dichVu[`vite@${C.dev}`];
  assert.deepEqual(b.chu, A.chu);
  assert.equal(b.bootId, tt.bootId());
  assert.equal(b.starttime, tt.docStat(b.pid).starttime);
  assert.equal((fs.statSync(path.join(kho, 'tien-trinh.json')).mode & 0o777).toString(8), '600');
  const chau = [...pidCon(b.pid), ...pidCon(v.pid)];
  assert.equal(chau.length, 2, 'mỗi pnpm giả có một con nghe cổng');
  // stdout con ghi vào file log (fd), host tail ra `ghi`
  await doi(600);
  assert.match(fs.readFileSync(path.join(kho, 'logs', `bridge-${C.bridge}.log`), 'utf8'), /nghe tcp/);
  assert.ok(log.some((d) => /^\[vite\] nghe http/.test(d)), log.join('\n'));

  // cửa sổ B mở cùng lúc: chủ A còn sống → B chỉ dùng lại, không nhận, không bật, không tắt
  const B = hostGia();
  const qlB = new tt.QuanLyTienTrinh(cfgThu(root), (d) => log.push(d), { thuMuc: kho, chu: B.chu });
  assert.deepEqual(qlB.nhanLai(), { bridge: 'cua-khac', vite: 'cua-khac' });
  const kqB = await qlB.batNeuCan();
  assert.equal(kqB.tt.bridge && kqB.tt.sanKhau === 'gen-stage', true);
  assert.equal(qlB.laCuaMinh('bridge') || qlB.laCuaMinh('vite'), false);
  assert.deepEqual(qlB.tatCuaMinh(), []);
  assert.equal(tt.conSong(b.pid) && tt.conSong(v.pid), true, 'B không được giết dịch vụ của A');
  assert.ok(JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu[`bridge@${C.bridge}`], 'B không xoá mục của A');

  // PID tái sử dụng: starttime trong sổ lệch → không nhận (kể cả khi chủ đã chết)
  A.p.kill();
  assert.equal(await choChet(A.p.pid), true);
  const soLech = JSON.parse(JSON.stringify(so));
  soLech.dichVu[`bridge@${C.bridge}`].starttime = String(Number(b.starttime) - 1);
  soLech.dichVu[`vite@${C.dev}`].bootId = '00000000-0000-0000-0000-000000000000';
  fs.writeFileSync(path.join(kho, 'tien-trinh.json'), JSON.stringify(soLech));
  const qlLech = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined, { thuMuc: kho, chu: B.chu });
  assert.deepEqual(qlLech.nhanLai(), { bridge: 'khong', vite: 'khong' });

  // chủ A đã chết + sổ đúng → B nhận lại quyền và tắt được
  fs.writeFileSync(path.join(kho, 'tien-trinh.json'), JSON.stringify(so));
  assert.deepEqual(qlB.nhanLai(), { bridge: 'nhan', vite: 'nhan' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu[`vite@${C.dev}`].chu, B.chu);
  const da = qlB.tatCuaMinh();
  assert.equal(da.length, 2);
  for (const p of [b.pid, v.pid, ...chau]) assert.equal(await choChet(p), true, `pid ${p} phải chết`);
  assert.equal(await congDaDong(), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu, {});
  ql.dungHet();
  B.p.kill();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('Sổ độc: pid 0 / -1 / 1 / chính mình / tiến trình lạ có dauHieu rỗng → KHÔNG nhận, KHÔNG giết', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const la = spawn('sleep', ['600'], { cwd: root, stdio: 'ignore', detached: true }); // cùng cwd, cùng nhóm riêng
  conPhaiDon.push(la);
  await doi(100);
  const chuChet = { pid: 4194303, starttime: '1' };
  const muc = (pid, them = {}) => ({ pid, starttime: tt.docStat(pid)?.starttime ?? '1', bootId: tt.bootId(), root, chu: chuChet, luc: '', ...them });
  const thu = (pid, them) => {
    fs.writeFileSync(path.join(kho, 'tien-trinh.json'), JSON.stringify({
      phienBan: 1,
      dichVu: { [`bridge@${C.bridge}`]: muc(pid, them), [`vite@${C.dev}`]: muc(pid, { dauHieu: '', ...them }) },
    }));
    const ql = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined, { thuMuc: kho });
    const kq = ql.nhanLai();
    assert.deepEqual(kq, { bridge: 'khong', vite: 'khong' }, `pid ${pid}`);
    assert.deepEqual(ql.tatCuaMinh(), [], `pid ${pid}: không được gửi tín hiệu nào`);
  };
  for (const pid of [0, -1, 1, process.pid]) thu(pid);
  thu(la.pid, { dauHieu: '' }); // bản cũ: ''.includes → nhận rồi kill(-pid)
  assert.equal(tt.conSong(la.pid), true, 'tiến trình lạ vẫn sống');
  // file hỏng / sai kiểu cũng không ném
  fs.writeFileSync(path.join(kho, 'tien-trinh.json'), '{"dichVu":{"bridge@18797":{"pid":"0"}}');
  assert.deepEqual(new tt.QuanLyTienTrinh(cfgThu(root), () => undefined, { thuMuc: kho }).nhanLai(), { bridge: 'khong', vite: 'khong' });
  la.kill();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('Race: batNeuCan song song → mỗi dịch vụ spawn đúng 1 lần, tắt dọn sạch', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfgThu(root), (d) => log.push(d), { thuMuc: kho });
  const p1 = ql.batNeuCan();
  const p2 = ql.batNeuCan();
  assert.equal(p1, p2, 'single-flight: cùng một promise');
  const [k1, k2] = await Promise.all([p1, p2, ql.batNeuCan()]);
  assert.equal(k1.tt.bridge && k2.tt.sanKhau === 'gen-stage', true, log.join('\n'));
  assert.equal(log.filter((d) => /bật bridge:/.test(d)).length, 1, log.join('\n'));
  assert.equal(log.filter((d) => /bật vite:/.test(d)).length, 1, log.join('\n'));
  // gọi lại khi đã chạy: không bật thêm
  await ql.batNeuCan();
  assert.equal(log.filter((d) => /bật (bridge|vite):/.test(d)).length, 2);
  const so = JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8'));
  const goc = Object.values(so.dichVu).map((m) => m.pid);
  const chau = goc.flatMap(pidCon);
  assert.equal(ql.tatCuaMinh().length, 2);
  for (const p of [...goc, ...chau]) assert.equal(await choChet(p), true, `pid ${p} phải chết`);
  assert.equal(await congDaDong(), true);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('Bật hỏng: tiến trình chết ngay → không chờ đủ 30 s; pnpm tương đối → từ chối; choPhepBat chặn được', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const hong = path.join(kho, 'pnpm-hong.sh');
  fs.writeFileSync(hong, '#!/bin/sh\necho "không chạy được" >&2\nexit 3\n', { mode: 0o755 });
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfgThu(root, hong), (d) => log.push(d), { thuMuc: kho });
  const t0 = Date.now();
  const kq = await ql.batNeuCan();
  assert.ok(Date.now() - t0 < 5000, `mất ${Date.now() - t0} ms`);
  assert.equal(kq.tt.bridge, false);
  assert.ok(log.some((d) => /\[bridge\] thoát \(mã 3/.test(d)), log.join('\n'));
  assert.ok(log.some((d) => /không chạy được/.test(d)), 'stderr vào log');
  assert.equal(ql.laCuaMinh('bridge'), false);

  const log2 = [];
  const qlTuongDoi = new tt.QuanLyTienTrinh(cfgThu(root, './pnpm'), (d) => log2.push(d), { thuMuc: kho });
  const kq2 = await qlTuongDoi.batNeuCan();
  assert.match(kq2.canhBao.join(), /genStage.pnpm/);
  assert.equal(log2.some((d) => /bật (bridge|vite):/.test(d)), false);

  let hoi = 0;
  const qlCam = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined, {
    thuMuc: kho,
    choPhepBat: async () => (hoi++, 'Workspace chưa được tin cậy'),
  });
  const kq3 = await qlCam.batNeuCan();
  assert.equal(hoi, 1);
  assert.match(kq3.canhBao.join(), /chưa được tin cậy/);
  assert.equal(qlCam.laCuaMinh('bridge') || qlCam.laCuaMinh('vite'), false);
  assert.equal(await dc.coNgheTcp(C.bridge), false);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('QuanLyTienTrinh: dịch vụ có sẵn thì dùng lại, KHÔNG BAO GIỜ tắt, không hỏi choPhepBat', async () => {
  const a = batServer('tcp', C.bridge);
  const b = batServer('http', C.dev);
  await dc.doiToi(() => dc.coNgheTcp(C.bridge), 5000, 50);
  await dc.doiToi(async () => (await dc.doSanKhau(C.dev)) === 'gen-stage', 5000, 50);
  const root = thuMucTam();
  const kho = thuMucTam();
  let hoi = 0;
  const ql = new tt.QuanLyTienTrinh(cfgThu(root), () => undefined, { thuMuc: kho, choPhepBat: async () => (hoi++, null) });
  const kq = await ql.batNeuCan();
  assert.equal(kq.tt.bridge && kq.tt.sanKhau === 'gen-stage', true);
  assert.equal(hoi, 0);
  assert.equal(ql.laCuaMinh('bridge') || ql.laCuaMinh('vite'), false);
  assert.deepEqual(ql.tatCuaMinh(), []);
  assert.equal(tt.conSong(a.pid) && tt.conSong(b.pid), true, 'server của "Sếp" vẫn sống');
  a.kill();
  b.kill();
  await doi(200);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});
