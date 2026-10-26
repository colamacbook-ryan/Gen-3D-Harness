/**
 * tien-trinh.ts — bật/tắt `pnpm bridge` + vite cho extension.
 *
 * Luật (kế hoạch V0 §2.5 + CNS-012):
 *  1. Dò cổng trước. Đã có ai nghe → dùng lại, KHÔNG BAO GIỜ giết tiến trình
 *     mình không bật.
 *  2. Tự bật thì `detached: true` (nhóm tiến trình riêng) — pnpm đẻ thêm
 *     tsx/vite, nên tắt phải giết cả nhóm bằng PID âm.
 *  3. Vite bị ép `--host 127.0.0.1 --strictPort` (vite.config.ts để `host: true`
 *     = mở ra cả LAN).
 *  4. PID mình bật được ghi vào `.cache/vscode/tien-trinh.json`; extension host
 *     chết ngang thì lần kích hoạt sau nhận lại quyền (PID còn sống + dòng lệnh
 *     khớp), không để mồ côi vĩnh viễn.
 *
 * Không import `vscode`: nhận một hàm `ghi` để đổ log ra OutputChannel.
 * Giả định Linux (đọc `/proc/<pid>/cmdline`) — Q2 đã chốt.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAY, type CauHinh } from './cau-hinh';
import { coNgheTcp, doSanKhau, doiToi, type KetQuaDoSanKhau } from './do-cong';

export type TenDichVu = 'bridge' | 'vite';

export interface LenhChay {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  /** Chuỗi phải có trong `/proc/<pid>/cmdline` để nhận lại quyền sở hữu. */
  dauHieu: string;
}

export function lenhBridge(c: Pick<CauHinh, 'pnpm' | 'bridgePort' | 'ttsPort'>): LenhChay {
  return {
    cmd: c.pnpm,
    args: ['bridge'],
    env: { GEN_STAGE_PORT: String(c.bridgePort), GEN_STAGE_TTS_PORT: String(c.ttsPort) },
    dauHieu: 'bridge',
  };
}

export function lenhVite(c: Pick<CauHinh, 'pnpm' | 'devPort'>): LenhChay {
  return {
    cmd: c.pnpm,
    args: ['exec', 'vite', '--host', MAY, '--port', String(c.devPort), '--strictPort'],
    env: {},
    dauHieu: 'vite',
  };
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

/**
 * PID còn sống không (signal 0 chỉ kiểm, không gửi gì). Tiến trình zombie (đã
 * chết, chờ cha/init dọn — gặp thật trong container có init không dọn) tính là chết.
 */
export function conSong(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return trangThaiProc(pid) !== 'Z';
  } catch {
    // ESRCH = không còn; EPERM = có nhưng của user khác → đều không phải của mình
    return false;
  }
}

/** Ký tự trạng thái trong `/proc/<pid>/stat` (R/S/Z…), rỗng nếu không đọc được. */
function trangThaiProc(pid: number): string {
  try {
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return st.slice(st.lastIndexOf(')') + 2, st.lastIndexOf(')') + 3);
  } catch {
    return '';
  }
}

function docCmdline(pid: number): string {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {
    return '';
  }
}

interface SoSoHuu {
  [ten: string]: { pid: number; dauHieu: string; luc: string } | undefined;
}

export class QuanLyTienTrinh {
  private cuaMinh = new Map<TenDichVu, { pid: number; dauHieu: string; con?: ChildProcess }>();

  constructor(
    private cfg: CauHinh,
    private ghi: (dong: string) => void,
  ) {}

  datCauHinh(cfg: CauHinh): void {
    this.cfg = cfg;
  }

  private fileSo(): string | null {
    return this.cfg.root ? path.join(this.cfg.root, '.cache', 'vscode', 'tien-trinh.json') : null;
  }

