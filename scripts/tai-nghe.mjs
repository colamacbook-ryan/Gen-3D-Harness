/**
 * tai-nghe.mjs — V2 · TAI NGHE: thu giọng NGOÀI trình duyệt (INT-02, INT-05).
 *
 *     ffmpeg (mic / file .wav) ──s16le 16 kHz mono qua pipe──► file này
 *          │  RMS mỗi 50 ms  →  {"su":"muc"} (≤ 10 lần/s) + VAD tự dừng
 *          │  cắt im lặng đầu/cuối bằng `timDaiNoi` (src/audio/vad.ts, chừa 120 ms)
 *          ▼
 *     POST /stt (bridge/stt.ts)  →  { text, confidence, durationMs, goiGen }
 *          │  confidence ≥ 0,6 và không --khong-gui
 *          ▼
 *     ws bridge (vai client, KHÔNG role=nao)  →  stage.hear { text, to, confidence, durationMs }
 *
 * Đây là "tai" cho extension VS Code (Firefox/Electron không có mic dùng được
 * trong webview) và cho bất kỳ ai muốn nói với sân khấu từ terminal. HỢP ĐỒNG
 * CLI dưới đây là thứ extension dựa vào — đổi gì phải đổi cả `vscode/`.
 *
 *   node scripts/tai-nghe.mjs --port <8787> --stt-port <8790> --to <actorId>
 *        [--nguon <thiết bị | đường dẫn .wav>] [--toi-da-ms 15000]
 *        [--im-lang-ms 1200] [--khong-gui] [--token <t>]
 *
 *   stdout = JSON lines (một sự kiện mỗi dòng), stderr = log người đọc.
 *     {"su":"bat-dau"} · {"su":"muc","rms":0..1} · {"su":"dang-nhan-dang"}
 *     {"su":"ket-qua","text","confidence","durationMs","goiGen","daGui"}
 *     {"su":"bo-qua","lyDo":"gen-dang-noi"|"im-lang"|"rong"}
 *     {"su":"loi","ma":"thiet-bi"|"stt"|"bridge"|"tham-so","chu":"…"}
 *   Mã thoát: 0 có kết quả / bỏ qua · 2 lỗi thiết bị · 4 lỗi STT/bridge · 64 sai tham số
 *   (130 = Ctrl+C lần HAI trong lúc chờ STT — thoát cứng, không kết quả).
 *
 * **Bốn quyết định đáng ghi**
 *
 * 1. **Bán song công (CNS-004 — vòng loa→mic).** Loa phát giọng Gen, mic nghe
 *    lại, STT ra chữ, Gen trả lời chính mình — vòng lặp vô tận. Trước khi thu
 *    hỏi `stage.describe`: có actor `controlledBy:"agent"` đang `speaking` thì
 *    KHÔNG thu. Trong lúc thu, thấy `actor.sayStart` của bất kỳ actor nào không
 *    phải người Boss lái thì dừng ngay và VỨT âm đã thu — không bao giờ gửi STT
 *    phần âm có Gen nói. Không hỏi được sân khấu (bridge tắt / sân khấu chưa
 *    nối) = lỗi `bridge`: không bảo đảm được bán song công thì không thu.
 * 2. **PCM qua pipe, không ghi wav rồi đọc lại.** ffmpeg xuất `s16le` ra
 *    stdout; một luồng vừa đo RMS (vạch mic + VAD) vừa là chính âm sẽ gửi đi.
 *    Đọc file wav đang ghi dở thì header chưa có độ dài thật và phải đoán chỗ
 *    ffmpeg đã flush tới đâu. 15 s × 32 kB/s ≈ 480 kB, giữ trong RAM là đủ; wav
 *    gửi STT dựng lại từ PCM đã cắt, nên không có thư mục tạm nào phải dọn.
 * 3. **VAD dùng lại `timDaiNoi` của C1, không chép.** Tự dừng = chạy lại đúng
 *    hàm đó trên chuỗi RMS đến giờ (`chuaMs: 0`): đã có tiếng và đuôi im lặng
 *    sau đoạn nói ≥ `--im-lang-ms` thì dừng. Cắt trước khi gửi = cùng hàm với
 *    cấu hình mặc định (chừa 120 ms — cắt sát làm "dừng lại" thành "đừng lại").
 *    `src/audio/vad.ts` chỉ dùng cú pháp TS xoá-được nên `node` ≥ 22.18 import
 *    thẳng (type stripping), không cần tsx.
 * 4. **Tin cậy < 0,6 thì không tự gửi** (cùng `TIN_DU` của `src/audio/mic.ts`):
 *    trả `daGui:false`, extension hỏi Sếp rồi tự gửi `stage.hear`.
 *
 * Nguồn thu (STD-10 — dò lúc chạy): Linux `-f pulse -i default` (PipeWire/
 * PulseAudio), hỏng thì `-f alsa -i default`; macOS `-f avfoundation -i :0`;
 * Windows `-f dshow -i audio=<--nguon>`. `--nguon` là đường dẫn file thì đọc
 * file đó bằng `-re` (tốc độ thật, y như mic) — dùng cho test/bằng chứng.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import WebSocket from 'ws';

// `src/audio/vad.ts` nạp bằng type stripping của Node (≥ 22.18 mặc định bật; 22.6–22.17
// cần `--experimental-strip-types`). Nạp động để Node cũ vẫn trả được MỘT dòng JSON lỗi
// theo hợp đồng thay vì vết ngăn xếp — extension đọc được lý do.
let vad;
try {
  vad = await import('../src/audio/vad.ts');
} catch (e) {
  const chu =
    `Node ${process.version} không nạp được src/audio/vad.ts (${e.code ?? e.message}) — ` +
    'cần Node ≥ 22.18, hoặc chạy bằng: npx tsx scripts/tai-nghe.mjs …';
  process.stdout.write(JSON.stringify({ su: 'loi', ma: 'tham-so', chu }) + '\n');
  process.stderr.write(`[tai-nghe] ${chu}\n`);
  process.exit(64);
}
const { timDaiNoi, tinhRms } = vad;

/* --------------------------------------------------------------- hằng số */

