// tai-nghe GIẢ (V2) — đúng hợp đồng CLI của scripts/tai-nghe.mjs nhưng không có mic:
// phát JSON lines theo kịch bản `TAI_NGHE_KICH_BAN`, ghi argv + mọi dòng stdin vào
// `TAI_NGHE_GHI` (JSON lines) để test đối chiếu. Kịch bản:
//   giu      bat-dau → muc… tới khi stdin `dung` → dang-nhan-dang → ket-qua 0,92 daGui:true (+ stage.hear qua ws)
//   vad      bat-dau → muc ×3 → (im lặng giả) tự dừng sau 300 ms nếu --im-lang-ms > 0, không thì chờ `dung`
//   thap     như giu nhưng ket-qua tin cậy 0,41 daGui:false
//   gen-noi  bat-dau → bo-qua gen-dang-noi, thoát 0
//   thiet-bi loi thiet-bi, thoát 2
//   chet2    thoát 2 không in gì (hỏng trước khi kịp báo)
//   hear-loi ket-qua 0,9 nhưng stage.hear hỏng ⇒ ket-qua daGui:false RỒI loi bridge, thoát 4
//   thoat130 bat-dau → `dung` → dang-nhan-dang → thoát cứng 130 (tín hiệu lần 2 lúc chờ STT)
//   tham-so  loi tham-so (Node < 22.18) thoát 64
//   treo     bat-dau, đẻ một con "ffmpeg" cùng nhóm, lờ `dung`/`huy` + SIGTERM (chỉ SIGKILL mới chết)
// Mọi kịch bản khác: stdin `huy` ⇒ bo-qua huy, thoát 0 (không STT, không stage.hear).
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const ghiFile = process.env.TAI_NGHE_GHI;
const ghi = (o) => ghiFile && fs.appendFileSync(ghiFile, JSON.stringify(o) + '\n');
const ra = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const thamSo = (ten, md) => {
  const i = argv.indexOf(ten);
  return i >= 0 ? argv[i + 1] : md;
};
const kb = process.env.TAI_NGHE_KICH_BAN ?? 'giu';
ghi({ argv, pid: process.pid, kb });

for (const t of ['--port', '--stt-port', '--to']) {
  if (!thamSo(t)) {
    ra({ su: 'loi', ma: 'tham-so', chu: `thiếu ${t}` });
    process.exit(64);
  }
}

let dungRoi = false;
let khiDung = () => undefined;
let dem = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (b) => {
  dem += b;
  let i;
  while ((i = dem.indexOf('\n')) >= 0) {
    const d = dem.slice(0, i).trim();
    dem = dem.slice(i + 1);
    ghi({ stdin: d });
    if (d === 'huy' && kb !== 'treo') {
      // hợp đồng: dừng thu, KHÔNG STT, KHÔNG stage.hear, bo-qua huy, mã 0
      ghi({ thoat: 'huy' });
      ra({ su: 'bo-qua', lyDo: 'huy' });
      process.exit(0);
    }
    if (d === 'dung' && kb !== 'treo') {
      dungRoi = true;
      khiDung();
    }
  }
});

async function guiHear(text, conf) {
  if (argv.includes('--khong-gui')) return false;
  const ws = new WebSocket(`ws://127.0.0.1:${thamSo('--port')}/`);
  await new Promise((ok, loi) => { ws.onopen = ok; ws.onerror = loi; });
  const args = { text, to: thamSo('--to'), confidence: conf, durationMs: 400 };
  ghi({ token: process.env.GEN_STAGE_TOKEN ?? null });
  ws.send(JSON.stringify({ id: 'tai-nghe-1', cmd: 'stage.hear', args }));
  await new Promise((ok) => { ws.onmessage = ok; setTimeout(ok, 2000); });
  ws.close();
  return true;
}

const doi = (ms) => new Promise((r) => setTimeout(r, ms));
const choDung = () => (dungRoi ? Promise.resolve() : new Promise((r) => { khiDung = r; }));

async function chay() {
  if (kb === 'thiet-bi') {
    ra({ su: 'loi', ma: 'thiet-bi', chu: 'không mở được nguồn thu mặc định (ffmpeg: Connection refused)' });
    process.exit(2);
  }
  if (kb === 'chet2') process.exit(2);
  if (kb === 'tham-so') {
    ra({ su: 'loi', ma: 'tham-so', chu: 'cần Node ≥ 22.18 (đang v20.11.0)' });
    process.exit(64);
  }
  ra({ su: 'bat-dau' });
  if (kb === 'gen-noi') {
    ra({ su: 'bo-qua', lyDo: 'gen-dang-noi' });
    process.exit(0);
  }
  if (kb === 'treo') {
    const con = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1e9)'], { stdio: 'ignore' });
    ghi({ ffmpegGia: con.pid });
    process.on('SIGTERM', () => ghi({ boQua: 'SIGTERM' }));
    setInterval(() => ra({ su: 'muc', rms: 0.1 }), 100);
    return;
  }
  let n = 0;
  const nhip = setInterval(() => ra({ su: 'muc', rms: [0.05, 0.2, 0.4][n++ % 3] }), 50);
  const imLang = Number(thamSo('--im-lang-ms', '1200'));
  if (kb === 'vad' && imLang > 0) await Promise.race([doi(300), choDung()]);
  else await choDung();
  clearInterval(nhip);
  ra({ su: 'dang-nhan-dang' });
  await doi(80);
  if (kb === 'thoat130') process.exit(130);
  if (kb === 'hear-loi') {
    ra({ su: 'ket-qua', text: 'Gen ơi, chào em', confidence: 0.9, durationMs: 400, goiGen: true, daGui: false });
    ra({ su: 'loi', ma: 'bridge', chu: 'stage.hear: Chưa có sân khấu nào nối bridge' });
    process.exit(4);
  }
  const conf = kb === 'thap' ? 0.41 : 0.92;
  const text = kb === 'thap' ? 'ghen ơi mở màng hình' : 'Gen ơi, chào em';
  const daGui = conf >= 0.6 ? await guiHear(text, conf) : false;
  ra({ su: 'ket-qua', text, confidence: conf, durationMs: 400, goiGen: true, daGui });
  process.exit(0);
}
if (kb !== 'treo') process.on('SIGTERM', () => process.exit(143));
chay().catch((e) => {
  ra({ su: 'loi', ma: 'bridge', chu: String(e?.message ?? e) });
  process.exit(4);
});
