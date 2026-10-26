// V2 — giọng nói trong extension: DieuKhienGiong + tai-nghe GIẢ (gia/scripts/tai-nghe.mjs,
// chạy qua gia/pnpm-gia.sh `exec node …` y như `pnpm exec node scripts/tai-nghe.mjs`)
// + bridge ws GIẢ. Cổng riêng V2: 8930 (bridge giả), 8931 (stt — chỉ truyền tham số); đổi gốc bằng GEN_STAGE_TEST_CONG.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const { DieuKhienGiong } = require('../out/thuan/giong.js');
const tn = require('../out/thuan/tai-nghe.js');
const ch = require('../out/thuan/cau-hinh.js');
const lg = require('../out/thuan/chatroom-logic.js');
const { SoChatroom } = require('../out/thuan/so-chatroom.js');
const { CauNoi } = require('../out/thuan/cau-noi.js');
const { xuLyTinChatroom } = require('../out/thuan/xu-ly-chatroom.js');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GIA = path.join(DIR, 'gia');
const PNPM_GIA = path.join(GIA, 'pnpm-gia.sh');
const CONG_GOC = Number(process.env.GEN_STAGE_TEST_CONG ?? 8930);
const CONG = CONG_GOC;
const CONG_STT = CONG_GOC + 1;

const doi = (ms) => new Promise((r) => setTimeout(r, ms));
async function cho(dk, han = 6000) {
  const het = Date.now() + han;
  while (!dk() && Date.now() < het) await doi(25);
  return dk();
}
/** Còn sống thật (zombie `Z` = đã chết: con mồ côi bị gán cho PID 1, mà PID 1 của sandbox không thu hồi). */
const song = (pid) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '')[0] !== 'Z';
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------ bridge giả */
const bridge = { lenh: [] };
const wss = new WebSocketServer({ port: CONG, host: '127.0.0.1' });
wss.on('connection', (ws) => {
  ws.on('message', (b) => {
    const g = JSON.parse(String(b));
    if ('ping' in g) return ws.send(JSON.stringify({ pong: g.ping }));
    bridge.lenh.push(g);
    ws.send(JSON.stringify({ id: g.id, ok: true, result: { ok: true } }));
  });
});
const nhomPhaiDon = [];
after(async () => {
  for (const p of nhomPhaiDon) try { process.kill(-p, 'SIGKILL'); } catch { /* đã chết */ }
  for (const c of wss.clients) c.terminate();
  await new Promise((r) => wss.close(() => r()));
});

const ACTORS = [
  { id: 'owner', name: 'Javis', controlledBy: 'owner' },
  { id: 'gen', name: 'Gen', controlledBy: 'agent' },
  { id: 'mai', name: 'Mai', controlledBy: 'agent' },
];

/** Dựng sổ + bộ điều khiển; `kb` = kịch bản tai-nghe giả. */
function dung(kb, them = {}) {
  process.env.TAI_NGHE_KICH_BAN = kb;
  const fileGhi = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-giong-')), 'ghi.jsonl');
  process.env.TAI_NGHE_GHI = fileGhi;
  const so = new SoChatroom(null);
  so.datBridge(true);
  so.nhanDescribe({ actors: ACTORS });
  const log = [];
  const muc = [];
  let soLanVe = 0;
  const g = new DieuKhienGiong({
    so,
    layCfg: () => ({ root: GIA, pnpm: PNPM_GIA, bridgePort: CONG, sttPort: CONG_STT, taiNgheNguon: '', ...(them.cfg ?? {}) }),
    choPhep: them.choPhep ?? (async () => null),
    ve: () => soLanVe++,
    guiMuc: (r) => muc.push(r),
    ghi: (d) => log.push(d),
  });
  const docGhi = () =>
    fs.existsSync(fileGhi) ? fs.readFileSync(fileGhi, 'utf8').trim().split('\n').filter(Boolean).map((d) => JSON.parse(d)) : [];
  const theoDoiNhom = () => {
    if (g.pidDangChay) nhomPhaiDon.push(g.pidDangChay);
  };
  return { so, g, log, muc, docGhi, theoDoiNhom, soLanVe: () => soLanVe };
}
const argvCua = (docGhi) => docGhi().find((x) => x.argv)?.argv ?? [];
const giaTri = (argv, ten) => argv[argv.indexOf(ten) + 1];

