/**
 * tai-nghe.test.mjs — V2 tai nghe chạy THẬT như extension gọi: `node scripts/tai-nghe.mjs`
 * là tiến trình con, ffmpeg thật đọc wav sinh bằng lavfi (`--nguon <file>` đọc `-re`
 * tốc độ thật y như mic), bridge GIẢ (ws, đóng vai bridge + sân khấu) và STT GIẢ (HTTP).
 *
 * Cổng (dải V2 8920–8929; đổi gốc bằng GEN_STAGE_TEST_CONG_TAI):
 *   8920 bridge giả · 8921 STT giả · 8922 bỏ trống (STT tắt) · 8923 bỏ trống (bridge tắt)
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  catIm,
  cachMoNguon,
  docThamSo,
  phanVai,
  rmsKhoi,
  taoBoNghe,
  taoWav,
} from '../tai-nghe.mjs';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONG = Number(process.env.GEN_STAGE_TEST_CONG_TAI ?? 8920);
const C_BRIDGE = CONG;
const C_STT = CONG + 1;
const C_STT_TAT = CONG + 2;
const C_BRIDGE_TAT = CONG + 3;

/* ---------------------------------------------------------------- wav mẫu */
const TMP = mkdtempSync(join(tmpdir(), 'tai-nghe-test-'));
/** Sinh wav 16 kHz mono: các đoạn `['im', s]` / `['to', s]`. */
function sinhWav(ten, doan) {
  const vao = [];
  for (const [loai, s] of doan)
    vao.push('-f', 'lavfi', '-i', loai === 'to' ? `sine=f=440:r=16000:d=${s}` : `anullsrc=r=16000:cl=mono:d=${s}`);
  const ra = join(TMP, ten);
  const nhan = doan.map((_, i) => `[${i}]`).join('');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...vao, '-filter_complex', `${nhan}concat=n=${doan.length}:v=0:a=1`, '-ac', '1', '-ar', '16000', ra]);
  return ra;
}
const WAV_NOI = sinhWav('noi.wav', [['im', 0.4], ['to', 0.8], ['im', 2.0]]);
const WAV_IM = sinhWav('im.wav', [['im', 1.2]]);
const WAV_DAI = sinhWav('dai.wav', [['im', 0.3], ['to', 3.0]]);

/* -------------------------------------------------------------- bridge giả */
const br = { wss: null, lenh: [], url: [], actors: [], clients: new Set() };
const ACTORS_RANH = [
  { id: 'owner', controlledBy: 'owner', state: 'idle' },
  { id: 'gen', controlledBy: 'agent', state: 'idle' },
];
function phat(event, data) {
  for (const c of br.clients) c.send(JSON.stringify({ event, data }));
}

/* ------------------------------------------------------------------ STT giả */
const stt = { sv: null, yeuCau: [], traLoi: null };

beforeAll(async () => {
  br.wss = new WebSocketServer({ host: '127.0.0.1', port: C_BRIDGE });
  br.wss.on('connection', (ws, req) => {
    br.url.push(req.url);
    br.clients.add(ws);
    ws.send(JSON.stringify({ event: 'bridge.hello', data: { stageOnline: true } }));
    ws.on('close', () => br.clients.delete(ws));
    ws.on('message', (tho) => {
      const g = JSON.parse(String(tho));
      br.lenh.push({ cmd: g.cmd, args: g.args ?? {} });
      const result = g.cmd === 'stage.describe' ? { actors: br.actors } : { heard: true };
      ws.send(JSON.stringify({ id: g.id, ok: true, result }));
    });
  });
  stt.sv = createServer((req, res) => {
    const manh = [];
    req.on('data', (d) => manh.push(d));
    req.on('end', () => {
      const than = Buffer.concat(manh);
      stt.yeuCau.push({ url: req.url, type: req.headers['content-type'], byte: than.length, riff: than.subarray(0, 4).toString() });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stt.traLoi));
    });
  });
  await new Promise((r) => stt.sv.listen(C_STT, '127.0.0.1', r));
});
afterAll(async () => {
  br.wss.close();
  stt.sv.close();
  rmSync(TMP, { recursive: true, force: true });
});
beforeEach(() => {
  br.lenh = [];
  br.url = [];
  br.actors = ACTORS_RANH;
  stt.yeuCau = [];
  stt.traLoi = { text: 'Gen ơi mở màn hình', confidence: 0.9, durationMs: 321, goiGen: true };
});

