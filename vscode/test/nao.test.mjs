// V1 — driver não do extension quản lý (`genStage.nao`), bằng pnpm GIẢ
// (`gia/pnpm-gia.sh nao-local|nao` → node gia/scripts/nao-*.mjs). Cổng bridge
// giả 8874/8875 (dải riêng V1) — driver giả không nối gì, chỉ mang GEN_STAGE_PORT.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tt = require('../out/thuan/tien-trinh.js');
const ch = require('../out/thuan/cau-hinh.js');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PNPM_GIA = path.join(DIR, 'gia', 'pnpm-gia.sh');
const CONG = 8874;
const CONG_KHAC = 8875;

const conPhaiDon = [];
after(() => {
  for (const p of conPhaiDon) try { process.kill(-p.pid, 'SIGKILL'); } catch { /* đã chết */ }
});
const doi = (ms) => new Promise((r) => setTimeout(r, ms));
const thuMucTam = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gs-nao-'));
const cfg = (root, nao, them = {}) => ({ root, bridgePort: CONG, ttsPort: CONG + 1, devPort: 15213, tuBat: true, pnpm: PNPM_GIA, nao, ...them });

/** Mọi driver não (thật hay giả) đang nối cổng CONG — kể cả của chính ql (không bỏ nhóm nào). */
const driverTrenCong = (cong = CONG) => tt.timDriverNaoNgoai(cong);
async function cho(dk, han = 5000) {
  const het = Date.now() + han;
  while (!dk() && Date.now() < het) await doi(50);
  return dk();
}

test('chuanNao + lenhNao: tat/local/agy, giá trị lạ = tat; GEN_STAGE_PORT = cổng bridge', () => {
  assert.equal(ch.MAC_DINH.nao, 'tat');
  assert.equal(ch.chuanNao('local'), 'local');
  assert.equal(ch.chuanNao('agy'), 'agy');
  for (const x of ['', 'LOCAL', undefined, null, 1, 'bat']) assert.equal(ch.chuanNao(x), 'tat');
  assert.equal(tt.lenhNao({ pnpm: 'pnpm', bridgePort: 8797, nao: 'tat' }), null);
  assert.deepEqual(tt.lenhNao({ pnpm: 'pnpm', bridgePort: 8797, nao: 'local' }), { cmd: 'pnpm', args: ['nao-local'], env: { GEN_STAGE_PORT: '8797' } });
  assert.deepEqual(tt.lenhNao({ pnpm: 'pnpm', bridgePort: 8797, nao: 'agy' }).args, ['nao']);
});

test('laArgvDriverNao: node/tsx chạy scripts/nao-agy|nao-local.mjs; không nhận lệnh khác', () => {
  assert.equal(tt.laArgvDriverNao(['node', 'scripts/nao-agy.mjs']), true);
  assert.equal(tt.laArgvDriverNao(['node', '/x/node_modules/tsx/dist/cli.mjs', 'scripts/nao-local.mjs']), true);
  assert.equal(tt.laArgvDriverNao(['node', '/abs/scripts/nao-local.mjs']), true);
  assert.equal(tt.laArgvDriverNao(['node', 'scripts/nao-demo.mjs']), false);
  assert.equal(tt.laArgvDriverNao(['vim', 'scripts/nao-agy.mjs.bak']), false);
  assert.equal(tt.laArgvDriverNao([]), false);
});