/* ------------------------------------------------------------------ thuần */

test('lenhTaiNghe: MỘT chỗ cấu hình lệnh; giu = --im-lang-ms 0, bat-tat = 1200; nguon chỉ khi có; không --token trên argv', () => {
  const c = { pnpm: 'pnpm', bridgePort: CONG, sttPort: CONG_STT, taiNgheNguon: '' };
  const l = tn.lenhTaiNghe(c, 'gen', 'giu');
  assert.equal(l.cmd, 'pnpm');
  assert.deepEqual(l.args.slice(0, tn.CHAY_TAI_NGHE.length), [...tn.CHAY_TAI_NGHE]);
  assert.equal(giaTri(l.args, '--port'), String(CONG));
  assert.equal(giaTri(l.args, '--stt-port'), String(CONG_STT));
  assert.equal(giaTri(l.args, '--to'), 'gen');
  assert.equal(giaTri(l.args, '--im-lang-ms'), '0');
  assert.equal(giaTri(l.args, '--toi-da-ms'), '15000');
  // hạn STT/stage.hear khai MỘT chỗ (host) rồi truyền xuống → hạn cứng khớp
  assert.equal(giaTri(l.args, '--han-stt-ms'), String(tn.HAN_STT_MS));
  assert.equal(giaTri(l.args, '--han-hear-ms'), String(tn.HAN_HEAR_MS));
  assert.equal(tn.HAN_CUNG_MS, tn.TOI_DA_MS + tn.HAN_STT_MS + tn.HAN_HEAR_MS + tn.DU_HAN_MS);
  assert.ok(tn.HAN_CUNG_MS > tn.TOI_DA_MS + tn.HAN_STT_MS, 'hạn cứng phải dài hơn hạn STT');
  assert.ok(!l.args.includes('--nguon') && !l.args.includes('--token') && !l.args.includes('--khong-gui'));
  assert.deepEqual(tn.lenhTaiNghe(c, 'gen', 'giu', undefined).env, {});
  assert.deepEqual(tn.lenhTaiNghe(c, 'gen', 'giu', 'bi-mat').env, { GEN_STAGE_TOKEN: 'bi-mat' }, 'token chỉ qua env');
  assert.ok(!tn.lenhTaiNghe(c, 'gen', 'giu', 'bi-mat').args.includes('bi-mat'));
  const l2 = tn.lenhTaiNghe({ ...c, taiNgheNguon: 'alsa_input.usb-mic' }, 'mai', 'bat-tat');
  assert.equal(giaTri(l2.args, '--im-lang-ms'), '1200');
  assert.equal(giaTri(l2.args, '--nguon'), 'alsa_input.usb-mic');
});

test('lenhBridge: có sttPort thì bridge tự bật nghe /stt đúng cổng đó (GEN_STAGE_STT_PORT)', () => {
  const tt = require('../out/thuan/tien-trinh.js');
  assert.equal(tt.lenhBridge({ pnpm: 'pnpm', bridgePort: CONG, ttsPort: CONG + 2, sttPort: CONG_STT }).env.GEN_STAGE_STT_PORT, String(CONG_STT));
});

test('chuanNguonTaiNghe + MAC_DINH: rỗng = tự dò; "-…"/ký tự điều khiển bị bỏ kèm lý do', () => {
  assert.equal(ch.MAC_DINH.sttPort, 8790);
  assert.equal(ch.MAC_DINH.taiNgheNguon, '');
  assert.deepEqual(ch.chuanNguonTaiNghe(undefined), { nguon: '', loi: '' });
  assert.deepEqual(ch.chuanNguonTaiNghe('  mic-usb '), { nguon: 'mic-usb', loi: '' });
  for (const x of ['--khong-gui', '-x', 'a\nb', 'a\u0000']) {
    const r = ch.chuanNguonTaiNghe(x);
    assert.equal(r.nguon, '');
    assert.match(r.loi, /không hợp lệ/);
  }
});

