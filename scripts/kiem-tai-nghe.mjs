/**
 * kiem-tai-nghe.mjs — BẰNG CHỨNG V2 (tai nghe): bridge THẬT (`tsx bridge/server.ts`,
 * bật token) + sân khấu GIẢ (ws `?role=stage&token=`) + STT GIẢ (HTTP, kịch bản) +
 * `node scripts/tai-nghe.mjs` THẬT (tiến trình riêng, đúng như extension gọi), ffmpeg
 * thật đọc wav sinh bằng lavfi làm "mic" (`-re`, tốc độ thật).
 *
 * Ca: (a) nói xong im → tự dừng → STT → stage.hear đúng `to` → daGui:true ·
 *     (b) tin cậy 0,4 → daGui:false · (c) Gen đang speaking → bo-qua, không STT ·
 *     (d) actor.sayStart gen giữa lúc thu (đi qua bridge thật) → dừng, bo-qua, không STT ·
 *     (e) stdin "dung" · (f) chạm --toi-da-ms · (g) STT tắt → mã 4 ·
 *     (h) nguồn sai → mã 2 · (i) chỉ im lặng → bo-qua im-lang.
 * Ghi: docs/v2/nhat-ky-kiem-tai-nghe.json
 *
 * Cổng gốc `GEN_STAGE_KIEM_CONG_TAI` (mặc định 8924) +0…+5 — mặc định 8924–8929
 * (KHÔNG đụng 8787–8790 của Sếp; 8920–8923 là của vitest tai-nghe):
 *   8924 ws bridge · 8925 TTS · 8926 MCP · 8927 STT của bridge (không dùng) · 8928 STT giả · 8929 bỏ trống (STT tắt)
 * Bridge spawn `detached`, giết bằng PGID (tsx sinh thêm node con — bài học #37).
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C = Number(process.env.GEN_STAGE_KIEM_CONG_TAI ?? 8924);
const C_BRIDGE = C;
const C_STT_GIA = C + 4;
const C_STT_TAT = C + 5;
const TOKEN = 'kiem-tai-nghe';
const RA = resolve(GOC, 'docs/v2/nhat-ky-kiem-tai-nghe.json');
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const ketQua = [];
const loi = [];
const kiem = (ten, dk, chiTiet = {}) => {
  console.log(`${dk ? 'OK  ' : 'FAIL'} ${ten}`);
  ketQua.push({ ten, ok: !!dk, ...chiTiet });
  if (!dk) loi.push(ten);
};

/* ------------------------------------------------------------- wav "mic" */
const TMP = mkdtempSync(join(tmpdir(), 'kiem-tai-nghe-'));
function sinhWav(ten, doan) {
  const vao = [];
  for (const [loai, s] of doan)
    vao.push('-f', 'lavfi', '-i', loai === 'to' ? `sine=f=330:r=16000:d=${s}` : `anullsrc=r=16000:cl=mono:d=${s}`);
  const ra = join(TMP, ten);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...vao, '-filter_complex', `${doan.map((_, i) => `[${i}]`).join('')}concat=n=${doan.length}:v=0:a=1`, '-ac', '1', '-ar', '16000', ra]);
  return ra;
}
const WAV = {
  noi: sinhWav('noi.wav', [['im', 0.5], ['to', 1.2], ['im', 2.5]]),
  dai: sinhWav('dai.wav', [['im', 0.3], ['to', 4.0]]),
  im: sinhWav('im.wav', [['im', 1.5]]),
};

/* --------------------------------------------------------------- STT giả */
const stt = { yeuCau: [], traLoi: null };
const svStt = createServer((req, res) => {
  const manh = [];
  req.on('data', (d) => manh.push(d));
  req.on('end', () => {
    const than = Buffer.concat(manh);
    stt.yeuCau.push({ t: Date.now(), url: req.url, contentType: req.headers['content-type'], byte: than.length, audioMs: Math.round((than.length - 44) / 32) });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(stt.traLoi));
  });
});