test('dongBoNao: bật đúng lệnh, giữ khi không đổi, đổi chế độ = tắt cái cũ rồi bật cái mới, tat = tắt; chỉ một driver', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfg(root, 'local'), (d) => log.push(d), { thuMuc: kho, hanDoiNaoMs: 400 });
  let kq = await ql.dongBoNao();
  assert.deepEqual([kq.trangThai, kq.cheDo], ['dang-chay', 'local'], log.join('\n'));
  assert.equal(ql.laCuaMinh('nao'), true);
  assert.ok(await cho(() => driverTrenCong().length === 1), 'đúng một driver nao-local giả');
  const so = JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8'));
  const muc = so.dichVu[`nao@${CONG}`];
  assert.ok(muc, 'sổ PID có mục nao@<cổng bridge>');
  assert.deepEqual(tt.docArgv(muc.pid).slice(-1), ['nao-local'], 'spawn đúng `pnpm nao-local`');
  const nhomLocal = muc.pid;

  // gọi lại, không đổi → không bật thêm
  kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'dang-chay');
  assert.equal(log.filter((d) => /bật nao:/.test(d)).length, 1, log.join('\n'));

  // đổi sang agy → nhóm cũ chết hẳn, driver mới là nao-agy
  ql.datCauHinh(cfg(root, 'agy'));
  kq = await ql.dongBoNao();
  assert.deepEqual([kq.trangThai, kq.cheDo], ['dang-chay', 'agy'], log.join('\n'));
  assert.equal(tt.conSong(nhomLocal), false, 'driver local cũ đã bị tắt');
  assert.ok(await cho(() => driverTrenCong().length === 1));
  assert.ok(tt.docArgv(driverTrenCong()[0]).some((a) => a.endsWith('nao-agy.mjs')));

  // đổi liên tục, gọi chồng nhau → các lượt xếp hàng, cuối cùng đúng MỘT driver
  ql.datCauHinh(cfg(root, 'local'));
  const [a, b] = await Promise.all([ql.dongBoNao(), ql.dongBoNao()]);
  assert.equal(a.trangThai, 'dang-chay');
  assert.equal(b.trangThai, 'dang-chay');
  await doi(300);
  assert.equal(driverTrenCong().length, 1, 'không bao giờ hai driver');
  assert.ok(tt.docArgv(driverTrenCong()[0]).some((x) => x.endsWith('nao-local.mjs')));

  // tat → tắt cái của mình
  const nhom = JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu[`nao@${CONG}`].pid;
  ql.datCauHinh(cfg(root, 'tat'));
  kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'tat');
  assert.equal(ql.laCuaMinh('nao'), false);
  assert.equal(tt.conSong(nhom), false);
  assert.ok(await cho(() => driverTrenCong().length === 0), 'không còn driver nào');
  assert.equal(JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu[`nao@${CONG}`], undefined);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('driver NGOÀI cùng cổng bridge → không bật thêm, không giết; khác cổng thì không cản', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const ngoai = spawn(process.execPath, [path.join(DIR, 'gia', 'scripts', 'nao-agy.mjs')], {
    env: { ...process.env, GEN_STAGE_PORT: String(CONG) },
    stdio: 'ignore',
    detached: true,
  });
  conPhaiDon.push(ngoai);
  assert.ok(await cho(() => driverTrenCong().includes(ngoai.pid)));
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfg(root, 'local'), (d) => log.push(d), { thuMuc: kho, hanDoiNaoMs: 300 });
  const kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'cua-ngoai');
  assert.match(kq.lyDo, new RegExp(String(ngoai.pid)));
  assert.equal(ql.laCuaMinh('nao'), false);
  assert.equal(log.some((d) => /bật nao:/.test(d)), false);
  assert.deepEqual(ql.tatCuaMinh(), []);
  assert.equal(tt.conSong(ngoai.pid), true, 'driver ngoài vẫn sống');

  // cùng driver ngoài đó, nhưng cấu hình nối bridge KHÁC cổng → bật được
  ql.datCauHinh(cfg(root, 'local', { bridgePort: CONG_KHAC }));
  const kq2 = await ql.dongBoNao();
  assert.equal(kq2.trangThai, 'dang-chay', log.join('\n'));
  assert.equal(ql.tatCuaMinh().length, 1, 'tatCuaMinh tắt cả driver não của mình');
  assert.ok(await cho(() => driverTrenCong(CONG_KHAC).length === 0));
  assert.equal(tt.conSong(ngoai.pid), true);
  process.kill(-ngoai.pid, 'SIGTERM');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('choPhepBat chặn (workspace chưa tin cậy) → không bật; driver chết ngay → loi; tat không hỏi gì', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  let hoi = 0;
  const qlCam = new tt.QuanLyTienTrinh(cfg(root, 'agy'), () => undefined, {
    thuMuc: kho,
    choPhepBat: async () => (hoi++, 'Workspace chưa được tin cậy'),
  });
  const kq = await qlCam.dongBoNao();
  assert.equal(kq.trangThai, 'loi');
  assert.match(kq.lyDo, /chưa được tin cậy/);
  assert.equal(hoi, 1);
  assert.equal(driverTrenCong().length, 0);

  qlCam.datCauHinh(cfg(root, 'tat'));
  assert.equal((await qlCam.dongBoNao()).trangThai, 'tat');
  assert.equal(hoi, 1, 'tat không hỏi quyền');

  const hong = path.join(kho, 'pnpm-hong.sh');
  fs.writeFileSync(hong, '#!/bin/sh\necho "ERR_PNPM_NO_SCRIPT Missing script: nao-local" >&2\nexit 1\n', { mode: 0o755 });
  const log = [];
  const qlHong = new tt.QuanLyTienTrinh(cfg(root, 'local', { pnpm: hong }), (d) => log.push(d), { thuMuc: kho, hanDoiNaoMs: 3000 });
  const kq2 = await qlHong.dongBoNao();
  assert.equal(kq2.trangThai, 'loi');
  assert.match(kq2.lyDo, /thoát ngay/);
  assert.ok(log.some((d) => /Missing script/.test(d)), 'stderr driver vào log');

  const qlKhongRoot = new tt.QuanLyTienTrinh(cfg('', 'local'), () => undefined, { thuMuc: kho });
  assert.match((await qlKhongRoot.dongBoNao()).lyDo, /genStage.root/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('cửa sổ chủ chết → cửa sổ mới nhận lại driver não (đúng chữ ký) rồi đổi/tắt được', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const host = spawn('sleep', ['600'], { stdio: 'ignore' });
  conPhaiDon.push(host);
  const chuA = tt.danhTinhCua(host.pid);
  const qlA = new tt.QuanLyTienTrinh(cfg(root, 'local'), () => undefined, { thuMuc: kho, chu: chuA, hanDoiNaoMs: 300 });
  assert.equal((await qlA.dongBoNao()).trangThai, 'dang-chay');
  const nhom = JSON.parse(fs.readFileSync(path.join(kho, 'tien-trinh.json'), 'utf8')).dichVu[`nao@${CONG}`].pid;
  qlA.dungHet();

  // A còn sống: B thấy driver của A là "ngoài", không giết
  const qlB = new tt.QuanLyTienTrinh(cfg(root, 'agy'), () => undefined, { thuMuc: kho, hanDoiNaoMs: 300 });
  assert.equal((await qlB.dongBoNao()).trangThai, 'cua-ngoai');
  assert.equal(tt.conSong(nhom), true);

  // A chết: B nhận lại (chữ ký nao-local) rồi đổi sang agy theo setting của B
  host.kill();
  await cho(() => !tt.conSong(host.pid));
  const kq = await qlB.dongBoNao();
  assert.deepEqual([kq.trangThai, kq.cheDo], ['dang-chay', 'agy']);
  assert.equal(tt.conSong(nhom), false, 'driver local cũ (nhận lại) đã bị tắt');
  assert.ok(await cho(() => driverTrenCong().length === 1));
  qlB.tatCuaMinh();
  assert.ok(await cho(() => driverTrenCong().length === 0));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

/** pnpm giả tuỳ biến: ghi script sh vào `kho`, trả đường dẫn. */
function pnpmTuyBien(kho, ten, than) {
  const f = path.join(kho, ten);
  fs.writeFileSync(f, `#!/bin/sh\n${than}\n`, { mode: 0o755 });
  return f;
}

test('mã thoát 3 (khoá) sau 2000 ms → cua-ngoai, KHÔNG dang-chay; khiNaoThoat cũng báo cua-ngoai', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const khoa = pnpmTuyBien(kho, 'pnpm-khoa.sh', 'sleep 2; echo "đang có driver não khác" >&2; exit 3');
  const bao = [];
  const ql = new tt.QuanLyTienTrinh(cfg(root, 'local', { pnpm: khoa }), () => undefined, {
    thuMuc: kho,
    hanDoiNaoMs: 5000,
    khiNaoThoat: (k) => bao.push(k),
  });
  const kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'cua-ngoai', JSON.stringify(kq));
  assert.match(kq.lyDo, /driver não khác đang giữ khoá/);
  assert.ok(await cho(() => bao.length === 1), 'khiNaoThoat được gọi');
  assert.equal(bao[0].trangThai, 'cua-ngoai');
  assert.equal(ql.laCuaMinh('nao'), false);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('file khoá của pid SỐNG lạ → cua-ngoai, không spawn; khoá mồ côi (pid chết) → bật được', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const la = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
  conPhaiDon.push(la);
  const duong = tt.duongKhoaNao(root, {});
  fs.mkdirSync(path.dirname(duong), { recursive: true });
  const st = tt.docStat(la.pid);
  fs.writeFileSync(duong, JSON.stringify({ pid: la.pid, starttime: st.starttime, ten: 'nao-agy' }));
  const log = [];
  const ql = new tt.QuanLyTienTrinh(cfg(root, 'local'), (d) => log.push(d), { thuMuc: kho, hanDoiNaoMs: 300 });
  let kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'cua-ngoai', JSON.stringify(kq));
  assert.match(kq.lyDo, /giữ khoá/);
  assert.equal(log.some((d) => /bật nao:/.test(d)), false, 'không spawn');
  assert.equal(ql.laCuaMinh('nao'), false);

  // starttime lệch (pid bị cấp lại) = mồ côi
  fs.writeFileSync(duong, JSON.stringify({ pid: la.pid, starttime: '1', ten: 'nao-agy' }));
  kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'dang-chay', JSON.stringify(kq));
  ql.tatCuaMinh();
  assert.ok(await cho(() => driverTrenCong().length === 0));

  // pid đã chết hẳn
  process.kill(-la.pid, 'SIGKILL');
  assert.ok(await cho(() => !tt.conSong(la.pid)));
  fs.writeFileSync(duong, JSON.stringify({ pid: la.pid, starttime: st.starttime, ten: 'nao-agy' }));
  assert.equal(tt.docKhoaNaoSong(duong), null);
  kq = await ql.dongBoNao();
  assert.equal(kq.trangThai, 'dang-chay', JSON.stringify(kq));
  ql.tatCuaMinh();
  assert.ok(await cho(() => driverTrenCong().length === 0));
  assert.equal(tt.duongKhoaNao(root, { GEN_STAGE_NAO_KHOA: '/x/k.lock' }), '/x/k.lock');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});