test('docDongTaiNghe: đúng 6 sự kiện hợp đồng, kẹp số, dòng lạ = null', () => {
  assert.deepEqual(tn.docDongTaiNghe('{"su":"bat-dau"}'), { su: 'bat-dau' });
  assert.deepEqual(tn.docDongTaiNghe('{"su":"muc","rms":3}'), { su: 'muc', rms: 1 });
  assert.deepEqual(tn.docDongTaiNghe('{"su":"ket-qua","text":"a","confidence":0.7,"durationMs":5,"goiGen":true,"daGui":true}'), {
    su: 'ket-qua', text: 'a', confidence: 0.7, durationMs: 5, goiGen: true, daGui: true,
  });
  assert.deepEqual(tn.docDongTaiNghe('{"su":"bo-qua","lyDo":"im-lang"}'), { su: 'bo-qua', lyDo: 'im-lang' });
  assert.deepEqual(tn.docDongTaiNghe('{"su":"loi","ma":"thiet-bi","chu":"x"}'), { su: 'loi', ma: 'thiet-bi', chu: 'x', khongRo: false });
  for (const d of ['', 'xin chào', '[1]', 'null', '{"su":"la"}']) assert.equal(tn.docDongTaiNghe(d), null);
  assert.equal(lg.maLoiTuMaThoat(2), 'thiet-bi');
  assert.equal(lg.maLoiTuMaThoat(64), 'tham-so');
  assert.match(lg.chuLoi('thiet-bi', '', { bridgePort: 1, sttPort: 2 }).goiY, /ffmpeg\/PipeWire/);
});

/* ------------------------------------------------------- với tai-nghe giả */

test('giữ-để-nói: --to = nhân vật đang chọn (INT-02), --im-lang-ms 0, thả = `dung` vào stdin, kết quả daGui → về nghỉ', async () => {
  const t = dung('giu');
  t.so.chonNhanVat('mai');
  // đi qua đúng đường webview → host
  await xuLyTinChatroom({ loai: 'micGiu' }, t.so, { goi: async () => ({ ok: true }) }, () => undefined, t.g);
  assert.equal(t.so.giong.pha, 'khoi-dong');
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'), t.log.join('\n'));
  t.theoDoiNhom();
  assert.equal(t.so.giong.toi, 'mai');
  assert.ok(await cho(() => t.muc.length >= 3), 'vạch mức nhận `muc`');
  // giữ nữa cũng không bật thêm (một lần thu tại một thời điểm)
  t.g.giu();
  await xuLyTinChatroom({ loai: 'micTha' }, t.so, { goi: async () => ({ ok: true }) }, () => undefined, t.g);
  assert.ok(await cho(() => t.so.giong.pha === 'nghi' && !t.g.dangThu), `pha ${t.so.giong.pha}\n${t.log.join('\n')}`);
  const argv = argvCua(t.docGhi);
  assert.equal(giaTri(argv, '--to'), 'mai');
  assert.equal(giaTri(argv, '--port'), String(CONG));
  assert.equal(giaTri(argv, '--stt-port'), String(CONG_STT));
  assert.equal(giaTri(argv, '--im-lang-ms'), '0');
  assert.deepEqual(t.docGhi().filter((x) => 'stdin' in x).map((x) => x.stdin), ['dung']);
  assert.equal(t.docGhi().filter((x) => x.argv).length, 1, 'chỉ một tiến trình');
  const hear = bridge.lenh.filter((l) => l.cmd === 'stage.hear').at(-1);
  assert.equal(hear.args.to, 'mai', 'tai-nghe tự gửi stage.hear tới đúng người nghe');
  assert.ok(t.log.some((d) => /đã gửi stage\.hear/.test(d)));
});

test('phím bật/tắt (genStage.noi): lần 1 thu có VAD (--im-lang-ms 1200), VAD tự dừng; lần 2 khi đang thu = `dung`', async () => {
  const t = dung('vad');
  t.g.batTat();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  t.theoDoiNhom();
  assert.match(t.so.giong.chu, /im 1,2 s/);
  assert.ok(await cho(() => t.so.giong.pha === 'nghi' && !t.g.dangThu), 'VAD giả tự dừng → kết quả');
  assert.equal(giaTri(argvCua(t.docGhi), '--im-lang-ms'), '1200');
  assert.equal(giaTri(argvCua(t.docGhi), '--to'), 'gen', 'chưa chọn ai → agent đầu tiên');

  const t2 = dung('giu');
  t2.g.batTat();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  t2.theoDoiNhom();
  t2.g.tha(); // thả nút không dừng lần thu bằng phím
  await doi(200);
  assert.equal(t2.so.giong.pha, 'nghe');
  t2.g.batTat();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghi' && !t2.g.dangThu));
  assert.deepEqual(t2.docGhi().filter((x) => 'stdin' in x).map((x) => x.stdin), ['dung']);
});