/** Chạy CLI; `khiBatDau(con)` gọi lúc thấy {"su":"bat-dau"}. */
function chayCli(args, { khiBatDau } = {}) {
  return new Promise((giai) => {
    const t0 = Date.now();
    const con = spawn(process.execPath, ['scripts/tai-nghe.mjs', ...args], { cwd: GOC, stdio: ['pipe', 'pipe', 'pipe'] });
    const su = [];
    let du = '';
    let loiChu = '';
    con.stdout.on('data', (d) => {
      du += d;
      let i;
      while ((i = du.indexOf('\n')) >= 0) {
        const dong = du.slice(0, i);
        du = du.slice(i + 1);
        const g = JSON.parse(dong); // mọi dòng stdout PHẢI là JSON
        g.t = Date.now() - t0;
        su.push(g);
        if (g.su === 'bat-dau') khiBatDau?.(con);
      }
    });
    con.stderr.on('data', (d) => (loiChu += d));
    con.on('close', (ma) => giai({ ma, su, loiChu, ms: Date.now() - t0, cuoi: su.at(-1) }));
  });
}
const coBan = (them = []) => ['--port', String(C_BRIDGE), '--stt-port', String(C_STT), '--to', 'gen', ...them];

/* ------------------------------------------------------------- hàm thuần */
describe('tai-nghe — hàm thuần', () => {
  it('docThamSo: mặc định, đủ cờ, sai thì tham-so', () => {
    expect(docThamSo(['--to', 'gen'])).toMatchObject({ port: 8787, sttPort: 8790, toiDaMs: 15000, imLangMs: 1200, khongGui: false });
    expect(
      docThamSo(['--port', '1', '--stt-port', '2', '--to', 'x', '--nguon', 'a.wav', '--toi-da-ms', '5', '--im-lang-ms', '0', '--khong-gui', '--token', 't']),
    ).toEqual({ port: 1, sttPort: 2, to: 'x', nguon: 'a.wav', toiDaMs: 5, imLangMs: 0, khongGui: true, token: 't' });
    for (const sai of [[], ['--to'], ['--to', 'g', '--port', 'abc'], ['--to', 'g', '--port', '70000'], ['--to', 'g', '--la'], ['--to', 'g', '--toi-da-ms', '0']])
      expect(() => docThamSo(sai)).toThrow(expect.objectContaining({ ma: 'tham-so' }));
  });

  it('cachMoNguon: dò theo nền tảng, file thật đọc -re, file thiếu = thiet-bi', () => {
    expect(cachMoNguon('', 'linux').map((c) => c.vao.slice(0, 2))).toEqual([['-f', 'pulse'], ['-f', 'alsa']]);
    expect(cachMoNguon('', 'darwin')[0].vao).toEqual(['-f', 'avfoundation', '-i', ':0']);
    expect(cachMoNguon('Mic (USB)', 'win32')[0].vao).toEqual(['-f', 'dshow', '-i', 'audio=Mic (USB)']);
    expect(() => cachMoNguon('', 'win32')).toThrow(expect.objectContaining({ ma: 'thiet-bi' }));
    expect(cachMoNguon(WAV_NOI)[0].vao).toEqual(['-re', '-i', WAV_NOI]);
    expect(() => cachMoNguon('/khong/co.wav')).toThrow(expect.objectContaining({ ma: 'thiet-bi' }));
  });

  it('taoBoNghe: chỉ tự dừng khi ĐÃ có tiếng rồi im đủ lâu; 0 = tắt', () => {
    const b = taoBoNghe({ imLangMs: 300 });
    const day = [...Array(20).fill(0), ...Array(10).fill(0.2), ...Array(10).fill(0)];
    const dung = day.findIndex((x) => b.them(x));
    expect(dung).toBe(35); // 6 nhịp im × 50 ms = 300 ms sau đoạn nói (kết thúc ở chỉ số 29)
    const tat = taoBoNghe({ imLangMs: 0 });
    expect(day.some((x) => tat.them(x))).toBe(false);
    const chiIm = taoBoNghe({ imLangMs: 300 });
    expect(Array(100).fill(0).some((x) => chiIm.them(x))).toBe(false);
  });

  it('catIm + taoWav + rmsKhoi: cắt theo VAD C1 (chừa 120 ms), header wav đúng', () => {
    const pcm = Buffer.alloc(16000 * 2); // 1 s
    for (let i = 8000; i < 16000; i++) pcm.writeInt16LE(i % 2 ? 8000 : -8000, i * 2); // nửa sau to
    const rms = [];
    for (let o = 0; o < pcm.length; o += 1600) rms.push(rmsKhoi(pcm.subarray(o, o + 1600)));
    expect(rms[0]).toBe(0);
    expect(rms.at(-1)).toBeCloseTo(8000 / 32768, 3);
    const c = catIm(pcm, rms);
    expect(c.tuMs).toBe(500 - 100); // chừa 120 ms → làm tròn 2 nhịp 50 ms
    expect(c.pcm.length).toBe((1000 - 400) * 32);
    expect(catIm(Buffer.alloc(3200), [0, 0])).toBeNull();
    const w = taoWav(c.pcm);
    expect(w.subarray(0, 4).toString()).toBe('RIFF');
    expect(w.readUInt32LE(24)).toBe(16000);
    expect(w.readUInt32LE(40)).toBe(c.pcm.length);
  });

  it('phanVai: chỉ agent đang speaking mới chặn; owner không bao giờ', () => {
    const v = phanVai({ actors: [{ id: 'owner', controlledBy: 'owner', state: 'speaking' }, { id: 'gen', controlledBy: 'agent', state: 'speaking' }, { id: 'mai', controlledBy: 'agent', state: 'idle' }] });
    expect(v.dangNoi).toEqual(['gen']);
    expect([...v.owner]).toEqual(['owner']);
    expect(phanVai({}).dangNoi).toEqual([]);
  });
});

