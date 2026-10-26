/**
 * tien-trinh.ts — bật/tắt `pnpm bridge` + vite cho extension.
 *
 * Luật (kế hoạch V0 §2.5 + CNS-012 + review bảo mật 26/10):
 *  1. Dò cổng trước. Đã có ai nghe → dùng lại, KHÔNG BAO GIỜ giết tiến trình
 *     mình không bật.
 *  2. Tự bật thì `detached: true` (nhóm tiến trình riêng) — pnpm đẻ thêm
 *     tsx/vite, nên tắt phải giết cả nhóm bằng PID âm, và chỉ khi nhóm đó vẫn
 *     đúng là nhóm mình bật (pgid === pid, starttime khớp).
 *  3. Vite bị ép `--host 127.0.0.1 --strictPort` (vite.config.ts để `host: true`
 *     = mở ra cả LAN).
 *  4. Sổ PID nằm trong thư mục storage của extension (KHÔNG trong repo). Nhận
 *     lại quyền sở hữu chỉ khi: pid > 1, không phải chính mình, cùng boot_id,
 *     cùng starttime (chống PID tái sử dụng), cwd === root, argv khớp chữ ký
 *     tính TỪ MÃ (không tin chuỗi trong file), là trưởng nhóm, và cửa sổ chủ
 *     cũ đã chết.
 *  5. `batNeuCan` single-flight: gọi chồng nhau thì dùng chung một lượt.
 *  6. stdout/stderr con ghi thẳng vào file log (fd) — host chết thì con không
 *     chết theo vì EPIPE; host tail file đó ra OutputChannel.
 *
 *  7. V1 — driver não (`genStage.nao`: `pnpm nao-local` | `pnpm nao`) dùng CHUNG
 *     cơ chế trên (sổ PID, nhóm tiến trình, chữ ký argv, chủ sở hữu). Chỉ MỘT
 *     driver não cho một bridge: driver lạ (Sếp tự bật, `chay.sh`, cửa sổ khác)
 *     đang nối cùng cổng thì KHÔNG bật thêm và không giết nó; đổi setting thì
 *     tắt cái CỦA MÌNH trước rồi mới bật cái mới. Các thao tác não xếp hàng nối
 *     tiếp (đổi setting liên tục không bật chồng hai driver).
 *
 * Không import `vscode`: nhận một hàm `ghi` để đổ log ra OutputChannel.
 * Giả định Linux (đọc `/proc`) — Q2 đã chốt.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAY, type CauHinh, type CheDoNao } from './cau-hinh';
import { coNgheTcp, doSanKhau, doiToi, type KetQuaDoSanKhau } from './do-cong';

/** Dịch vụ nền (cổng nghe) — `batNeuCan`/`nhanLai` chỉ lo hai cái này. */
export type DichVuNen = 'bridge' | 'vite';
export type TenDichVu = DichVuNen | 'nao';
const DICH_VU: readonly DichVuNen[] = ['bridge', 'vite'];

export interface LenhChay {
  cmd: string;
  args: string[];
  env: Record<string, string>;
}

export function lenhBridge(c: Pick<CauHinh, 'pnpm' | 'bridgePort' | 'ttsPort'>): LenhChay {
  return {
    cmd: c.pnpm,
    args: ['bridge'],
    env: { GEN_STAGE_PORT: String(c.bridgePort), GEN_STAGE_TTS_PORT: String(c.ttsPort) },
  };
}

export function lenhVite(c: Pick<CauHinh, 'pnpm' | 'devPort'>): LenhChay {
  return {
    cmd: c.pnpm,
    args: ['exec', 'vite', '--host', MAY, '--port', String(c.devPort), '--strictPort'],
    env: {},
  };
}

/**
 * V1 — lệnh driver não theo setting. `pnpm nao-local` chạy `tsx scripts/nao-local.mjs`
 * (file import TS — KHÔNG chạy bằng `node` trơn), `pnpm nao` chạy `scripts/nao-agy.mjs`.
 * `GEN_STAGE_PORT` = cổng bridge của cấu hình (cả hai driver đọc biến này).
 */
export function lenhNao(c: Pick<CauHinh, 'pnpm' | 'bridgePort' | 'nao'>): LenhChay | null {
  if (c.nao === 'tat') return null;
  return {
    cmd: c.pnpm,
    args: [c.nao === 'local' ? 'nao-local' : 'nao'],
    env: { GEN_STAGE_PORT: String(c.bridgePort) },
  };
}