test('daGui:false → chờ xác nhận; Gửi = stage.hear qua ws hiện có với text ĐÃ SỬA + to lúc thu + confidence', async () => {
  const t = dung('thap');
  t.so.chonNhanVat('gen');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  t.theoDoiNhom();
  t.g.tha();
  assert.ok(await cho(() => t.so.giong.pha === 'cho-xac-nhan'), t.log.join('\n'));
  const mh = t.so.moHinh().giong;
  assert.equal(mh.cau.text, 'ghen ơi mở màng hình');
  assert.equal(mh.cau.to, 'gen');
  assert.ok(mh.cau.id > 0);
  assert.match(mh.chu, /41 %/);
  // Sếp đổi lựa chọn sau khi nói — câu vẫn tới người nghe lúc thu
  t.so.chonNhanVat('mai');

  const cauNoi = new CauNoi({ url: `ws://127.0.0.1:${CONG}/` });
  cauNoi.bat();
  assert.ok(await cho(() => cauNoi.noi));
  const truoc = bridge.lenh.length;
  await xuLyTinChatroom({ loai: 'giongGui', text: '  Gen ơi mở màn hình ' }, t.so, cauNoi, () => undefined, t.g);
  const hear = bridge.lenh.slice(truoc).filter((l) => l.cmd === 'stage.hear');
  assert.equal(hear.length, 1);
  assert.deepEqual(hear[0].args, { text: 'Gen ơi mở màn hình', to: 'gen', confidence: 0.41, durationMs: 400 });
  assert.equal(t.so.giong.pha, 'nghi');
  // gửi lại sau khi đã gửi → không có gì
  await xuLyTinChatroom({ loai: 'giongGui', text: 'x' }, t.so, cauNoi, () => undefined, t.g);
  assert.equal(bridge.lenh.slice(truoc).filter((l) => l.cmd === 'stage.hear').length, 1);
  cauNoi.tat();

  // nhánh Bỏ
  const t2 = dung('thap');
  t2.g.giu();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  t2.theoDoiNhom();
  t2.g.tha();
  assert.ok(await cho(() => t2.so.giong.pha === 'cho-xac-nhan'));
  const truoc2 = bridge.lenh.length;
  await xuLyTinChatroom({ loai: 'giongBo' }, t2.so, { goi: async () => assert.fail('Bỏ không được gửi gì') }, () => undefined, t2.g);
  assert.equal(t2.so.giong.pha, 'nghi');
  assert.equal(t2.so.giong.cau, null);
  assert.equal(bridge.lenh.length, truoc2);
});

test('bo-qua gen-dang-noi từ tai-nghe → hiện lý do tiếng Việt', async () => {
  const t = dung('gen-noi');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'bo-qua' && !t.g.dangThu));
  assert.match(t.so.giong.chu, /nhân vật đang nói/);
  assert.match(t.so.moHinh().giong.chu, /bán song công/);
});

test('lỗi thiết bị: `loi thiet-bi` + mã 2 → chữ lỗi + gợi ý ffmpeg/PipeWire; mã 2 không kịp in gì cũng ra lỗi thiết bị', async () => {
  const t = dung('thiet-bi');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'loi' && !t.g.dangThu), t.log.join('\n'));
  assert.match(t.so.giong.chu, /Lỗi micro: không mở được nguồn thu/);
  assert.match(t.so.giong.goiY, /ffmpeg\/PipeWire/);
  assert.ok(t.log.some((d) => /thoát \(mã 2\)/.test(d)), t.log.join('\n'));

  const t2 = dung('chet2');
  t2.g.batTat();
  assert.ok(await cho(() => t2.so.giong.pha === 'loi' && !t2.g.dangThu));
  assert.match(t2.so.giong.chu, /Lỗi micro/);
  assert.match(t2.so.giong.goiY, /ffmpeg\/PipeWire/);
});