/* -------------------------------------------------------- sân khấu giả */
const san = { ws: null, lenh: [], actors: [] };
const RANH = [
  { id: 'owner', controlledBy: 'owner', state: 'idle' },
  { id: 'gen', controlledBy: 'agent', state: 'idle' },
];
function noiSanKhau() {
  return new Promise((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:${C_BRIDGE}/?role=stage&token=${TOKEN}`);
    w.on('open', () => res(w));
    w.on('error', rej);
    w.on('message', (tho) => {
      const g = JSON.parse(String(tho));
      if (!g.cmd) return;
      san.lenh.push({ t: Date.now(), cmd: g.cmd, args: g.args ?? {} });
      if (g.cmd === 'stage.describe') return w.send(JSON.stringify({ id: g.id, ok: true, result: { actors: san.actors } }));
      if (g.cmd === 'stage.hear') {
        w.send(JSON.stringify({ id: g.id, ok: true, result: { heard: true, actor: 'owner', text: g.args.text } }));
        // như sân khấu thật: actor.say owner → user.text + user.speech
        for (const ev of ['user.text', 'user.speech'])
          w.send(JSON.stringify({ event: ev, data: { actor: 'owner', text: g.args.text, to: g.args.to }, t: Date.now() }));
        return;
      }
      w.send(JSON.stringify({ id: g.id, ok: true, result: {} }));
    });
  });
}
const sanPhat = (event, data) => san.ws.send(JSON.stringify({ event, data, t: Date.now() }));

/* ----------------------------------------------------------- tai-nghe thật */
function taiNghe(them, { khiBatDau } = {}) {
  return new Promise((giai) => {
    const t0 = Date.now();
    const args = ['scripts/tai-nghe.mjs', '--port', String(C_BRIDGE), '--stt-port', String(C_STT_GIA), '--to', 'gen', '--token', TOKEN, ...them];
    const con = spawn(process.execPath, args, { cwd: GOC, stdio: ['pipe', 'pipe', 'pipe'] });
    const su = [];
    const stderr = [];
    let du = '';
    con.stdout.on('data', (d) => {
      du += d;
      let i;
      while ((i = du.indexOf('\n')) >= 0) {
        const g = JSON.parse(du.slice(0, i));
        du = du.slice(i + 1);
        su.push({ ...g, tMs: Date.now() - t0 });
        if (g.su === 'bat-dau') khiBatDau?.(con);
      }
    });
    con.stderr.on('data', (d) => stderr.push(...String(d).split('\n').filter(Boolean)));
    con.on('close', (ma) => {
      const muc = su.filter((x) => x.su === 'muc');
      giai({
        lenh: `node ${args.join(' ')}`,
        maThoat: ma,
        tongMs: Date.now() - t0,
        // vạch mic tóm gọn: số lần + đỉnh + nhịp ngắn nhất (hợp đồng ≤ 10 lần/s)
        muc: muc.length
          ? { soLan: muc.length, dinh: Math.max(...muc.map((x) => x.rms)), nhipNganNhatMs: Math.min(...muc.slice(1).map((x, i) => x.tMs - muc[i].tMs)) }
          : null,
        suKien: su.filter((x) => x.su !== 'muc'),
        stderr,
      });
    });
  });
}

async function ca(ma, moTa, { actors = RANH, traLoi, them, khiBatDau }) {
  san.actors = actors;
  san.lenh = [];
  stt.yeuCau = [];
  stt.traLoi = traLoi ?? { text: 'Gen ơi, dựng connector Baserow', confidence: 0.91, durationMs: 412, goiGen: true };
  const r = await taiNghe(them, { khiBatDau });
  await ngu(150); // để sự kiện user.* (nếu có) về hết
  const out = { ca: ma, moTa, ...r, lenhSanKhauNhan: san.lenh.map((l) => ({ cmd: l.cmd, args: l.args })), sttNhan: stt.yeuCau };
  nhatKy.ca[ma] = out;
  return out;
}

/* ------------------------------------------------------------------ chạy */
const nhatKy = { batDau: new Date().toISOString(), node: process.version, cong: { bridge: C_BRIDGE, sttGia: C_STT_GIA, sttTat: C_STT_TAT }, ca: {} };
let bridge = null;
const bridgeLog = [];
try {
  await new Promise((r) => svStt.listen(C_STT_GIA, '127.0.0.1', r));
  bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
    cwd: GOC,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GEN_STAGE_PORT: String(C_BRIDGE),
      GEN_STAGE_TTS_PORT: String(C + 1),
      GEN_STAGE_MCP_PORT: String(C + 2),
      GEN_STAGE_STT_PORT: String(C + 3),
      GEN_STAGE_TOKEN: TOKEN,
    },
  });
  nhatKy.pgidBridge = bridge.pid;
  for (const s of [bridge.stdout, bridge.stderr]) s.on('data', (d) => bridgeLog.push(...String(d).split('\n').filter(Boolean)));
  for (let i = 0; i < 60 && !san.ws; i++) {
    try {
      san.ws = await noiSanKhau();
    } catch {
      await ngu(250);
    }
  }
  if (!san.ws) throw new Error('không nối được bridge thật');
  await ngu(300);

  let r = await ca('a', 'nói 1,2 s rồi im → VAD tự dừng → STT → stage.hear to=gen', { them: ['--nguon', WAV.noi, '--im-lang-ms', '800'] });
  const kqA = r.suKien.at(-1);
  kiem('(a) ket-qua daGui:true', r.maThoat === 0 && kqA.su === 'ket-qua' && kqA.daGui === true, { kq: kqA });
  kiem('(a) tự dừng bằng VAD (không đọc hết file 4,2 s)', r.stderr.some((l) => /tự dừng/.test(l)) && r.tongMs < 4000, { tongMs: r.tongMs });
  kiem('(a) stage.hear qua bridge thật đúng to/text/confidence/durationMs', JSON.stringify(r.lenhSanKhauNhan.at(-1)) === JSON.stringify({ cmd: 'stage.hear', args: { text: 'Gen ơi, dựng connector Baserow', to: 'gen', confidence: 0.91, durationMs: 412 } }));
  kiem('(a) STT nhận wav đã cắt im lặng (1,2 s tiếng + lề ≤ 240 ms)', r.sttNhan.length === 1 && r.sttNhan[0].audioMs >= 1200 && r.sttNhan[0].audioMs <= 1450, { sttNhan: r.sttNhan });
  kiem('(a) vạch mic ≤ 10 lần/s', r.muc && r.muc.nhipNganNhatMs >= 90 && r.muc.dinh > 0.05, { muc: r.muc });

  r = await ca('b', 'tin cậy 0,4 → không tự gửi', { them: ['--nguon', WAV.noi, '--im-lang-ms', '800'], traLoi: { text: 'ờ thì', confidence: 0.4, durationMs: 300, goiGen: false } });
  kiem('(b) daGui:false, sân khấu không nhận stage.hear', r.maThoat === 0 && r.suKien.at(-1).daGui === false && !r.lenhSanKhauNhan.some((l) => l.cmd === 'stage.hear'));

  r = await ca('c', 'Gen đang speaking lúc bắt đầu', { them: ['--nguon', WAV.noi], actors: [RANH[0], { id: 'gen', controlledBy: 'agent', state: 'speaking' }] });
  kiem('(c) bo-qua gen-dang-noi, không mở mic, không gọi STT', r.maThoat === 0 && r.suKien.length === 1 && r.suKien[0].lyDo === 'gen-dang-noi' && r.sttNhan.length === 0);

  let tSay = 0;
  r = await ca('d', 'actor.sayStart của gen (sân khấu → bridge thật → tai-nghe) giữa lúc thu', {
    them: ['--nguon', WAV.dai, '--im-lang-ms', '0'],
    khiBatDau: () =>
      setTimeout(() => {
        tSay = Date.now();
        sanPhat('actor.sayStart', { actor: 'gen', text: 'Dạ Sếp' });
      }, 800),
  });
  const kqD = r.suKien.at(-1);
  kiem('(d) dừng ngay, bo-qua gen-dang-noi, không gọi STT', r.maThoat === 0 && kqD.lyDo === 'gen-dang-noi' && r.sttNhan.length === 0 && r.tongMs < 3000, { tongMs: r.tongMs, treDungMs: Date.now() - tSay });

  r = await ca('e', 'stdin "dung" (VAD tắt)', { them: ['--nguon', WAV.dai, '--im-lang-ms', '0'], khiBatDau: (con) => setTimeout(() => con.stdin.write('dung\n'), 1500) });
  kiem('(e) stdin dung → dừng tay rồi nhận dạng', r.maThoat === 0 && r.suKien.at(-1).su === 'ket-qua' && r.stderr.some((l) => /stdin — dừng thu/.test(l)) && r.tongMs < 3500);

  r = await ca('f', 'chạm --toi-da-ms 1500', { them: ['--nguon', WAV.dai, '--im-lang-ms', '0', '--toi-da-ms', '1500'] });
  kiem('(f) toi-da-ms', r.maThoat === 0 && r.suKien.at(-1).su === 'ket-qua' && r.stderr.some((l) => /chạm --toi-da-ms 1500/.test(l)));

  r = await ca('g', 'STT tắt', { them: ['--nguon', WAV.noi, '--im-lang-ms', '800', '--stt-port', String(C_STT_TAT)] });
  kiem('(g) loi stt, mã 4', r.maThoat === 4 && r.suKien.at(-1).ma === 'stt');

  r = await ca('h', 'nguồn sai', { them: ['--nguon', '/khong/co/mic.wav'] });
  const r2 = await ca('h2', 'thiết bị không có (pulse → alsa đều hỏng)', { them: ['--nguon', 'khong-co-mic-nay'] });
  kiem('(h) loi thiet-bi, mã 2 (file thiếu + thiết bị thiếu)', r.maThoat === 2 && r.suKien.at(-1).ma === 'thiet-bi' && r2.maThoat === 2 && r2.suKien.at(-1).ma === 'thiet-bi');

  r = await ca('i', 'chỉ im lặng', { them: ['--nguon', WAV.im, '--im-lang-ms', '800'] });
  kiem('(i) bo-qua im-lang, không gọi STT', r.maThoat === 0 && r.suKien.at(-1).lyDo === 'im-lang' && r.sttNhan.length === 0);

  kiem('bridge log: tai-nghe nối vai client (không "(não)")', !bridgeLog.some((l) => /client nối.*\(não\)/.test(l)));
} catch (e) {
  loi.push(`ngoại lệ: ${e.message}`);
  console.error(e);
} finally {
  san.ws?.close();
  svStt.close();
  if (bridge) {
    try {
      process.kill(-bridge.pid, 'SIGTERM');
    } catch {
      /* đã chết */
    }
  }
  rmSync(TMP, { recursive: true, force: true });
  nhatKy.ketThuc = new Date().toISOString();
  nhatKy.ketQua = ketQua;
  nhatKy.loi = loi;
  nhatKy.bridgeLog = bridgeLog.slice(-40);
  mkdirSync(dirname(RA), { recursive: true });
  writeFileSync(RA, JSON.stringify(nhatKy, null, 2) + '\n');
  console.log(`\n${ketQua.filter((k) => k.ok).length}/${ketQua.length} đạt — ghi ${RA}`);
  process.exit(loi.length ? 1 : 0);
}