/** argv có phải một driver não (nao-agy / nao-local) không — chạy thẳng, qua node hay tsx. */
export function laArgvDriverNao(argv: readonly string[]): boolean {
  return argv.some((a) => /(^|\/)nao-(agy|local)\.mjs$/.test(a));
}

function docEnv(pid: number): Record<string, string> {
  try {
    const ra: Record<string, string> = {};
    for (const dong of fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) {
      const i = dong.indexOf('=');
      if (i > 0) ra[dong.slice(0, i)] = dong.slice(i + 1);
    }
    return ra;
  } catch {
    return {};
  }
}

/**
 * Driver não ĐANG CHẠY nối cùng cổng bridge, không thuộc nhóm tiến trình
 * `boQuaNhom` (nhóm của chính mình). Đọc `/proc` (như `pgrep`): argv khớp
 * `nao-(agy|local).mjs` + `GEN_STAGE_PORT` (mặc định 8787) trùng cổng.
 */
export function timDriverNaoNgoai(bridgePort: number, boQuaNhom?: number): number[] {
  const ra: number[] = [];
  let ds: string[];
  try {
    ds = fs.readdirSync('/proc');
  } catch {
    return ra;
  }
  for (const d of ds) {
    if (!/^\d+$/.test(d)) continue;
    const pid = Number(d);
    if (pid === process.pid) continue;
    if (!laArgvDriverNao(docArgv(pid))) continue;
    const st = docStat(pid);
    if (!st || st.trangThai === 'Z') continue;
    if (boQuaNhom !== undefined && st.pgrp === boQuaNhom) continue;
    if ((docEnv(pid).GEN_STAGE_PORT ?? '8787') !== String(bridgePort)) continue;
    ra.push(pid);
  }
  return ra;
}

export type TrangThaiNao = 'tat' | 'dang-chay' | 'cua-ngoai' | 'loi';

export interface KetQuaNao {
  trangThai: TrangThaiNao;
  cheDo: CheDoNao;
  /** Lý do (chưa bật / driver ngoài / lỗi) — hiện cho Sếp đọc. */
  lyDo: string;
}

export interface TinhTrangCong {
  bridge: boolean;
  sanKhau: KetQuaDoSanKhau;
}

export interface KeHoach {
  batBridge: boolean;
  batVite: boolean;
  /** Lý do không bật được / không nên bật — hiện cho Sếp đọc. */
  canhBao: string[];
}

/** Quyết định thuần: cần bật gì, dựa trên kết quả dò cổng. */
export function keHoachBat(tt: TinhTrangCong, tuBat: boolean, coRoot: boolean): KeHoach {
  const canhBao: string[] = [];
  const thieuBridge = !tt.bridge;
  const thieuVite = tt.sanKhau === 'khong-co';
  if (tt.sanKhau === 'app-khac') {
    canhBao.push('Cổng sân khấu đang bị một app KHÁC chiếm (không phải Gen-Stage) — không bật vite, đổi genStage.devPort.');
  }
  if ((thieuBridge || thieuVite) && !tuBat) {
    canhBao.push('genStage.tuBat đang tắt — tự chạy `pnpm bridge` và `pnpm dev` trong repo Gen-Stage.');
    return { batBridge: false, batVite: false, canhBao };
  }
  if ((thieuBridge || thieuVite) && !coRoot) {
    canhBao.push('Không tìm thấy repo Gen-Stage (thư mục có bridge/server.ts) — đặt genStage.root.');
    return { batBridge: false, batVite: false, canhBao };
  }
  return { batBridge: thieuBridge, batVite: thieuVite, canhBao };
}

/* ------------------------------------------------------------ đọc /proc */

interface StatProc {
  trangThai: string;
  pgrp: number;
  starttime: string;
}

/** `/proc/<pid>/stat`: trạng thái (field 3), pgrp (field 5), starttime (field 22). */
export function docStat(pid: number): StatProc | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = st.slice(st.lastIndexOf(')') + 2).trim().split(' ');
    const trangThai = f[0] ?? '';
    const pgrp = Number(f[2]);
    const starttime = f[19] ?? '';
    if (!trangThai || !Number.isInteger(pgrp) || !/^\d+$/.test(starttime)) return null;
    return { trangThai, pgrp, starttime };
  } catch {
    return null;
  }
}

