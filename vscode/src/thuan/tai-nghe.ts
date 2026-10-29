/**
 * tai-nghe.ts — V2: chạy `scripts/tai-nghe.mjs` (thu mic → bridge /stt → stage.hear)
 * cho extension. Webview VS Code không có mic (vscode#250568/#323602), nên giọng
 * đi qua một tiến trình NGẮN ngoài webview, theo hợp đồng CLI:
 *
 *   tai-nghe --port <bridge> --stt-port <stt> --to <actorId> [--nguon <…>]
 *            [--toi-da-ms 15000] [--im-lang-ms 1200] [--khong-gui] [--token <t>]
 *   stdin: dòng `dung` = dừng thu · SIGINT/SIGTERM cũng dừng
 *   stdout JSON lines: bat-dau · muc{rms} · dang-nhan-dang · ket-qua{…,daGui} ·
 *                      bo-qua{lyDo} · loi{ma,chu}      mã thoát 0/2/4/64
 *
 * Vì sao KHÔNG ghi tiến trình này vào sổ PID dài hạn (như bridge/vite/não):
 *  - nó sống ngắn có chặn trên: `--toi-da-ms` (15 s) + thời gian nhận dạng, và
 *    host còn tự huỷ sau `HAN_CUNG_MS`;
 *  - stdout là PIPE nối với host: host chết thì lần ghi kế tiếp (`muc` mỗi nhịp)
 *    ăn EPIPE; và kể cả không chết vì EPIPE thì vẫn tự dừng ở `--toi-da-ms`.
 *    (EOF stdin KHÔNG dừng tai-nghe — hợp đồng: chỉ dòng `dung\n` mới dừng —
 *    nên host luôn gửi `dung` hoặc SIGKILL cả nhóm, không trông vào đóng pipe);
 *  - nhận lại quyền qua nhiều cửa sổ là vô nghĩa với một lần thu 15 s, còn sổ
 *    PID thêm rủi ro giết nhầm PID tái sử dụng.
 * Nhưng KHÔNG được để mồ côi: bật `detached` (nhóm riêng, pgid = pid). Huỷ = dòng
 * `huy\n` vào stdin (tai-nghe dừng thu, KHÔNG gọi STT, KHÔNG gửi stage.hear, in
 * `bo-qua huy`, mã 0); quá `HAN_HUY_MS` chưa thoát thì SIGKILL CẢ NHÓM (ffmpeg con
 * đang giữ mic chết theo). KHÔNG dùng SIGTERM làm nút huỷ: SIGTERM lần đầu = dừng
 * thu nhưng VẪN nhận dạng + gửi. Khi trưởng nhóm thoát, quét nhóm một lần nữa để
 * dọn con sót.
 *
 * Không import `vscode`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CauHinh } from './cau-hinh';
import type { CheDoGiong } from './chatroom-logic';
import { timLenh, type LenhChay } from './tien-trinh';

/**
 * MỘT chỗ duy nhất quyết định chạy tai-nghe bằng gì (đi qua `genStage.pnpm` đã
 * kiểm bằng `timLenh`, cwd = root repo). Nếu `scripts/tai-nghe.mjs` phải chạy
 * bằng tsx thì đổi thành `['tai-nghe']` (script `pnpm tai-nghe` trong package.json gốc).
 */
export const CHAY_TAI_NGHE: readonly string[] = ['exec', 'node', 'scripts/tai-nghe.mjs'];
// `pnpm exec node` = `node` trong PATH (cần Node ≥ 22.18 — type stripping; Node cũ thì
// tai-nghe tự in `loi tham-so` mã 64 kèm gợi ý, chatroom hiện nguyên văn).
// KHÔNG dùng process.execPath: trong extension host đó là Electron, không phải node.
/** File phải có trong root trước khi spawn (báo rõ thay vì để pnpm lỗi mơ hồ). */
export const FILE_TAI_NGHE = 'scripts/tai-nghe.mjs';