/** Ngưỡng tự gửi — trùng `TIN_DU` của mic trình duyệt (C1). */
export const TIN_DU = 0.6;
/** Nhịp đo RMS (ms) — cùng nhịp mic trình duyệt (`BUOC_RMS_MS`). */
export const BUOC_MS = 50;
/** Gửi vạch mic mỗi bấy nhiêu ms (hợp đồng: ≤ 10 lần/s). */
export const NHIP_MUC_MS = 100;
export const TAN_SO = 16_000;
/** byte PCM s16le mono mỗi ms. */
const BYTE_MOI_MS = (TAN_SO * 2) / 1000;
const BYTE_MOI_BUOC = BYTE_MOI_MS * BUOC_MS;

export const MA_THOAT = { ok: 0, thietBi: 2, sttBridge: 4, thamSo: 64 };

/** Lỗi có mã hợp đồng (`ma` = khoá trong sự kiện `loi`). */
export class LoiTaiNghe extends Error {
  constructor(ma, chu) {
    super(chu);
    this.ma = ma;
  }
}

/* ------------------------------------------------------------ tham số */

const HUONG_DAN =
  'Dùng: node scripts/tai-nghe.mjs --port <8787> --stt-port <8790> --to <actorId> ' +
  '[--nguon <thiết bị|file.wav>] [--toi-da-ms 15000] [--im-lang-ms 1200] [--khong-gui] [--token <t>]';