test('nút 🎤 vô hiệu khi nhân vật agent đang nói (sayStart → sayDone); owner nói không chặn; phím lúc đó = bỏ qua, không spawn', async () => {
  const t = dung('giu');
  assert.equal(t.so.moHinh().giong.nutDuoc, true);
  t.so.nhanSuKien('actor.sayStart', { actor: 'owner', text: 'chào' });
  assert.equal(t.so.moHinh().giong.nutDuoc, true, 'câu của chính Sếp không chặn mic');
  t.so.nhanSuKien('actor.sayStart', { actor: 'gen', text: 'Dạ' });
  let g = t.so.moHinh().giong;
  assert.equal(g.nutDuoc, false);
  assert.match(g.nutLyDo, /Gen đang nói/);
  assert.deepEqual(g.dangNoi, ['gen']);
  t.g.batTat();
  assert.equal(t.so.giong.pha, 'bo-qua');
  assert.equal(t.g.dangThu, false);
  await doi(150);
  assert.deepEqual(t.docGhi(), [], 'không spawn tai-nghe');
  t.so.nhanSuKien('actor.sayDone', { actor: 'gen', text: 'Dạ' });
  g = t.so.moHinh().giong;
  assert.equal(g.nutDuoc, true);
  // mất bridge cũng xoá cờ đang nói (không kẹt nút)
  t.so.nhanSuKien('actor.sayStart', { actor: 'gen', text: 'Dạ' });
  t.so.datBridge(false);
  assert.equal(t.so.moHinh().giong.nutDuoc, false);
  assert.match(t.so.moHinh().giong.nutLyDo, /Chưa nối bridge/);
  t.so.datBridge(true);
  assert.equal(t.so.moHinh().giong.nutDuoc, true);
  // đang thu thì nút LUÔN bấm được (để thả)
  assert.deepEqual(lg.nutMic({ bridgeNoi: false, nhanVat: [], dangChon: null }, { ...lg.GIONG_NGHI, pha: 'nghe' }, ['gen']).nutDuoc, true);
});

test('huỷ = dòng `huy` vào stdin: tai-nghe tự thoát, không stage.hear; lý do "huy" có chữ tiếng Việt', async () => {
  const t = dung('giu');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  const pid = t.g.pidDangChay;
  nhomPhaiDon.push(pid);
  const truoc = bridge.lenh.length;
  const t0 = Date.now();
  await t.g.huy('đóng chatroom');
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `tự thoát nhờ \`huy\` (${ms} ms), không phải SIGKILL sau 2 s`);
  assert.deepEqual(t.docGhi().filter((x) => 'stdin' in x).map((x) => x.stdin), ['huy']);
  assert.ok(t.docGhi().some((x) => x.thoat === 'huy'));
  assert.equal(bridge.lenh.length, truoc, 'không stage.hear');
  assert.equal(t.so.giong.pha, 'nghi');
  assert.match(t.so.giong.chu, /Đã huỷ lần thu \(đóng chatroom\)/);
  assert.equal(t.g.conTienTrinh, false);
  assert.ok(!song(pid));
  assert.match(lg.chuBoQua('huy'), /Đã huỷ lần thu/);
});

test('token: GEN_STAGE_TOKEN của host tới tai-nghe qua env, không qua argv', async () => {
  process.env.GEN_STAGE_TOKEN = 'tk-v2-thu';
  try {
    const t = dung('vad');
    t.g.batTat();
    assert.ok(await cho(() => t.so.giong.pha === 'nghi' && !t.g.dangThu && t.docGhi().some((x) => 'token' in x)));
    assert.equal(t.docGhi().find((x) => 'token' in x).token, 'tk-v2-thu');
    assert.ok(!argvCua(t.docGhi).some((a) => a.includes('tk-v2-thu')) && !argvCua(t.docGhi).includes('--token'));
  } finally {
    delete process.env.GEN_STAGE_TOKEN;
  }
});