  private luuSo(): void {
    const f = this.fileSo();
    if (!f) return;
    const so: SoSoHuu = {};
    for (const [ten, v] of this.cuaMinh) so[ten] = { pid: v.pid, dauHieu: v.dauHieu, luc: new Date().toISOString() };
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(so, null, 2) + '\n');
    } catch (e) {
      this.ghi(`[tiến trình] không ghi được ${f}: ${(e as Error).message}`);
    }
  }

  /** CNS-012 — lần kích hoạt trước bật mà chưa kịp tắt: nhận lại nếu còn đúng là nó. */
  nhanLai(): void {
    const f = this.fileSo();
    if (!f || !fs.existsSync(f)) return;
    let so: SoSoHuu = {};
    try {
      so = JSON.parse(fs.readFileSync(f, 'utf8')) as SoSoHuu;
    } catch {
      return;
    }
    for (const ten of ['bridge', 'vite'] as const) {
      const v = so[ten];
      if (!v || !Number.isInteger(v.pid)) continue;
      if (conSong(v.pid) && docCmdline(v.pid).includes(v.dauHieu)) {
        this.cuaMinh.set(ten, { pid: v.pid, dauHieu: v.dauHieu });
        this.ghi(`[tiến trình] nhận lại ${ten} (pid ${v.pid}) do lần trước bật`);
      }
    }
    this.luuSo();
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
   * Dò + bật cái còn thiếu, đợi cổng lên (tối đa 30 s mỗi dịch vụ).
   * Trả tình trạng cuối cùng sau khi đợi.
   */
  async batNeuCan(): Promise<{ tt: TinhTrangCong; canhBao: string[] }> {
    const tt = await this.doCong();
    this.ghi(`[tiến trình] dò cổng: bridge ${this.cfg.bridgePort}=${tt.bridge ? 'có' : 'không'} · sân khấu ${this.cfg.devPort}=${tt.sanKhau}`);
    const kh = keHoachBat(tt, this.cfg.tuBat, !!this.cfg.root);
    for (const c of kh.canhBao) this.ghi(`[tiến trình] ${c}`);
    if (kh.batBridge) this.bat('bridge', lenhBridge(this.cfg));
    if (kh.batVite) this.bat('vite', lenhVite(this.cfg));
    const cho: Promise<boolean>[] = [];
    if (kh.batBridge) cho.push(doiToi(() => coNgheTcp(this.cfg.bridgePort, MAY), 30000));
    if (kh.batVite) cho.push(doiToi(async () => (await doSanKhau(this.cfg.devPort, MAY)) === 'gen-stage', 30000));
    await Promise.all(cho);
    const sau = kh.batBridge || kh.batVite ? await this.doCong() : tt;
    return { tt: sau, canhBao: kh.canhBao };
  }

  private bat(ten: TenDichVu, l: LenhChay): void {
    this.ghi(`[tiến trình] bật ${ten}: ${l.cmd} ${l.args.join(' ')} (cwd ${this.cfg.root})`);
    let con: ChildProcess;
    try {
      con = spawn(l.cmd, l.args, {
        cwd: this.cfg.root,
        detached: true,
        env: { ...process.env, ...l.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      this.ghi(`[tiến trình] LỖI bật ${ten}: ${(e as Error).message}`);
      return;
    }
    con.on('error', (e) => this.ghi(`[tiến trình] LỖI ${ten}: ${e.message} (kiểm genStage.pnpm / PATH)`));
    con.stdout?.on('data', (b: Buffer) => this.ghiNhieuDong(ten, b));
    con.stderr?.on('data', (b: Buffer) => this.ghiNhieuDong(ten, b));
    con.on('exit', (ma, tin) => {
      this.ghi(`[${ten}] thoát (mã ${ma ?? '-'}${tin ? ' · ' + tin : ''})`);
      const v = this.cuaMinh.get(ten);
      if (v && v.pid === con.pid) {
        this.cuaMinh.delete(ten);
        this.luuSo();
      }
    });
    if (con.pid !== undefined) {
      this.cuaMinh.set(ten, { pid: con.pid, dauHieu: l.dauHieu, con });
      this.luuSo();
    }
  }

  private ghiNhieuDong(ten: string, b: Buffer): void {
    for (const d of b.toString('utf8').split('\n')) if (d.trim()) this.ghi(`[${ten}] ${d}`);
  }

  /** Tắt CHỈ những gì mình bật — cả nhóm tiến trình (PID âm). */
  tatCuaMinh(): string[] {
    const da: string[] = [];
    for (const [ten, v] of this.cuaMinh) {
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
}