/** Đọc argv (không gồm `node script`). Sai → ném `LoiTaiNghe('tham-so')`. */
export function docThamSo(argv) {
  const ts = {
    port: 8787,
    sttPort: 8790,
    to: '',
    nguon: '',
    toiDaMs: 15_000,
    imLangMs: 1200,
    khongGui: false,
    token: '',
  };
  const so = (ten, x, min) => {
    const n = Number(x);
    if (x === undefined || x === '' || !Number.isFinite(n) || n < min || !Number.isInteger(n))
      throw new LoiTaiNghe('tham-so', `${ten} phải là số nguyên ≥ ${min} (nhận "${x ?? ''}"). ${HUONG_DAN}`);
    return n;
  };
  const cong = (ten, x) => {
    const n = so(ten, x, 1);
    if (n > 65535) throw new LoiTaiNghe('tham-so', `${ten} phải ≤ 65535`);
    return n;
  };
  const chu = (ten, x) => {
    if (x === undefined || x === '' || x.startsWith('--'))
      throw new LoiTaiNghe('tham-so', `${ten} thiếu giá trị. ${HUONG_DAN}`);
    return x;
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    switch (k) {
      case '--': break; // `pnpm tai-nghe -- …` chuyển nguyên dấu này xuống
      case '--port': ts.port = cong(k, v()); break;
      case '--stt-port': ts.sttPort = cong(k, v()); break;
      case '--to': ts.to = chu(k, v()); break;
      case '--nguon': ts.nguon = chu(k, v()); break;
      case '--toi-da-ms': ts.toiDaMs = so(k, v(), 1); break;
      case '--im-lang-ms': ts.imLangMs = so(k, v(), 0); break;
      case '--khong-gui': ts.khongGui = true; break;
      case '--token': ts.token = chu(k, v()); break;
      default:
        throw new LoiTaiNghe('tham-so', `Tham số lạ "${k}". ${HUONG_DAN}`);
    }
  }
  if (!ts.to) throw new LoiTaiNghe('tham-so', `Thiếu --to <actorId>. ${HUONG_DAN}`);
  return ts;
}

/* ------------------------------------------------------------ nguồn thu */

/** `--nguon` trông như đường dẫn file (không phải tên thiết bị)? */
export function laDuongDan(nguon) {
  return /[\\/]/.test(nguon) || /\.(wav|mp3|ogg|opus|webm|flac|m4a)$/i.test(nguon);
}

/**
 * Danh sách cách mở nguồn để thử lần lượt (STD-10). Mỗi phần tử là đối số
 * ffmpeg phía VÀO; phía RA luôn là s16le 16 kHz mono ra pipe.
 */
export function cachMoNguon(nguon, nenTang = process.platform) {
  if (nguon && laDuongDan(nguon)) {
    if (!existsSync(nguon)) throw new LoiTaiNghe('thiet-bi', `Không thấy file nguồn: ${nguon}`);
    return [{ ten: `file ${nguon}`, vao: ['-re', '-i', nguon] }];
  }
  const tb = nguon || 'default';
  if (nenTang === 'linux')
    return [
      { ten: `pulse:${tb}`, vao: ['-f', 'pulse', '-i', tb] },
      { ten: `alsa:${tb}`, vao: ['-f', 'alsa', '-i', tb] },
    ];
  if (nenTang === 'darwin') return [{ ten: `avfoundation:${nguon || ':0'}`, vao: ['-f', 'avfoundation', '-i', nguon || ':0'] }];
  if (nenTang === 'win32') {
    if (!nguon)
      throw new LoiTaiNghe(
        'thiet-bi',
        'Windows cần --nguon "<tên mic dshow>" (xem: ffmpeg -list_devices true -f dshow -i dummy)',
      );
    return [{ ten: `dshow:${nguon}`, vao: ['-f', 'dshow', '-i', `audio=${nguon}`] }];
  }
  throw new LoiTaiNghe('thiet-bi', `Chưa biết cách mở mic trên nền tảng ${nenTang} — truyền --nguon <file.wav>`);
}

export function doiSoFfmpeg(vao) {
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', ...vao, '-vn', '-ac', '1', '-ar', String(TAN_SO), '-f', 's16le', 'pipe:1'];
}

/* -------------------------------------------------------------- âm thanh */

/** RMS 0..1 của một khối PCM s16le (dùng `tinhRms` của C1). */
export function rmsKhoi(buf) {
  const n = Math.floor(buf.length / 2);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = buf.readInt16LE(i * 2) / 32768;
  return tinhRms(f);
}

/**
 * Bộ nghe tự dừng: bơm RMS mỗi nhịp, trả `true` khi đã có tiếng và đuôi im
 * lặng sau đoạn nói ≥ `imLangMs`. `imLangMs` = 0 → không bao giờ tự dừng.
 */