/** VAD: giữ-để-nói tắt hẳn (Sếp thả nút là dừng); bật/tắt thì im 1,2 s là dừng. */
export const IM_LANG_MS: Record<CheDoGiong, number> = { giu: 0, 'bat-tat': 1200 };
export const TOI_DA_MS = 15_000;
/**
 * Hạn chờ STT (lần đầu PhoWhisper nạp model có thể mất cả phút) và hạn chờ `stage.hear` —
 * MỘT chỗ khai ở đây rồi truyền xuống tai-nghe bằng `--han-stt-ms` / `--han-hear-ms`
 * (mặc định của tai-nghe.mjs trùng: 130000 / 15000), nên hạn cứng của host luôn khớp.
 */
export const HAN_STT_MS = 130_000;
export const HAN_HEAR_MS = 15_000;
/** Dư để tai-nghe kịp in kết cục sau hạn của nó trước khi host ra tay. */
export const DU_HAN_MS = 10_000;
/** Host tự huỷ nếu tai-nghe sống quá lâu: thu tối đa + chờ STT + chờ stage.hear + dư. */
export const HAN_CUNG_MS = TOI_DA_MS + HAN_STT_MS + HAN_HEAR_MS + DU_HAN_MS;
/** Sau dòng `huy`, chờ tai-nghe tự thoát bấy lâu rồi mới SIGKILL cả nhóm. */
export const HAN_HUY_MS = 2_000;

export type CauHinhTaiNghe = Pick<CauHinh, 'pnpm' | 'bridgePort' | 'sttPort' | 'taiNgheNguon'>;

export function lenhTaiNghe(
  c: CauHinhTaiNghe,
  to: string,
  cheDo: CheDoGiong,
  token: string | undefined = process.env.GEN_STAGE_TOKEN,
): LenhChay {
  const args = [
    ...CHAY_TAI_NGHE,
    '--port', String(c.bridgePort),
    '--stt-port', String(c.sttPort),
    '--to', to,
    '--toi-da-ms', String(TOI_DA_MS),
    '--im-lang-ms', String(IM_LANG_MS[cheDo]),
    '--han-stt-ms', String(HAN_STT_MS),
    '--han-hear-ms', String(HAN_HEAR_MS),
  ];
  if (c.taiNgheNguon) args.push('--nguon', c.taiNgheNguon);
  // token: chỉ qua env `GEN_STAGE_TOKEN` (tai-nghe đọc biến này), KHÔNG `--token` trên argv
  // (lộ trong `ps` / /proc/*/cmdline). Extension chưa có cấu hình token riêng (CauNoi cũng
  // không gửi) nên chỉ chuyển tiếp biến của extension host nếu có.
  const env: Record<string, string> = {};
  if (token) env.GEN_STAGE_TOKEN = token;
  return { cmd: c.pnpm, args, env };
}

/* ------------------------------------------------------------ đọc stdout */

export type SuTaiNghe =
  | { su: 'bat-dau' }
  | { su: 'muc'; rms: number }
  | { su: 'dang-nhan-dang' }
  | { su: 'ket-qua'; text: string; confidence: number; durationMs: number; goiGen: boolean; daGui: boolean }
  | { su: 'bo-qua'; lyDo: string }
  /** `khongRo` (chỉ `loi bridge` của stage.hear): không biết Gen đã nhận câu chưa. */
  | { su: 'loi'; ma: string; chu: string; khongRo: boolean };