test('huỷ (deactivate/đóng chatroom) với tai-nghe lờ `huy`: sau 2 s SIGKILL CẢ NHÓM — kể cả "ffmpeg" con lờ SIGTERM; epTat = SIGKILL ngay', async () => {
  const t = dung('treo');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  const pgid = t.g.pidDangChay;
  nhomPhaiDon.push(pgid);
  assert.ok(await cho(() => t.docGhi().some((x) => x.ffmpegGia)));
  const ffmpeg = t.docGhi().find((x) => x.ffmpegGia).ffmpegGia;
  const nodeGia = t.docGhi().find((x) => x.argv).pid;
  assert.ok(song(pgid) && song(ffmpeg) && song(nodeGia));
  t.g.tha(); // `dung` bị lờ — tiến trình vẫn sống
  await doi(200);
  assert.ok(song(ffmpeg));
  const t0 = Date.now();
  const xong = t.g.huy('đóng chatroom');
  assert.equal(t.g.dangThu, false);
  assert.equal(t.g.conTienTrinh, true, 'đang chờ tự thoát sau `huy`');
  assert.match(t.so.giong.chu, /Đã huỷ lần thu \(đóng chatroom\)/);
  await doi(1000);
  assert.ok(song(ffmpeg) && song(nodeGia), 'chưa tới hạn 2 s thì chưa giết');
  await xong;
  const ms = Date.now() - t0;
  assert.ok(ms >= 1900 && ms < 4000, `SIGKILL sau hạn huỷ (${ms} ms)`);
  assert.deepEqual(t.docGhi().filter((x) => 'stdin' in x).map((x) => x.stdin), ['dung', 'huy']);
  assert.ok(await cho(() => !song(pgid) && !song(ffmpeg) && !song(nodeGia), 2000), 'cả nhóm đã chết');
  // nhóm chỉ còn zombie (nếu có) — không ai còn chạy
  assert.ok(t.log.some((d) => /không thoát sau `huy`.*SIGKILL nhóm/.test(d)), t.log.join('\n'));
  assert.equal(t.g.conTienTrinh, false);

  // deactivate: huy() rồi epTat() — SIGKILL ngay, không chờ 2 s
  const t2 = dung('treo');
  t2.g.giu();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  const pg2 = t2.g.pidDangChay;
  nhomPhaiDon.push(pg2);
  assert.ok(await cho(() => t2.docGhi().some((x) => x.ffmpegGia)));
  const ff2 = t2.docGhi().find((x) => x.ffmpegGia).ffmpegGia;
  const t1 = Date.now();
  void t2.g.huy('extension tắt');
  t2.g.epTat();
  assert.ok(await cho(() => !song(pg2) && !song(ff2), 1500), 'epTat giết ngay');
  assert.ok(Date.now() - t1 < 1500);
});

test('huyNeuGiu: chatroom ẩn giữa lúc GIỮ nút → huỷ; lần thu bằng phím thì để yên', async () => {
  const t = dung('giu');
  t.g.batTat();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  t.theoDoiNhom();
  t.g.huyNeuGiu('chatroom bị ẩn');
  assert.equal(t.g.dangThu, true);
  await t.g.huy('dọn test');
  const t2 = dung('giu');
  t2.g.giu();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  const pid = t2.g.pidDangChay;
  nhomPhaiDon.push(pid);
  t2.g.huyNeuGiu('chatroom bị ẩn');
  assert.equal(t2.g.dangThu, false);
  assert.ok(await cho(() => !song(pid), 3000));
});

test('cổng an toàn: chưa được phép (trust/root) → lỗi, không spawn; thả nút khi còn chờ cho phép → không spawn; thiếu scripts/tai-nghe.mjs → lỗi rõ', async () => {
  const t = dung('giu', { choPhep: async () => 'Workspace chưa được tin cậy (Restricted Mode)' });
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'loi'));
  assert.match(t.so.giong.chu, /Restricted Mode/);
  assert.deepEqual(t.docGhi(), []);

  let moKhoa;
  const t2 = dung('giu', { choPhep: () => new Promise((r) => { moKhoa = r; }) });
  t2.g.giu();
  assert.equal(t2.so.giong.pha, 'khoi-dong');
  t2.g.tha();
  moKhoa(null);
  assert.ok(await cho(() => t2.so.giong.pha === 'nghi' && !t2.g.dangThu));
  await doi(150);
  assert.deepEqual(t2.docGhi(), []);

  const rong = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-giong-root-'));
  const t3 = dung('giu', { cfg: { root: rong } });
  t3.g.giu();
  assert.ok(await cho(() => t3.so.giong.pha === 'loi'));
  assert.match(t3.so.giong.chu, /chưa có scripts\/tai-nghe\.mjs/);

  const t4 = dung('giu', { cfg: { pnpm: './pnpm' } });
  t4.g.giu();
  assert.ok(await cho(() => t4.so.giong.pha === 'loi'));
  assert.match(t4.so.giong.chu, /genStage\.pnpm/);
});