/* --------------------------------------------------- CLI thật (ffmpeg thật) */
describe('tai-nghe — CLI thật', { timeout: 20_000 }, () => {
  it('(a) nói xong im lặng → tự dừng → STT (đã cắt) → stage.hear đúng to → daGui:true', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600']));
    expect(r.ma).toBe(0);
    expect(r.su[0].su).toBe('bat-dau');
    expect(r.su.filter((x) => x.su === 'muc').length).toBeGreaterThan(5);
    expect(r.cuoi).toMatchObject({ su: 'ket-qua', text: 'Gen ơi mở màn hình', confidence: 0.9, durationMs: 321, goiGen: true, daGui: true });
    // tự dừng ~ 0,4 + 0,8 + 0,6 s — KHÔNG đọc hết 3,2 s của file
    expect(r.loiChu).toMatch(/tự dừng/);
    expect(r.ms).toBeLessThan(3000);
    // wav gửi STT: đoạn tiếng 0,8 s + lề ≤ 2×120 ms, có header RIFF
    expect(stt.yeuCau).toHaveLength(1);
    expect(stt.yeuCau[0]).toMatchObject({ url: '/stt', type: 'audio/wav', riff: 'RIFF' });
    const ms = (stt.yeuCau[0].byte - 44) / 32;
    expect(ms).toBeGreaterThanOrEqual(800);
    expect(ms).toBeLessThanOrEqual(1100);
    expect(br.lenh.map((l) => l.cmd)).toEqual(['stage.describe', 'stage.hear']);
    expect(br.lenh[1].args).toEqual({ text: 'Gen ơi mở màn hình', to: 'gen', confidence: 0.9, durationMs: 321 });
    // vai client, KHÔNG role=nao
    expect(br.url[0]).not.toMatch(/role=nao/);
    // vạch mic ≤ 10 lần/s
    const muc = r.su.filter((x) => x.su === 'muc');
    const giay = (muc.at(-1).t - muc[0].t) / 1000;
    for (let i = 1; i < muc.length; i++) expect(muc[i].t - muc[i - 1].t).toBeGreaterThanOrEqual(90);
    expect(muc.length - 1).toBeLessThanOrEqual(Math.ceil(giay * 10) + 1);
    expect(Math.max(...muc.map((x) => x.rms))).toBeGreaterThan(0.05);
    expect(muc.every((x) => x.rms >= 0 && x.rms <= 1)).toBe(true);
  });

  it('(a2) --token đi trên URL ws', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600', '--token', 'b m']));
    expect(r.ma).toBe(0);
    expect(br.url[0]).toBe('/?token=b%20m');
  });

  it('(b) confidence 0,4 → daGui:false, không stage.hear', async () => {
    stt.traLoi = { text: 'ừm', confidence: 0.4, durationMs: 100, goiGen: false };
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600']));
    expect(r.ma).toBe(0);
    expect(r.cuoi).toMatchObject({ su: 'ket-qua', text: 'ừm', confidence: 0.4, daGui: false });
    expect(br.lenh.map((l) => l.cmd)).toEqual(['stage.describe']);
  });

  it('(b2) --khong-gui → daGui:false kể cả tin cậy cao', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600', '--khong-gui']));
    expect(r.cuoi).toMatchObject({ su: 'ket-qua', daGui: false });
    expect(br.lenh.map((l) => l.cmd)).toEqual(['stage.describe']);
  });

  it('(c) Gen đang speaking lúc bắt đầu → bo-qua gen-dang-noi, không mở mic, không STT', async () => {
    br.actors = [ACTORS_RANH[0], { id: 'gen', controlledBy: 'agent', state: 'speaking' }];
    const r = await chayCli(coBan(['--nguon', WAV_NOI]));
    expect(r.ma).toBe(0);
    expect(r.su.map((x) => x.su)).toEqual(['bo-qua']);
    expect(r.cuoi).toEqual(expect.objectContaining({ su: 'bo-qua', lyDo: 'gen-dang-noi' }));
    expect(stt.yeuCau).toHaveLength(0);
  });

  it('(d) actor.sayStart của gen giữa lúc thu → dừng ngay, bo-qua, không STT', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_DAI, '--im-lang-ms', '0']), {
      khiBatDau: () => setTimeout(() => phat('actor.sayStart', { actor: 'gen', text: 'Dạ' }), 600),
    });
    expect(r.ma).toBe(0);
    expect(r.cuoi).toEqual(expect.objectContaining({ su: 'bo-qua', lyDo: 'gen-dang-noi' }));
    expect(r.ms).toBeLessThan(2500); // không chờ hết 3,3 s
    expect(stt.yeuCau).toHaveLength(0);
    expect(br.lenh.map((l) => l.cmd)).toEqual(['stage.describe']);
  });

  it('(d2) actor.sayStart của OWNER (Sếp gõ) không chặn thu', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600']), {
      khiBatDau: () => setTimeout(() => phat('actor.sayStart', { actor: 'owner', text: 'chào' }), 200),
    });
    expect(r.cuoi).toMatchObject({ su: 'ket-qua', daGui: true });
  });

  it('(e) stdin "dung" dừng tay (VAD tắt)', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_DAI, '--im-lang-ms', '0']), {
      khiBatDau: (con) => setTimeout(() => con.stdin.write('dung\n'), 1000),
    });
    expect(r.ma).toBe(0);
    expect(r.loiChu).toMatch(/stdin — dừng thu/);
    expect(r.cuoi).toMatchObject({ su: 'ket-qua', daGui: true });
    expect(r.ms).toBeLessThan(2800);
  });

  it('(e2) SIGTERM dừng thu rồi vẫn nhận dạng phần đã thu', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_DAI, '--im-lang-ms', '0']), {
      khiBatDau: (con) => setTimeout(() => con.kill('SIGTERM'), 1000),
    });
    expect(r.ma).toBe(0);
    expect(r.cuoi).toMatchObject({ su: 'ket-qua' });
  });

  it('(f) chạm --toi-da-ms', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_DAI, '--im-lang-ms', '0', '--toi-da-ms', '1200']));
    expect(r.ma).toBe(0);
    expect(r.loiChu).toMatch(/chạm --toi-da-ms 1200/);
    expect(r.cuoi).toMatchObject({ su: 'ket-qua' });
    expect(r.ms).toBeLessThan(2600);
  });

  it('(g) STT tắt → loi stt, mã 4', async () => {
    const r = await chayCli(['--port', String(C_BRIDGE), '--stt-port', String(C_STT_TAT), '--to', 'gen', '--nguon', WAV_NOI, '--im-lang-ms', '600']);
    expect(r.ma).toBe(4);
    expect(r.cuoi).toMatchObject({ su: 'loi', ma: 'stt' });
  });

  it('(g2) bridge tắt → loi bridge, mã 4, không mở mic', async () => {
    const r = await chayCli(['--port', String(C_BRIDGE_TAT), '--stt-port', String(C_STT), '--to', 'gen', '--nguon', WAV_NOI]);
    expect(r.ma).toBe(4);
    expect(r.su.map((x) => x.su)).toEqual(['loi']);
    expect(r.cuoi).toMatchObject({ ma: 'bridge' });
  });

  it('(h) nguồn sai → loi thiet-bi, mã 2 (file thiếu và thiết bị không có)', async () => {
    const r = await chayCli(coBan(['--nguon', '/khong/co/file.wav']));
    expect(r.ma).toBe(2);
    expect(r.cuoi).toMatchObject({ su: 'loi', ma: 'thiet-bi' });
    // tên thiết bị không tồn tại: thử pulse rồi alsa, cả hai hỏng
    const r2 = await chayCli(coBan(['--nguon', 'khong-co-mic-nay', '--toi-da-ms', '5000']));
    expect(r2.ma).toBe(2);
    expect(r2.cuoi).toMatchObject({ su: 'loi', ma: 'thiet-bi' });
    expect(stt.yeuCau).toHaveLength(0);
  });

  it('(i) chỉ im lặng → bo-qua im-lang, không STT', async () => {
    const r = await chayCli(coBan(['--nguon', WAV_IM, '--im-lang-ms', '600']));
    expect(r.ma).toBe(0);
    expect(r.cuoi).toEqual(expect.objectContaining({ su: 'bo-qua', lyDo: 'im-lang' }));
    expect(stt.yeuCau).toHaveLength(0);
  });

  it('(i2) STT trả chữ rỗng → bo-qua rong', async () => {
    stt.traLoi = { text: '', confidence: 0, durationMs: 50, goiGen: false };
    const r = await chayCli(coBan(['--nguon', WAV_NOI, '--im-lang-ms', '600']));
    expect(r.cuoi).toEqual(expect.objectContaining({ su: 'bo-qua', lyDo: 'rong' }));
  });

  it('(j) sai tham số → loi tham-so, mã 64', async () => {
    const r = await chayCli(['--port', 'x']);
    expect(r.ma).toBe(64);
    expect(r.cuoi).toMatchObject({ su: 'loi', ma: 'tham-so' });
  });
});