let bootIdDem: string | undefined;
/** `/proc/sys/kernel/random/boot_id` — đổi sau mỗi lần khởi động máy. */
export function bootId(): string {
  if (bootIdDem === undefined) {
    try {
      bootIdDem = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    } catch {
      bootIdDem = '';
    }
  }
  return bootIdDem;
}

/** PID được phép đụng tới: > 1 (0/-1/1 là nhóm/tất cả/init) và không phải chính mình. */
export function pidHopLe(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 1 && pid !== process.pid;
}

/**
 * PID còn sống không (signal 0 chỉ kiểm, không gửi gì). Zombie hoặc không đọc
 * được `/proc/<pid>/stat` đều tính là chết — không bao giờ "đọc hỏng → coi là sống".
 */
export function conSong(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    // ESRCH = không còn; EPERM = có nhưng của user khác → đều không phải của mình
    return false;
  }
  const st = docStat(pid);
  return !!st && st.trangThai !== 'Z';
}

/** Danh tính một tiến trình: PID + starttime (PID có thể bị tái sử dụng, cặp này thì không). */
export interface DanhTinh {
  pid: number;
  starttime: string;
}

export function danhTinhCua(pid: number): DanhTinh | null {
  const st = docStat(pid);
  return st ? { pid, starttime: st.starttime } : null;
}

/** Đúng tiến trình đó còn sống (không phải PID khác trùng số). */
export function laDungTienTrinh(d: DanhTinh): boolean {
  return conSong(d.pid) && docStat(d.pid)?.starttime === d.starttime;
}

export function docArgv(pid: number): string[] {
  try {
    const a = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    if (a.length && a[a.length - 1] === '') a.pop();
    return a;
  } catch {
    return [];
  }
}