export function taoBoNghe({ imLangMs, buocMs = BUOC_MS }) {
  const rms = [];
  return {
    them(x) {
      rms.push(x);
      if (!imLangMs) return false;
      const d = timDaiNoi(rms, buocMs, { chuaMs: 0 });
      return d.coTieng && rms.length * buocMs - d.denMs >= imLangMs;
    },
    get rms() {
      return rms;
    },
  };
}

/** Bọc PCM s16le mono thành wav (header 44 byte). */
export function taoWav(pcm, tanSo = TAN_SO) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(tanSo, 24);
  h.writeUInt32LE(tanSo * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Cắt im lặng đầu/cuối (chừa 120 ms như C1). `null` = không có tiếng. */
export function catIm(pcm, rms) {
  const d = timDaiNoi(rms, BUOC_MS);
  if (!d.coTieng) return null;
  const tu = Math.round(d.tuMs * BYTE_MOI_MS);
  const den = Math.min(pcm.length, Math.round(d.denMs * BYTE_MOI_MS));
  return { pcm: pcm.subarray(tu, den), tuMs: d.tuMs, denMs: d.denMs, dinh: d.dinh };
}

/* ---------------------------------------------------------------- bridge */

/** Nối bridge vai client (KHÔNG `role=nao` — tai không phải não). */
export function noiBridge({ port, token, hanMs = 5000 }) {
  const url = `ws://127.0.0.1:${port}/` + (token ? `?token=${encodeURIComponent(token)}` : '');
  return new Promise((giai, tuChoi) => {
    const ws = new WebSocket(url);
    const dangCho = new Map();
    const nghe = new Set();
    let dem = 0;
    const hen = setTimeout(() => {
      ws.terminate();
      tuChoi(new LoiTaiNghe('bridge', `Không nối được bridge ws 127.0.0.1:${port} trong ${hanMs} ms`));
    }, hanMs);
    ws.on('error', (e) => {
      clearTimeout(hen);
      tuChoi(new LoiTaiNghe('bridge', `Không nối được bridge ws 127.0.0.1:${port}: ${e.message} — \`pnpm bridge\` còn chạy không?`));
      for (const c of dangCho.values()) c.loi(new LoiTaiNghe('bridge', `ws lỗi: ${e.message}`));
      dangCho.clear();
    });
    ws.on('close', (ma) => {
      for (const c of dangCho.values()) c.loi(new LoiTaiNghe('bridge', `bridge đóng kết nối (mã ${ma})`));
      dangCho.clear();
    });
    ws.on('message', (tho) => {
      let g;
      try {
        g = JSON.parse(String(tho));
      } catch {
        return;
      }
      if (typeof g.event === 'string') {
        for (const f of nghe) f(g.event, g.data ?? {});
        return;
      }
      const c = g.id !== undefined ? dangCho.get(g.id) : undefined;
      if (c) {
        dangCho.delete(g.id);
        c.xong(g);
      } else if (g.ok === false && g.id === undefined) {
        // bridge từ chối token gửi gói không id
        for (const x of dangCho.values()) x.loi(new LoiTaiNghe('bridge', g.error ?? 'bridge từ chối'));
        dangCho.clear();
      }
    });
    ws.on('open', () => {
      clearTimeout(hen);
      giai({
        /** Gửi một lệnh, chờ kết quả `{ok, result|error}`. */
        goi(cmd, args = {}, han = 15_000) {
          return new Promise((xong, loi) => {
            const id = `tai-nghe-${++dem}`;
            const h = setTimeout(() => {
              dangCho.delete(id);
              loi(new LoiTaiNghe('bridge', `${cmd}: bridge không trả lời trong ${han} ms`));
            }, han);
            dangCho.set(id, {
              xong: (g) => (clearTimeout(h), xong(g)),
              loi: (e) => (clearTimeout(h), loi(e)),
            });
            try {
              ws.send(JSON.stringify({ id, cmd, args }));
            } catch (e) {
              dangCho.delete(id);
              clearTimeout(h);
              loi(new LoiTaiNghe('bridge', `${cmd}: gửi lỗi ${e.message}`));
            }
          });
        },
        nghe(f) {
          nghe.add(f);
        },
        dong() {
          try {
            ws.close();
          } catch {
            /* đã đóng */
          }
        },
      });
    });
  });
}

/** Ai trong `stage.describe` là "người Boss lái" (tiếng của họ không phải tiếng loa). */
export function phanVai(st) {
  const actors = Array.isArray(st?.actors) ? st.actors : [];
  return {
    owner: new Set(actors.filter((a) => a.controlledBy === 'owner').map((a) => a.id)),
    dangNoi: actors.filter((a) => a.controlledBy === 'agent' && a.state === 'speaking').map((a) => a.id),
  };
}

/* ------------------------------------------------------------------- STT */

export async function goiStt({ sttPort, wav, hanMs = 130_000 }) {
  let r;
  try {
    r = await fetch(`http://127.0.0.1:${sttPort}/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav,
      signal: AbortSignal.timeout(hanMs),
    });
  } catch (e) {
    throw new LoiTaiNghe('stt', `Không gọi được STT 127.0.0.1:${sttPort}/stt: ${e.cause?.code ?? e.message}`);
  }
  let g = null;
  try {
    g = await r.json();
  } catch {
    /* gói không phải JSON */
  }
  if (!r.ok || !g || typeof g.text !== 'string')
    throw new LoiTaiNghe('stt', `STT trả HTTP ${r.status}: ${g?.error ?? 'gói lạ'}`);
  return {
    text: g.text.trim(),
    confidence: Number(g.confidence ?? 0),
    durationMs: Number(g.durationMs ?? 0),
    goiGen: Boolean(g.goiGen),
  };
}

/* ------------------------------------------------------------------ thu */

/**
 * Thu một lượt. Trả `{ pcm, rms, lyDo }` với `lyDo` ∈ dung | tin-hieu | im-lang |
 * toi-da | het-nguon | gen-dang-noi. Ném `LoiTaiNghe('thiet-bi')` khi không mở
 * được nguồn nào.
 */
export function thu({ cach, imLangMs, toiDaMs, phat, ghi, dieuKhien }) {
  return new Promise((giai, tuChoi) => {
    const boNghe = taoBoNghe({ imLangMs });
    const manh = [];
    let du = Buffer.alloc(0);
    let tongByte = 0;
    let p = null;
    let xong = false;
    let daBatDau = false;
    let dinhMuc = 0;
    let lanMuc = 0;
    let henToiDa = null;
    let loiCuoi = '';
    let iCach = 0;

    function ket(lyDo) {
      if (xong) return;
      xong = true;
      clearTimeout(henToiDa);
      dieuKhien.dung = null;
      if (p && p.exitCode === null) p.kill('SIGTERM');
      giai({ pcm: Buffer.concat(manh, tongByte), rms: boNghe.rms, lyDo });
    }
    dieuKhien.dung = ket;
    // Sếp bấm dừng khi còn đang hỏi sân khấu → không mở mic nữa
    if (dieuKhien.choDung) return ket(dieuKhien.choDung);

    function mo() {
      const c = cach[iCach];
      ghi(`mở nguồn ${c.ten}`);
      const doiSo = doiSoFfmpeg(c.vao);
      let loiChu = '';
      try {
        p = spawn('ffmpeg', doiSo, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        return tuChoi(new LoiTaiNghe('thiet-bi', `Không chạy được ffmpeg: ${e.message}`));
      }
      const pNay = p;
      pNay.on('error', (e) => {
        if (xong) return;
        xong = true;
        clearTimeout(henToiDa);
        tuChoi(
          new LoiTaiNghe(
            'thiet-bi',
            e.code === 'ENOENT' ? 'Không có ffmpeg trong PATH — cài ffmpeg (dnf install ffmpeg-free / brew install ffmpeg)' : `ffmpeg lỗi: ${e.message}`,
          ),
        );
      });
      pNay.stderr.on('data', (d) => (loiChu += String(d)));
      pNay.stdout.on('data', (d) => {
        if (xong) return;
        if (!daBatDau) {
          daBatDau = true;
          phat({ su: 'bat-dau' });
          ghi(`đang thu (${c.ten}) — nói đi`);
        }
        manh.push(d);
        tongByte += d.length;
        du = du.length ? Buffer.concat([du, d]) : d;
        while (du.length >= BYTE_MOI_BUOC && !xong) {
          const r = rmsKhoi(du.subarray(0, BYTE_MOI_BUOC));
          du = du.subarray(BYTE_MOI_BUOC);
          dinhMuc = Math.max(dinhMuc, r);
          // Kẹp theo đồng hồ THẬT, không theo thời lượng âm: nguồn có thể đổ
          // một mẻ dồn (buffer pulse, `-re` lúc mở file) — hợp đồng là ≤ 10 lần/s.
          const now = Date.now();
          if (now - lanMuc >= NHIP_MUC_MS) {
            phat({ su: 'muc', rms: Math.round(Math.min(1, dinhMuc) * 1000) / 1000 });
            dinhMuc = 0;
            lanMuc = now;
          }
          if (boNghe.them(r)) {
            ghi(`im lặng ≥ ${imLangMs} ms sau khi nói — tự dừng`);
            ket('im-lang');
          }
        }
      });
      pNay.on('close', (ma) => {
        if (xong) return;
        if (daBatDau) {
          // file hết (mã 0) hoặc thiết bị rớt giữa chừng: xử lý phần đã có
          if (ma !== 0) ghi(`ffmpeg dừng giữa chừng (mã ${ma}): ${loiChu.trim().slice(0, 200)}`);
          return ket('het-nguon');
        }
        loiCuoi = `${c.ten}: ${loiChu.trim().split('\n').at(-1) || `ffmpeg thoát mã ${ma}`}`;
        ghi(`không mở được ${loiCuoi}`);
        if (++iCach < cach.length) return mo();
        xong = true;
        clearTimeout(henToiDa);
        tuChoi(new LoiTaiNghe('thiet-bi', `Không mở được nguồn thu — ${loiCuoi}`));
      });
    }

    henToiDa = setTimeout(() => {
      ghi(`chạm --toi-da-ms ${toiDaMs} — dừng`);
      if (!daBatDau) {
        xong = true;
        if (p && p.exitCode === null) p.kill('SIGTERM');
        return tuChoi(new LoiTaiNghe('thiet-bi', `Nguồn thu không ra âm nào sau ${toiDaMs} ms`));
      }
      ket('toi-da');
    }, toiDaMs);
    mo();
  });
}

/* ---------------------------------------------------------------- chạy */

/**
 * Một lượt nghe trọn vẹn. Trả mã thoát; mọi sự kiện đi qua `phat`, log qua `ghi`.
 * `dieuKhien.dung(lyDo)` (do main nối stdin/tín hiệu) dừng thu bằng tay.
 */
export async function chay(ts, { phat, ghi, dieuKhien = {} }) {
  let br = null;
  try {
    const cach = cachMoNguon(ts.nguon);

    // CNS-004 — hỏi sân khấu TRƯỚC khi mở mic.
    br = await noiBridge({ port: ts.port, token: ts.token });
    const ds = await br.goi('stage.describe');
    if (!ds.ok) throw new LoiTaiNghe('bridge', `stage.describe lỗi: ${ds.error ?? '?'}`);
    const vai = phanVai(ds.result);
    if (vai.dangNoi.length) {
      ghi(`${vai.dangNoi.join(', ')} đang nói — không thu (bán song công)`);
      phat({ su: 'bo-qua', lyDo: 'gen-dang-noi' });
      return MA_THOAT.ok;
    }
    let genChen = '';
    br.nghe((ev, d) => {
      if (ev !== 'actor.sayStart' || vai.owner.has(d.actor) || genChen) return;
      genChen = String(d.actor ?? '?');
      ghi(`${genChen} bắt đầu nói giữa lúc thu — dừng, vứt âm đã thu`);
      dieuKhien.dung?.('gen-dang-noi');
    });

    const kq = await thu({ cach, imLangMs: ts.imLangMs, toiDaMs: ts.toiDaMs, phat, ghi, dieuKhien });
    // sayStart có thể tới đúng lúc vừa dừng vì lý do khác — vẫn không gửi STT
    if (kq.lyDo === 'gen-dang-noi' || genChen) {
      phat({ su: 'bo-qua', lyDo: 'gen-dang-noi' });
      return MA_THOAT.ok;
    }
    const cat = catIm(kq.pcm, kq.rms);
    ghi(`dừng (${kq.lyDo}) sau ${kq.rms.length * BUOC_MS} ms` + (cat ? `, giữ ${cat.tuMs}–${cat.denMs} ms` : ', không có tiếng'));
    if (!cat) {
      phat({ su: 'bo-qua', lyDo: 'im-lang' });
      return MA_THOAT.ok;
    }

    phat({ su: 'dang-nhan-dang' });
    const stt = await goiStt({ sttPort: ts.sttPort, wav: taoWav(cat.pcm) });
    if (genChen) {
      // đã gửi rồi thì thôi — nhưng không gửi stage.hear một câu thu lẫn tiếng loa
      phat({ su: 'bo-qua', lyDo: 'gen-dang-noi' });
      return MA_THOAT.ok;
    }
    if (!stt.text) {
      phat({ su: 'bo-qua', lyDo: 'rong' });
      return MA_THOAT.ok;
    }
    ghi(`nghe được: "${stt.text}" (tin cậy ${stt.confidence})`);
    const ket = { su: 'ket-qua', ...stt, daGui: false };
    if (ts.khongGui || stt.confidence < TIN_DU) {
      if (!ts.khongGui) ghi(`tin cậy < ${TIN_DU} — không tự gửi, để Sếp quyết`);
      phat(ket);
      return MA_THOAT.ok;
    }
    const g = await br
      .goi('stage.hear', { text: stt.text, to: ts.to, confidence: stt.confidence, durationMs: stt.durationMs })
      .catch((e) => ({ ok: false, error: e.message }));
    if (!g.ok) {
      phat(ket); // vẫn trả chữ để extension hỏi Sếp gửi lại
      throw new LoiTaiNghe('bridge', `stage.hear lỗi: ${g.error ?? '?'}`);
    }
    phat({ ...ket, daGui: true });
    return MA_THOAT.ok;
  } catch (e) {
    const ma = e instanceof LoiTaiNghe ? e.ma : 'stt';
    phat({ su: 'loi', ma, chu: e.message });
    ghi(`LỖI ${ma}: ${e.message}`);
    return ma === 'tham-so' ? MA_THOAT.thamSo : ma === 'thiet-bi' ? MA_THOAT.thietBi : MA_THOAT.sttBridge;
  } finally {
    br?.dong();
  }
}

async function main() {
  const phat = (x) => process.stdout.write(JSON.stringify(x) + '\n');
  const ghi = (s) => process.stderr.write(`[tai-nghe ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}] ${s}\n`);
  const thoat = (ma) => process.stdout.write('', () => process.exit(ma));

  let ts;
  try {
    ts = docThamSo(process.argv.slice(2));
  } catch (e) {
    phat({ su: 'loi', ma: 'tham-so', chu: e.message });
    ghi(e.message);
    return thoat(MA_THOAT.thamSo);
  }

  const dieuKhien = { dung: null, choDung: null };
  let daXinDung = false;
  const xinDung = (vi) => {
    if (dieuKhien.dung) {
      ghi(`${vi} — dừng thu`);
      dieuKhien.dung(vi === 'stdin' ? 'dung' : 'tin-hieu');
      return;
    }
    if (vi !== 'stdin' && daXinDung) {
      ghi(`${vi} lần hai — thoát ngay`);
      return thoat(130);
    }
    if (vi !== 'stdin') daXinDung = true;
    dieuKhien.choDung ??= vi === 'stdin' ? 'dung' : 'tin-hieu';
  };
  // stdin: dòng "dung" = dừng tay. EOF KHÔNG dừng (extension có thể đóng stdin).
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (dong) => {
    if (dong.trim() === 'dung') xinDung('stdin');
  });
  process.on('SIGINT', () => xinDung('SIGINT'));
  process.on('SIGTERM', () => xinDung('SIGTERM'));

  const ma = await chay(ts, { phat, ghi, dieuKhien });
  rl.close();
  thoat(ma);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