test('driver chạy rồi tự chết sau 3 s → khiNaoThoat báo loi (mã ≠ 0) / tat (mã 0); tắt chủ động không báo', async () => {
  const root = thuMucTam();
  const kho = thuMucTam();
  const chet = pnpmTuyBien(kho, 'pnpm-chet.sh', 'sleep 3; exit 1');
  const bao = [];
  const ql = new tt.QuanLyTienTrinh(cfg(root, 'local', { pnpm: chet }), () => undefined, {
    thuMuc: kho,
    hanDoiNaoMs: 300,
    khiNaoThoat: (k) => bao.push(k),
  });
  assert.equal((await ql.dongBoNao()).trangThai, 'dang-chay');
  assert.ok(await cho(() => bao.length === 1, 6000), 'đã báo khi driver chết');
  assert.equal(bao[0].trangThai, 'loi');
  assert.equal(ql.laCuaMinh('nao'), false);

  const ra0 = pnpmTuyBien(kho, 'pnpm-0.sh', 'sleep 1; exit 0');
  ql.datCauHinh(cfg(root, 'local', { pnpm: ra0 }));
  assert.equal((await ql.dongBoNao()).trangThai, 'dang-chay');
  assert.ok(await cho(() => bao.length === 2, 4000));
  assert.equal(bao[1].trangThai, 'tat');

  // tắt chủ động (tatCuaMinh) không gọi khiNaoThoat
  ql.datCauHinh(cfg(root, 'local'));
  assert.equal((await ql.dongBoNao()).trangThai, 'dang-chay');
  ql.tatCuaMinh();
  await doi(500);
  assert.equal(bao.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(kho, { recursive: true, force: true });
});