const so = (x: unknown, md = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : md);
const chuoi = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Một dòng stdout → sự kiện đã kiểm kiểu, hoặc null (dòng lạ: host ghi log, không đoán). */
export function docDongTaiNghe(dong: string): SuTaiNghe | null {
  let o: Record<string, unknown>;
  try {
    const g: unknown = JSON.parse(dong);
    if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
    o = g as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (o.su) {
    case 'bat-dau':
      return { su: 'bat-dau' };
    case 'dang-nhan-dang':
      return { su: 'dang-nhan-dang' };
    case 'muc':
      return { su: 'muc', rms: Math.min(1, Math.max(0, so(o.rms))) };
    case 'ket-qua':
      return {
        su: 'ket-qua',
        text: chuoi(o.text),
        confidence: Math.min(1, Math.max(0, so(o.confidence))),
        durationMs: Math.max(0, so(o.durationMs)),
        goiGen: o.goiGen === true,
        daGui: o.daGui === true,
      };
    case 'bo-qua':
      return { su: 'bo-qua', lyDo: chuoi(o.lyDo) };
    case 'loi':
      return { su: 'loi', ma: chuoi(o.ma) || 'khac', chu: chuoi(o.chu), khongRo: o.khongRo === true };
    default:
      return null;
  }
}

/* -------------------------------------------------------- một tiến trình */

export interface KetThucTaiNghe {
  ma: number | null;
  tin: NodeJS.Signals | null;
  /** Lỗi spawn (ENOENT…), nếu có. */
  loiSpawn: string;
  /** Vài dòng stderr cuối (để báo lỗi khi tai-nghe chết không kịp in `loi`). */
  stderr: string;
}

export interface TuyChonTienTrinhTaiNghe {
  khiSu: (s: SuTaiNghe) => void;
  /** Gọi ĐÚNG MỘT LẦN, sau khi stdout đã đọc hết (mọi `khiSu` đã chạy). */
  khiXong: (k: KetThucTaiNghe) => void;
  ghi: (dong: string) => void;
  /** Gọi ngay khi hạn cứng chạm, TRƯỚC khi gửi `huy` — để host phân biệt "quá hạn" với huỷ chủ động. */
  khiQuaHan?: () => void;
  hanCungMs?: number;
  hanHuyMs?: number;
}

/** Giết cả nhóm tiến trình (pid âm); ESRCH = nhóm đã hết, không phải lỗi. */
function gietNhom(pgid: number, tin: NodeJS.Signals): boolean {
  try {
    process.kill(-pgid, tin);
    return true;
  } catch {
    return false;
  }
}

export class TienTrinhTaiNghe {
  readonly pid: number | undefined;
  private con: ChildProcess;
  private xong = false;
  private daThoat = false;
  private henCung: ReturnType<typeof setTimeout> | null = null;
  private duoiLoi = '';
  private loiSpawn = '';

  constructor(l: LenhChay, cwd: string, private o: TuyChonTienTrinhTaiNghe) {
    this.con = spawn(l.cmd, l.args, {
      cwd,
      // nhóm riêng: pnpm → node → ffmpeg đều chung pgid = pid này, huỷ là huỷ hết
      detached: true,
      env: { ...process.env, ...l.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.pid = this.con.pid;
    let dem = '';
    this.con.stdout?.setEncoding('utf8');
    this.con.stdout?.on('data', (b: string) => {
      dem += b;
      let i: number;
      while ((i = dem.indexOf('\n')) >= 0) {
        const dong = dem.slice(0, i).trim();
        dem = dem.slice(i + 1);
        if (!dong) continue;
        const s = docDongTaiNghe(dong);
        if (s) this.o.khiSu(s);
        else this.o.ghi(`[tai-nghe] stdout lạ: ${dong.slice(0, 200)}`);
      }
    });
    this.con.stderr?.setEncoding('utf8');
    this.con.stderr?.on('data', (b: string) => {
      this.duoiLoi = (this.duoiLoi + b).slice(-2000);
      for (const d of b.split('\n')) if (d.trim()) this.o.ghi(`[tai-nghe] ${d.trimEnd()}`);
    });
    // stdin đóng sớm (tai-nghe đã thoát) → EPIPE khi ghi `dung`: không phải lỗi
    this.con.stdin?.on('error', () => undefined);
    this.con.on('error', (e) => {
      this.loiSpawn = e.message;
      // spawn hỏng (ENOENT): có thể không bao giờ có 'close' → tự kết thúc
      if (this.pid === undefined) this.ketThuc(null, null);
    });
    this.con.on('exit', () => {
      this.daThoat = true;
      // dọn con sót (vd ffmpeg) còn giữ mic/pipe — pid vừa được thu hồi, nhóm vẫn mang số này
      if (this.pid !== undefined) gietNhom(this.pid, 'SIGKILL');
    });
    this.con.on('close', (ma, tin) => this.ketThuc(ma, tin));
    this.henCung = setTimeout(() => {
      this.o.ghi(`[tai-nghe] sống quá ${this.o.hanCungMs ?? HAN_CUNG_MS} ms — huỷ`);
      this.o.khiQuaHan?.();
      void this.huy();
    }, this.o.hanCungMs ?? HAN_CUNG_MS);
  }

  get song(): boolean {
    return !this.xong;
  }

  /**
   * Dừng THU (tai-nghe vẫn nhận dạng + gửi phần đã thu): dòng `dung` vào stdin.
   * Gọi lần 2 vô hại với tai-nghe (chỉ tín hiệu lần 2 mới thoát cứng 130).
   */
  dung(): void {
    if (this.xong || this.daThoat) return;
    try {
      this.con.stdin?.write('dung\n');
    } catch {
      /* đã đóng */
    }
  }

  /**
   * Huỷ, bỏ kết quả: dòng `huy` vào stdin; quá `hanHuyMs` chưa thoát thì SIGKILL cả
   * nhóm. `ngay = true` (extension tắt — hẹn giờ có thể không kịp chạy) thì SIGKILL luôn.
   * Promise xong khi tiến trình đã đóng hẳn.
   */
  huy(ngay = false): Promise<void> {
    const xongRoi = new Promise<void>((r) => {
      if (this.xong) r();
      else this.con.once('close', () => r());
    });
    if (this.pid === undefined || this.daThoat) return xongRoi;
    if (ngay) {
      gietNhom(this.pid, 'SIGKILL');
      return xongRoi;
    }
    try {
      this.con.stdin?.write('huy\n');
    } catch {
      /* đã đóng */
    }
    const hen = setTimeout(() => {
      if (this.pid !== undefined && !this.daThoat) {
        this.o.ghi(`[tai-nghe] không thoát sau \`huy\` ${this.o.hanHuyMs ?? HAN_HUY_MS} ms — SIGKILL nhóm ${this.pid}`);
        gietNhom(this.pid, 'SIGKILL');
      }
    }, this.o.hanHuyMs ?? HAN_HUY_MS);
    void xongRoi.then(() => clearTimeout(hen));
    return xongRoi;
  }

  private ketThuc(ma: number | null, tin: NodeJS.Signals | null): void {
    if (this.xong) return;
    this.xong = true;
    if (this.henCung) clearTimeout(this.henCung);
    this.henCung = null;
    this.o.khiXong({ ma, tin, loiSpawn: this.loiSpawn, stderr: this.duoiLoi.trim().split('\n').slice(-3).join(' · ') });
  }
}

/** Kiểm trước khi spawn: lệnh pnpm dùng được + root có `scripts/tai-nghe.mjs`. */
export function kiemTruocKhiBat(c: Pick<CauHinh, 'root' | 'pnpm'>): { ok: true; cmd: string } | { ok: false; loi: string } {
  if (!c.root) return { ok: false, loi: 'Chưa thấy repo Gen-Stage (đặt genStage.root).' };
  if (!fs.existsSync(path.join(c.root, FILE_TAI_NGHE))) {
    return { ok: false, loi: `Repo ${c.root} chưa có ${FILE_TAI_NGHE} — cần bản Gen-Stage có V2 (tai-nghe).` };
  }
  const cmd = timLenh(c.pnpm);
  if (!cmd) return { ok: false, loi: `genStage.pnpm "${c.pnpm}" không dùng được — chỉ nhận tên lệnh có trong PATH hoặc đường dẫn tuyệt đối.` };
  return { ok: true, cmd };
}