function realpathAnToan(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * argv thật có đúng là `<cmd> <args...>` không. Phần đuôi phải TRÙNG HẲN `args`;
 * phần tử ngay trước là `cmd` (pnpm là script shebang nên argv[0] là node/bash).
 */
export function khopChuKy(argv: readonly string[], cmd: string, args: readonly string[]): boolean {
  const n = args.length;
  if (argv.length < n + 1) return false;
  for (let i = 0; i < n; i++) if (argv[argv.length - n + i] !== args[i]) return false;
  const c = argv[argv.length - n - 1] ?? '';
  if (!c || !cmd) return false;
  if (c === cmd) return true;
  const a = realpathAnToan(c);
  return a !== null && a === realpathAnToan(cmd);
}

/**
 * `genStage.pnpm` → đường dẫn tuyệt đối chạy được, hoặc null.
 *  - đường dẫn tuyệt đối: dùng thẳng (phải là file chạy được)
 *  - tên trơn (không có `/`): tìm trong các thư mục TUYỆT ĐỐI của PATH — bỏ qua
 *    mục rỗng/tương đối, để workspace không cài được một `pnpm` giả vào cwd
 *  - đường dẫn tương đối (`./x`, `a/b`): từ chối
 */
export function timLenh(ten: string, PATH = process.env.PATH ?? ''): string | null {
  const laChayDuoc = (f: string): boolean => {
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  if (!ten) return null;
  if (path.isAbsolute(ten)) return laChayDuoc(ten) ? ten : null;
  if (ten.includes('/') || ten === '.' || ten === '..') return null;
  for (const d of PATH.split(path.delimiter)) {
    if (!d || !path.isAbsolute(d)) continue;
    const f = path.join(d, ten);
    if (laChayDuoc(f)) return f;
  }
  return null;
}

/* --------------------------------------------------------------- sổ PID */

interface MucSo {
  pid: number;
  starttime: string;
  bootId: string;
  root: string;
  chu: DanhTinh;
  luc: string;
}

interface SoSoHuu {
  phienBan: 1;
  dichVu: Record<string, MucSo>;
}

function laMucSo(v: unknown): v is MucSo {
  const m = v as MucSo;
  return (
    !!m &&
    typeof m === 'object' &&
    typeof m.pid === 'number' &&
    typeof m.starttime === 'string' &&
    typeof m.bootId === 'string' &&
    typeof m.root === 'string' &&
    !!m.chu &&
    typeof m.chu.pid === 'number' &&
    typeof m.chu.starttime === 'string'
  );
}

export type KetQuaNhanLai = 'nhan' | 'cua-khac' | 'khong';

export interface TuyChonQuanLy {
  /** Thư mục storage của extension (globalStorageUri) — sổ + log nằm ở đây. */
  thuMuc: string;
  /** Danh tính chủ sở hữu (extension host). Mặc định: chính tiến trình này. */
  chu?: DanhTinh;
  /**
   * Hỏi trước khi bật thật (workspace trust, xác nhận root…). Trả null = được
   * bật, chuỗi = lý do không bật. Chỉ gọi khi kế hoạch thật sự cần bật.
   */
  choPhepBat?: () => Promise<string | null>;
  /** Hạn đợi cổng lên mỗi dịch vụ (ms). */
  hanDoiMs?: number;
  /** V1 — đợi bao lâu sau khi bật driver não để bắt "chết ngay" (ms, mặc định 1500). */
  hanDoiNaoMs?: number;
}

interface CuaMinh {
  pid: number;
  starttime: string;
  con?: ChildProcess;
  /** args đã bật (driver não: biết đang chạy `nao-local` hay `nao`). */
  args?: string[];
}

interface Tail {
  file: string;
  offset: number;
  du: string;
  hen: ReturnType<typeof setInterval>;
}

export class QuanLyTienTrinh {
  private cuaMinh = new Map<TenDichVu, CuaMinh>();
  private tail = new Map<TenDichVu, Tail>();
  private dangBat: Promise<{ tt: TinhTrangCong; canhBao: string[] }> | null = null;
  private readonly chu: DanhTinh;

  constructor(
    private cfg: CauHinh,
    private ghi: (dong: string) => void,
    private readonly o: TuyChonQuanLy,
  ) {
    this.chu = o.chu ?? danhTinhCua(process.pid) ?? { pid: process.pid, starttime: '' };
  }

  datCauHinh(cfg: CauHinh): void {
    this.cfg = cfg;
  }

  fileSo(): string {
    return path.join(this.o.thuMuc, 'tien-trinh.json');
  }

  fileLog(ten: TenDichVu): string {
    return path.join(this.o.thuMuc, 'logs', `${ten}-${this.cong(ten)}.log`);
  }

  private cong(ten: TenDichVu): number {
    // driver não không nghe cổng nào — khoá theo cổng bridge nó nối tới
    return ten === 'vite' ? this.cfg.devPort : this.cfg.bridgePort;
  }

  /** Khoá sổ theo dịch vụ + cổng: hai cửa sổ cấu hình cổng khác nhau không giẫm nhau. */
  private khoa(ten: TenDichVu): string {
    return `${ten}@${this.cong(ten)}`;
  }

  private lenh(ten: TenDichVu, nao: CheDoNao = this.cfg.nao): LenhChay | null {
    const cmd = timLenh(this.cfg.pnpm);
    if (!cmd) return null;
    const l = ten === 'bridge' ? lenhBridge(this.cfg) : ten === 'vite' ? lenhVite(this.cfg) : lenhNao({ ...this.cfg, nao });
    return l ? { ...l, cmd } : null;
  }

  private laToi(d: DanhTinh): boolean {
    return d.pid === this.chu.pid && d.starttime === this.chu.starttime;
  }

  private docSo(): SoSoHuu {
    try {
      const so = JSON.parse(fs.readFileSync(this.fileSo(), 'utf8')) as Partial<SoSoHuu>;
      const dichVu: Record<string, MucSo> = {};
      for (const [k, v] of Object.entries(so?.dichVu ?? {})) if (laMucSo(v)) dichVu[k] = v;
      return { phienBan: 1, dichVu };
    } catch {
      return { phienBan: 1, dichVu: {} };
    }
  }

  /** Đọc–sửa–ghi: chỉ đụng mục của mình; dọn mục mà tiến trình đã chết / khác boot. */
  private luuSo(): void {
    const so = this.docSo();
    const boot = bootId();
    for (const [k, v] of Object.entries(so.dichVu)) {
      const conDung = v.bootId === boot && laDungTienTrinh({ pid: v.pid, starttime: v.starttime });
      if (!conDung || this.laToi(v.chu)) delete so.dichVu[k];
    }
    for (const [ten, v] of this.cuaMinh) {
      so.dichVu[this.khoa(ten)] = {
        pid: v.pid,
        starttime: v.starttime,
        bootId: boot,
        root: this.cfg.root,
        chu: this.chu,
        luc: new Date().toISOString(),
      };
    }
    const f = this.fileSo();
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
      const tam = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tam, JSON.stringify(so, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tam, f);
    } catch (e) {
      this.ghi(`[tiến trình] không ghi được ${f}: ${(e as Error).message}`);
    }
  }

  /** Mục sổ có đúng là tiến trình mình (hoặc một cửa sổ khác) bật không — mọi điều kiện, không tin file. */
  private xetMuc(ten: TenDichVu, v: MucSo, l = this.lenh(ten)): { kq: KetQuaNhanLai; lyDo: string } {
    const khong = (lyDo: string): { kq: KetQuaNhanLai; lyDo: string } => ({ kq: 'khong', lyDo });
    if (!pidHopLe(v.pid)) return khong(`pid ${String(v.pid)} không hợp lệ`);
    if (!v.bootId || v.bootId !== bootId()) return khong('khác lần khởi động máy');
    if (!laDungTienTrinh({ pid: v.pid, starttime: v.starttime })) return khong('tiến trình đã chết hoặc PID bị tái sử dụng');
    if (docStat(v.pid)?.pgrp !== v.pid) return khong('không phải trưởng nhóm tiến trình');
    const goc = this.cfg.root ? realpathAnToan(this.cfg.root) : null;
    if (!goc || realpathAnToan(`/proc/${v.pid}/cwd`) !== goc) return khong('cwd khác root');
    if (!l || !khopChuKy(docArgv(v.pid), l.cmd, l.args)) return khong('dòng lệnh không khớp chữ ký');
    if (!this.laToi(v.chu) && laDungTienTrinh(v.chu)) {
      return { kq: 'cua-khac', lyDo: `cửa sổ VS Code khác (extension host pid ${v.chu.pid}) đang giữ` };
    }
    return { kq: 'nhan', lyDo: '' };
  }

  /**
   * CNS-012 — cửa sổ bật trước đã chết mà chưa kịp tắt: nhận lại nếu còn đúng
   * là nó. Cửa sổ chủ còn sống thì KHÔNG nhận (chỉ dùng lại dịch vụ).
   */
  nhanLai(): Record<DichVuNen, KetQuaNhanLai> {
    const ra: Record<DichVuNen, KetQuaNhanLai> = { bridge: 'khong', vite: 'khong' };
    const so = this.docSo();
    for (const ten of DICH_VU) {
      if (this.cuaMinh.has(ten)) {
        ra[ten] = 'nhan';
        continue;
      }
      const v = so.dichVu[this.khoa(ten)];
      if (!v) continue;
      const { kq, lyDo } = this.xetMuc(ten, v);
      ra[ten] = kq;
      if (kq === 'nhan') {
        this.cuaMinh.set(ten, { pid: v.pid, starttime: v.starttime });
        this.batTail(ten, true);
        this.ghi(`[tiến trình] nhận lại ${ten} (pid ${v.pid}) — chủ cũ đã tắt`);
      } else {
        this.ghi(`[tiến trình] không nhận ${ten} (pid ${String(v.pid)}): ${lyDo}`);
      }
    }
    this.luuSo();
    return ra;
  }

  laCuaMinh(ten: TenDichVu): boolean {
    return this.cuaMinh.has(ten);
  }

  async doCong(): Promise<TinhTrangCong> {
    const [bridge, sanKhau] = await Promise.all([
      coNgheTcp(this.cfg.bridgePort, MAY),
      doSanKhau(this.cfg.devPort, MAY),
    ]);
    return { bridge, sanKhau };
  }

  /**
   * Dò + bật cái còn thiếu, đợi cổng lên (tối đa 30 s mỗi dịch vụ, thoát sớm
   * nếu tiến trình chết). Single-flight: gọi chồng nhau thì dùng chung một lượt.
   */
  batNeuCan(): Promise<{ tt: TinhTrangCong; canhBao: string[] }> {
    if (!this.dangBat) {
      this.dangBat = this.batThat().finally(() => {
        this.dangBat = null;
      });
    }
    return this.dangBat;
  }

  private async batThat(): Promise<{ tt: TinhTrangCong; canhBao: string[] }> {
    const nl = this.nhanLai();
    const tt = await this.doCong();
    this.ghi(`[tiến trình] dò cổng: bridge ${this.cfg.bridgePort}=${tt.bridge ? 'có' : 'không'} · sân khấu ${this.cfg.devPort}=${tt.sanKhau}`);
    let kh = keHoachBat(tt, this.cfg.tuBat, !!this.cfg.root);
    // cửa sổ khác đang bật (cổng chưa kịp lên) → không bật đôi, chỉ chờ
    const choCuaKhac = { bridge: kh.batBridge && nl.bridge === 'cua-khac', vite: kh.batVite && nl.vite === 'cua-khac' };
    kh = { ...kh, batBridge: kh.batBridge && !choCuaKhac.bridge, batVite: kh.batVite && !choCuaKhac.vite };
    if (kh.batBridge || kh.batVite) {
      let lyDo: string | null = null;
      if (!timLenh(this.cfg.pnpm)) {
        lyDo = `genStage.pnpm "${this.cfg.pnpm}" không dùng được — chỉ nhận tên lệnh có trong PATH hoặc đường dẫn tuyệt đối.`;
      } else if (this.o.choPhepBat) {
        lyDo = await this.o.choPhepBat();
      }
      if (lyDo) kh = { batBridge: false, batVite: false, canhBao: [...kh.canhBao, lyDo] };
    }
    for (const c of kh.canhBao) this.ghi(`[tiến trình] ${c}`);
    const han = this.o.hanDoiMs ?? 30000;
    const cho: Promise<boolean>[] = [];
    const doiDichVu = (ten: TenDichVu, chet: { daChet: boolean } | null): void => {
      const kiem =
        ten === 'bridge'
          ? () => coNgheTcp(this.cfg.bridgePort, MAY)
          : async () => (await doSanKhau(this.cfg.devPort, MAY)) === 'gen-stage';
      cho.push(doiToi(async () => (chet?.daChet ?? false) || (await kiem()), han));
    };
    if (kh.batBridge || choCuaKhac.bridge) doiDichVu('bridge', kh.batBridge ? this.bat('bridge') : null);
    if (kh.batVite || choCuaKhac.vite) doiDichVu('vite', kh.batVite ? this.bat('vite') : null);
    await Promise.all(cho);
    const sau = cho.length ? await this.doCong() : tt;
    return { tt: sau, canhBao: kh.canhBao };
  }

  /* ------------------------------------------------------- V1: driver não */

  private chuoiNao: Promise<unknown> = Promise.resolve();

  /**
   * Đưa driver não về đúng setting `genStage.nao`. Nối tiếp (hàng đợi): gọi
   * chồng nhau thì chạy lần lượt, không bao giờ hai lượt cùng bật.
   *  - `tat` → tắt driver CỦA MÌNH (nếu có);
   *  - cùng chế độ đang chạy → giữ nguyên;
   *  - khác chế độ → tắt cái của mình, đợi chết hẳn, rồi bật cái mới;
   *  - có driver ngoài cùng cổng bridge → KHÔNG bật (chỉ một driver), không giết nó.
   * `choPhepBat` (workspace trust + root) hỏi y như bridge/vite.
   */
  dongBoNao(): Promise<KetQuaNao> {
    const lan = this.chuoiNao.then(() => this.dongBoNaoThat());
    this.chuoiNao = lan.catch(() => undefined);
    return lan;
  }

  private async dongBoNaoThat(): Promise<KetQuaNao> {
    const cheDo = this.cfg.nao;
    const kq = (trangThai: TrangThaiNao, lyDo = ''): KetQuaNao => {
      if (lyDo) this.ghi(`[não] ${lyDo}`);
      return { trangThai, cheDo, lyDo };
    };
    const l = this.lenh('nao');
    this.nhanLaiNao();
    const cu = this.cuaMinh.get('nao');
    if (cu && laDungTienTrinh(cu)) {
      if (l && cu.args && cu.args.join(' ') === l.args.join(' ')) return kq('dang-chay');
      this.ghi(`[não] đổi chế độ → tắt driver cũ của mình (${cu.args?.join(' ') ?? '?'}, nhóm ${cu.pid})`);
      await this.tatMot('nao');
    }
    if (cheDo === 'tat') return kq('tat');
    const ngoai = timDriverNaoNgoai(this.cfg.bridgePort);
    if (ngoai.length) {
      return kq('cua-ngoai', `đã có driver não khác nối bridge ${this.cfg.bridgePort} (pid ${ngoai.join(', ')}) — không bật thêm (chỉ một driver).`);
    }
    if (!l) return kq('loi', `genStage.pnpm "${this.cfg.pnpm}" không dùng được — không bật được driver não.`);
    if (!this.cfg.root) return kq('loi', 'Không tìm thấy repo Gen-Stage (genStage.root) — không bật được driver não.');
    const lyDo = this.o.choPhepBat ? await this.o.choPhepBat() : null;
    if (lyDo) return kq('loi', lyDo);
    const tt = this.bat('nao');
    // driver chết ngay (thiếu script, thiếu Ollama…) thì báo lỗi luôn, không nói "đang chạy"
    await doiToi(async () => tt.daChet, this.o.hanDoiNaoMs ?? 1500, 100);
    if (tt.daChet) return kq('loi', `driver não (${l.args.join(' ')}) thoát ngay — xem log ${this.fileLog('nao')}`);
    return kq('dang-chay');
  }

  /** Sổ có driver não (cửa sổ trước đã chết) đúng chữ ký `nao-local` HOẶC `nao` → nhận lại để quản lý/tắt được. */
  private nhanLaiNao(): void {
    if (this.cuaMinh.has('nao')) return;
    const v = this.docSo().dichVu[this.khoa('nao')];
    if (!v) return;
    for (const che of ['local', 'agy'] as const) {
      const l = this.lenh('nao', che);
      if (!l) continue;
      const { kq } = this.xetMuc('nao', v, l);
      if (kq === 'nhan') {
        this.cuaMinh.set('nao', { pid: v.pid, starttime: v.starttime, args: l.args });
        this.batTail('nao', true);
        this.ghi(`[tiến trình] nhận lại nao (${l.args.join(' ')}, pid ${v.pid}) — chủ cũ đã tắt`);
        this.luuSo();
        return;
      }
    }
  }

  /** Tắt một dịch vụ của mình (cả nhóm) và đợi nó chết hẳn (≤ 5 s). */
  private async tatMot(ten: TenDichVu): Promise<void> {
    const v = this.cuaMinh.get(ten);
    if (!v) return;
    this.docTail(ten);
    this.dungTail(ten);
    this.cuaMinh.delete(ten);
    if (pidHopLe(v.pid) && laDungTienTrinh(v) && docStat(v.pid)?.pgrp === v.pid) {
      try {
        process.kill(-v.pid, 'SIGTERM');
        this.ghi(`[tiến trình] đã gửi SIGTERM: ${ten} (nhóm ${v.pid})`);
      } catch (e) {
        this.ghi(`[tiến trình] không tắt được ${ten} (nhóm ${v.pid}): ${(e as Error).message}`);
      }
      await doiToi(async () => !laDungTienTrinh(v), 5000, 50);
    }
    this.luuSo();
  }

  /** Bật một dịch vụ. Trả cờ `daChet` (bật lỗi / thoát) để bên đợi thoát sớm. */
  private bat(ten: TenDichVu): { daChet: boolean } {
    const trangThai = { daChet: false };
    const cu = this.cuaMinh.get(ten);
    if (cu && laDungTienTrinh(cu)) {
      this.ghi(`[tiến trình] ${ten} của mình (pid ${cu.pid}) vẫn sống — không bật thêm`);
      return trangThai;
    }
    const l = this.lenh(ten);
    if (!l) {
      trangThai.daChet = true;
      return trangThai;
    }
    const fileLog = this.fileLog(ten);
    let fd: number;
    try {
      fs.mkdirSync(path.dirname(fileLog), { recursive: true, mode: 0o700 });
      fd = fs.openSync(fileLog, 'w', 0o600);
    } catch (e) {
      this.ghi(`[tiến trình] LỖI mở log ${fileLog}: ${(e as Error).message}`);
      trangThai.daChet = true;
      return trangThai;
    }
    this.ghi(`[tiến trình] bật ${ten}: ${l.cmd} ${l.args.join(' ')} (cwd ${this.cfg.root}, log ${fileLog})`);
    let con: ChildProcess;
    try {
      con = spawn(l.cmd, l.args, {
        cwd: this.cfg.root,
        detached: true,
        env: { ...process.env, ...l.env },
        // fd file, KHÔNG pipe: host chết thì con không ăn EPIPE mà chết theo
        stdio: ['ignore', fd, fd],
      });
    } catch (e) {
      this.ghi(`[tiến trình] LỖI bật ${ten}: ${(e as Error).message}`);
      trangThai.daChet = true;
      return trangThai;
    } finally {
      fs.closeSync(fd);
    }
    con.on('error', (e) => {
      trangThai.daChet = true;
      this.ghi(`[tiến trình] LỖI ${ten}: ${e.message} (kiểm genStage.pnpm / PATH)`);
    });
    con.on('exit', (ma, tin) => {
      trangThai.daChet = true;
      this.docTail(ten);
      this.ghi(`[${ten}] thoát (mã ${ma ?? '-'}${tin ? ' · ' + tin : ''})`);
      const v = this.cuaMinh.get(ten);
      if (v && v.pid === con.pid) {
        this.cuaMinh.delete(ten);
        this.dungTail(ten);
        this.luuSo();
      }
    });
    const dt = con.pid !== undefined ? danhTinhCua(con.pid) : null;
    if (dt) {
      this.cuaMinh.set(ten, { ...dt, con, args: l.args });
      this.batTail(ten, false);
      this.luuSo();
    }
    return trangThai;
  }

  /* ------------------------------------------------- tail file log → ghi */

  private batTail(ten: TenDichVu, tuCuoi: boolean): void {
    this.dungTail(ten);
    const file = this.fileLog(ten);
    let offset = 0;
    if (tuCuoi) {
      try {
        offset = fs.statSync(file).size;
      } catch {
        offset = 0;
      }
    }
    const hen = setInterval(() => this.docTail(ten), 400);
    hen.unref();
    this.tail.set(ten, { file, offset, du: '', hen });
  }

  private docTail(ten: TenDichVu): void {
    const t = this.tail.get(ten);
    if (!t) return;
    let fd: number | undefined;
    try {
      fd = fs.openSync(t.file, 'r');
      const size = fs.fstatSync(fd).size;
      if (size < t.offset) t.offset = 0; // bị bật lại và cắt file
      if (size === t.offset) return;
      const buf = Buffer.alloc(Math.min(size - t.offset, 1024 * 1024));
      const n = fs.readSync(fd, buf, 0, buf.length, t.offset);
      t.offset += n;
      const chu = t.du + buf.subarray(0, n).toString('utf8');
      const dong = chu.split('\n');
      t.du = dong.pop() ?? '';
      for (const d of dong) if (d.trim()) this.ghi(`[${ten}] ${d}`);
    } catch {
      /* file chưa có / vừa bị xoá — lượt sau đọc lại */
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }

  private dungTail(ten: TenDichVu): void {
    const t = this.tail.get(ten);
    if (!t) return;
    clearInterval(t.hen);
    if (t.du.trim()) this.ghi(`[${ten}] ${t.du}`);
    this.tail.delete(ten);
  }

  /** Tắt CHỈ những gì mình bật — cả nhóm tiến trình (PID âm), sau khi kiểm lại danh tính. */
  tatCuaMinh(): string[] {
    const da: string[] = [];
    for (const [ten, v] of this.cuaMinh) {
      this.docTail(ten);
      this.dungTail(ten);
      if (!pidHopLe(v.pid) || !laDungTienTrinh(v) || docStat(v.pid)?.pgrp !== v.pid) {
        this.ghi(`[tiến trình] bỏ qua ${ten} (pid ${v.pid}): không còn đúng là nhóm mình bật`);
        continue;
      }
      try {
        process.kill(-v.pid, 'SIGTERM');
        da.push(`${ten} (nhóm ${v.pid})`);
      } catch (e) {
        this.ghi(`[tiến trình] không tắt được ${ten} (nhóm ${v.pid}): ${(e as Error).message}`);
      }
    }
    this.cuaMinh.clear();
    this.luuSo();
    if (da.length) this.ghi(`[tiến trình] đã gửi SIGTERM: ${da.join(', ')}`);
    return da;
  }

  /** Dừng mọi tail (khi deactivate mà không tắt tiến trình). */
  dungHet(): void {
    for (const ten of [...this.tail.keys()]) this.dungTail(ten);
  }
}