test('hợp đồng bổ sung: stage.hear hỏng (ket-qua daGui:false rồi loi bridge mã 4) → GIỮ câu ở ô xác nhận để gửi lại; mã 130 = huỷ; tham-so mã 64 → gợi ý Node ≥ 22.18', async () => {
  const t = dung('hear-loi');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  t.theoDoiNhom();
  t.g.tha();
  assert.ok(await cho(() => !t.g.dangThu), t.log.join('\n'));
  const g = t.so.moHinh().giong;
  assert.equal(g.pha, 'cho-xac-nhan', 'câu vẫn nằm ở ô xác nhận');
  assert.equal(g.cau.text, 'Gen ơi, chào em');
  assert.equal(g.cau.to, 'gen');
  assert.match(g.chu, /Chưa gửi được \(Lỗi nối bridge: stage\.hear/);
  assert.match(g.goiY, new RegExp(`cổng ${CONG}`));
  // Gửi lại qua ws của extension
  const goi = [];
  await xuLyTinChatroom({ loai: 'giongGui', text: g.cau.text }, t.so, { goi: async (cmd, args) => (goi.push({ cmd, args }), { ok: true }) }, () => undefined, t.g);
  assert.deepEqual(goi, [{ cmd: 'stage.hear', args: { text: 'Gen ơi, chào em', to: 'gen', confidence: 0.9, durationMs: 400 } }]);
  assert.equal(t.so.giong.pha, 'nghi');

  const t2 = dung('thoat130');
  t2.g.giu();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  t2.theoDoiNhom();
  t2.g.tha();
  assert.ok(await cho(() => !t2.g.dangThu));
  assert.equal(t2.so.giong.pha, 'nghi');
  assert.match(t2.so.giong.chu, /Đã huỷ lần thu/);

  const t3 = dung('tham-so');
  t3.g.giu();
  assert.ok(await cho(() => t3.so.giong.pha === 'loi' && !t3.g.dangThu));
  assert.match(t3.so.giong.chu, /cần Node ≥ 22\.18 \(đang v20/);
  assert.match(t3.so.giong.goiY, /Node ≥ 22\.18/);
});

test('loi bridge khongRo: tai-nghe báo "không rõ" → ô xác nhận ghi cảnh báo; khongRo:false thì chữ cũ', async () => {
  assert.equal(tn.docDongTaiNghe('{"su":"loi","ma":"bridge","chu":"x","khongRo":true}').khongRo, true);
  assert.equal(tn.docDongTaiNghe('{"su":"loi","ma":"bridge","chu":"x"}').khongRo, false);
  const t = dung('hear-khong-ro');
  t.g.giu();
  assert.ok(await cho(() => t.so.giong.pha === 'nghe'));
  t.theoDoiNhom();
  t.g.tha();
  assert.ok(await cho(() => !t.g.dangThu), t.log.join('\n'));
  const g = t.so.moHinh().giong;
  assert.equal(g.pha, 'cho-xac-nhan');
  assert.match(g.chu, /Có thể Gen đã nhận câu này — xem chat trước khi gửi lại/);
  // hear-loi (chắc chắn chưa chạy) KHÔNG có cảnh báo
  const t2 = dung('hear-loi');
  t2.g.giu();
  assert.ok(await cho(() => t2.so.giong.pha === 'nghe'));
  t2.theoDoiNhom();
  t2.g.tha();
  assert.ok(await cho(() => !t2.g.dangThu));
  assert.doesNotMatch(t2.so.giong.chu, /Có thể Gen đã nhận/);
});

test('gửi lại: user.text cùng to|text (chuẩn hoá) trong cửa sổ ⇒ KHÔNG gửi, báo đã nhận; khác câu / quá cửa sổ / khác người ⇒ gửi', async () => {
  const cau = { text: 'Gen ơi, chào em', to: 'gen', confidence: 0.9, durationMs: 400 };
  const thu = async (mo) => {
    const so = new SoChatroom(null);
    so.nhanDescribe({ actors: ACTORS });
    so.datGiong({ pha: 'cho-xac-nhan', toi: 'gen', chu: 'x', cau });
    mo(so);
    const goi = [];
    await xuLyTinChatroom({ loai: 'giongGui', text: '  Gen ơi,   chào em. ' }, so, { goi: async (cmd, args) => (goi.push({ cmd, args }), { ok: true }) }, () => undefined);
    return { so, goi };
  };
  const now = Date.now();
  let r = await thu((so) => so.nhanSuKien('user.text', { actor: 'owner', to: 'gen', text: 'Gen ơi, chào em' }, now - 5000));
  assert.deepEqual(r.goi, [], 'đã nhận rồi thì không gửi');
  assert.equal(r.so.giong.pha, 'nghi');
  assert.match(r.so.giong.chu, /đã nhận câu này rồi/);
  // chỉ có user.speech (mic) cũng tính
  r = await thu((so) => so.nhanSuKien('user.speech', { actor: 'owner', to: 'gen', text: 'Gen ơi, chào em' }, now - 1000));
  assert.deepEqual(r.goi, []);
  r = await thu((so) => so.nhanSuKien('user.text', { actor: 'owner', to: 'gen', text: 'Gen ơi, chào em' }, now - 120_000));
  assert.equal(r.goi.length, 1, 'quá cửa sổ → gửi');
  r = await thu((so) => so.nhanSuKien('user.text', { actor: 'owner', to: 'mai', text: 'Gen ơi, chào em' }, now - 1000));
  assert.equal(r.goi.length, 1, 'người nhận khác → gửi');
  r = await thu((so) => so.nhanSuKien('user.text', { actor: 'owner', to: 'gen', text: 'câu khác hẳn' }, now - 1000));
  assert.equal(r.goi.length, 1, 'câu khác → gửi');
});

test('hạn cứng của host: chạm hạn → "Quá hạn — nhận dạng chậm", KHÔNG phải "bỏ qua (huỷ)"; tai-nghe bị huỷ thật', async () => {
  const t = dung('giu');
  // dựng lại với hanCungMs nhỏ
  process.env.TAI_NGHE_KICH_BAN = 'giu';
  const so = t.so;
  const g = new DieuKhienGiong({
    so,
    layCfg: () => ({ root: GIA, pnpm: PNPM_GIA, bridgePort: CONG, sttPort: CONG_STT, taiNgheNguon: '' }),
    choPhep: async () => null,
    ve: () => undefined,
    ghi: (d) => t.log.push(d),
    hanCungMs: 600,
  });
  g.giu();
  assert.ok(await cho(() => so.giong.pha === 'nghe'));
  const pid = g.pidDangChay;
  nhomPhaiDon.push(pid);
  assert.ok(await cho(() => so.giong.pha === 'loi' && !g.conTienTrinh, 8000), JSON.stringify(so.giong) + t.log.join('\n'));
  assert.match(so.giong.chu, /Quá hạn — nhận dạng chậm \(lần đầu PhoWhisper đang nạp\?\)/);
  assert.doesNotMatch(so.giong.chu, /huỷ|Bỏ qua/);
  assert.ok(await cho(() => !song(pid)), 'tiến trình đã chết');
});

test('choPhep nhận ngữ cảnh "giong" khi bấm 🎤; thả nút khi còn chờ modal → hướng dẫn bấm giữ lại', async () => {
  let boiCanh;
  let mo;
  const t = dung('giu', {
    choPhep: (b) => {
      boiCanh = b;
      return new Promise((r) => { mo = () => r(null); });
    },
  });
  t.g.giu();
  assert.ok(await cho(() => boiCanh !== undefined));
  assert.equal(boiCanh, 'giong');
  t.g.tha();
  mo();
  assert.ok(await cho(() => !t.g.dangThu));
  assert.match(t.so.giong.chu, /Bấm giữ 🎤 lại sau khi xác nhận/);
  assert.equal(t.docGhi().length, 0, 'không spawn');
});
