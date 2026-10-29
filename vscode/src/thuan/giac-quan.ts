/**
 * giac-quan.ts — V3 GIÁC QUAN IDE, dạng thuần (không import `vscode`) để test
 * được bằng `node:test`.
 *
 * Sếp code trong VS Code → sân khấu "thấy" việc thật: lưu file, lỗi biên dịch
 * (diagnostics) 0 ⇄ >0, task/test pass/fail, git commit. Mỗi việc thành MỘT lệnh
 * `stage.notice {kind, level, summary, data}` gửi qua ws client của chatroom.
 *
 * RIÊNG TƯ (bất biến): không bao giờ gửi nội dung file, đường dẫn tuyệt đối,
 * message của diagnostics (chỉ ĐẾM), hay biến môi trường. Tên file chỉ là đường
 * tương đối trong workspace; file trong `.git/`, `node_modules/`, ngoài workspace
 * bị bỏ. Workspace chưa tin cậy ⇒ không gửi gì.
 *
 * `extension.ts` chỉ nối sự kiện VS Code vào các phương thức `luuFile` /
 * `doiLoi` / `ketThucTask` / `doiHead` của lớp `GiacQuan` dưới đây.
 */

export type LoaiNotice = 'save' | 'diag' | 'test' | 'task' | 'git';
export type MucNotice = 'info' | 'good' | 'bad';

export interface ThongBao {
  kind: LoaiNotice;
  level: MucNotice;
  summary: string;
  data?: Record<string, unknown>;
}

/** Setting `genStage.giacQuan.*` (scope window). `test` bật/tắt cả task lẫn test. */
export interface CauHinhGiacQuan {
  batTat: boolean;
  save: boolean;
  diag: boolean;
  test: boolean;
  git: boolean;
}

export const GIAC_QUAN_MAC_DINH: CauHinhGiacQuan = { batTat: true, save: true, diag: true, test: true, git: true };

/** Gộp các lần lưu trong cửa sổ này thành một notice (ms, tính từ lần lưu đầu). */
export const MS_GOP_LUU = 5_000;
/** Số lỗi phải đứng yên bấy nhiêu ms mới tính là đổi (diagnostics nhảy liên tục khi gõ). */
export const MS_DEBOUNCE_LOI = 3_000;
/** Tóm tắt tối đa (khớp `TOI_DA_SUMMARY` của `stage.notice`). */
export const TOI_DA_SUMMARY = 200;
/** Tối đa bấy nhiêu tên file trong một notice lưu. */
export const TOI_DA_TEN_FILE = 5;
export const TOI_DA_DONG_COMMIT = 80;
export const TOI_DA_TEN_TASK = 60;

/** Đọc setting thô → cấu hình; giá trị không phải boolean = mặc định (bật). */
export function chuanGiacQuan(doc: (khoa: keyof CauHinhGiacQuan) => unknown): CauHinhGiacQuan {
  const b = (k: keyof CauHinhGiacQuan): boolean => {
    const v = doc(k);
    return typeof v === 'boolean' ? v : GIAC_QUAN_MAC_DINH[k];
  };
  return { batTat: b('batTat'), save: b('save'), diag: b('diag'), test: b('test'), git: b('git') };
}

/** Loại notice có được bật không (`task` theo setting `test`). */
export function loaiDuocBat(c: CauHinhGiacQuan, kind: LoaiNotice): boolean {
  if (!c.batTat) return false;
  return kind === 'task' ? c.test : c[kind];
}

/**
 * Lọc một đường TƯƠNG ĐỐI (kết quả `workspace.asRelativePath(uri, false)` của
 * một file nằm TRONG workspace). Trả đường đã chuẩn hoá `/`, hoặc `null` nếu
 * phải bỏ: rỗng, tuyệt đối (`/…`, `C:\…`, `\\…`, có `scheme:`), có `..`, hoặc
 * nằm trong `.git/` / `node_modules/`.
 */
export function locDuong(rel: string | null | undefined): string | null {
  if (typeof rel !== 'string') return null;
  const s = rel.replace(/\\/g, '/').trim();
  if (!s || s.startsWith('/') || /^[a-zA-Z]:/.test(s) || /^[a-zA-Z][\w+.-]*:/.test(s)) return null;
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  const phan = s.split('/');
  if (phan.some((p) => p === '..' || p === '.git' || p === 'node_modules')) return null;
  return s;
}

/** Cắt chuỗi về `n` ký tự (kèm `…` nếu cắt). */
export function cat(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…';
}

/** "Lưu N file: a.ts, b.ts (+3)" — ≤ 200 ký tự. */
export function tomTatLuu(ten: readonly string[]): ThongBao {
  const hien = ten.slice(0, TOI_DA_TEN_FILE).map((t) => cat(t, 60));
  const them = ten.length > hien.length ? ` (+${ten.length - hien.length})` : '';
  return {
    kind: 'save',
    level: 'info',
    summary: cat(`Lưu ${ten.length} file: ${hien.join(', ')}${them}`, TOI_DA_SUMMARY),
    data: { count: ten.length, files: hien },
  };
}

/** Task/test kết thúc: exit 0 → good, khác 0 → bad; `undefined` (không biết) → null (không gửi). */
export function tomTatTask(ten: string, exitCode: number | undefined, laTest: boolean): ThongBao | null {
  if (typeof exitCode !== 'number' || !Number.isFinite(exitCode)) return null;
  const t = cat(String(ten).replace(/\s+/g, ' ').trim() || '(không tên)', TOI_DA_TEN_TASK);
  const ok = exitCode === 0;
  const viec = laTest ? 'Test' : 'Task';
  return {
    kind: laTest ? 'test' : 'task',
    level: ok ? 'good' : 'bad',
    summary: ok ? `${viec} "${t}" ${laTest ? 'pass' : 'xong'}` : `${viec} "${t}" ${laTest ? 'fail' : 'lỗi'} (mã ${exitCode})`,
    data: { exitCode, name: t },
  };
}

/** Task có phải test không: nhóm `test` (TaskGroup.Test) hoặc tên có chữ "test". */
export function laTaskTest(ten: string, nhomId: string | undefined): boolean {
  return nhomId === 'test' || /\btests?\b/i.test(ten);
}

/** "Commit abc1234: <dòng đầu message, cắt 80>". */
export function tomTatCommit(hash: string, message: string | undefined): ThongBao {
  const ngan = hash.slice(0, 7);
  const dau = cat(String(message ?? '').split(/\r?\n/)[0]!.replace(/\s+/g, ' ').trim(), TOI_DA_DONG_COMMIT);
  return {
    kind: 'git',
    level: 'good',
    summary: dau ? `Commit ${ngan}: ${dau}` : `Commit ${ngan}`,
    data: { commit: ngan },
  };
}

/** Số lỗi đổi: 0→>0 = bad, >0→0 = good, còn lại không gửi. */
export function tomTatLoi(truoc: number, sau: number): ThongBao | null {
  if (truoc === 0 && sau > 0) return { kind: 'diag', level: 'bad', summary: `Có ${sau} lỗi biên dịch`, data: { errors: sau } };
  if (truoc > 0 && sau === 0) return { kind: 'diag', level: 'good', summary: 'Hết lỗi biên dịch', data: { errors: 0, before: truoc } };
  return null;
}

/* ================================================================ máy */

export interface PhuThuocGiacQuan {
  /** Gửi `stage.notice` (ws client của chatroom). */
  gui(tb: ThongBao): Promise<{ ok: boolean; error?: string }>;
  layCfg(): CauHinhGiacQuan;
  /** `workspace.isTrusted` — đọc mỗi lần gửi (Sếp có thể tin cậy giữa chừng). */
  tinCay(): boolean;
  /** Notice đã gửi thành công → chatroom hiện "👁 …". */
  daGui?(tb: ThongBao): void;
  ghi?(dong: string): void;
  hen?: (f: () => void, ms: number) => unknown;
  huy?: (h: unknown) => void;
}

export class GiacQuan {
  private luu = new Set<string>();
  private henLuu: unknown = null;
  /** Số lỗi đã "chốt" lần gần nhất (null = chưa có mốc — lần đầu chỉ ghi mốc, không gửi). */
  private loiChot: number | null = null;
  private loiMoi = 0;
  private demLoi: number | (() => number) = 0;
  private henLoi: unknown = null;
  /** HEAD commit đã thấy theo từng repo (khoá chỉ dùng nội bộ, không gửi đi). */
  private head = new Map<string, string>();
  private hen: (f: () => void, ms: number) => unknown;
  private huy: (h: unknown) => void;

  constructor(private p: PhuThuocGiacQuan) {
    this.hen = p.hen ?? ((f, ms) => setTimeout(f, ms));
    this.huy = p.huy ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Một file vừa lưu. `rel` = đường tương đối trong workspace, `null` = ngoài workspace. */
  luuFile(rel: string | null | undefined): void {
    if (!loaiDuocBat(this.p.layCfg(), 'save')) return;
    const d = locDuong(rel);
    if (!d) return;
    this.luu.add(d);
    if (this.henLuu !== null) return; // cửa sổ cố định từ lần lưu đầu: autosave không đẩy lùi mãi
    this.henLuu = this.hen(() => {
      this.henLuu = null;
      const ds = [...this.luu];
      this.luu.clear();
      if (ds.length) void this.gui(tomTatLuu(ds));
    }, MS_GOP_LUU);
  }

  /**
   * Diagnostics vừa đổi. `dem` = tổng số lỗi Error hiện tại, hoặc hàm đếm —
   * hàm chỉ được gọi MỘT lần khi số lỗi đã đứng yên `MS_DEBOUNCE_LOI` (đếm toàn
   * workspace mỗi phím gõ là phí).
   */
  doiLoi(dem: number | (() => number)): void {
    this.demLoi = dem;
    if (this.henLoi !== null) this.huy(this.henLoi);
    this.henLoi = this.hen(() => {
      this.henLoi = null;
      const d = this.demLoi;
      const n = typeof d === 'function' ? d() : d;
      this.loiMoi = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      const truoc = this.loiChot;
      this.loiChot = this.loiMoi;
      if (truoc === null) return; // mốc đầu tiên: lỗi có sẵn lúc mở không phải "vừa xảy ra"
      const tb = tomTatLoi(truoc, this.loiMoi);
      // setting tắt vẫn cập nhật mốc → bật lại không bắn chuyện cũ
      if (tb && loaiDuocBat(this.p.layCfg(), 'diag')) void this.gui(tb);
    }, MS_DEBOUNCE_LOI);
  }

  /** Một task kết thúc (`tasks.onDidEndTaskProcess`). */
  ketThucTask(ten: string, exitCode: number | undefined, nhomId?: string): void {
    const tb = tomTatTask(ten, exitCode, laTaskTest(ten, nhomId));
    if (tb && loaiDuocBat(this.p.layCfg(), tb.kind)) void this.gui(tb);
  }

  /**
   * HEAD của một repo đổi (`repository.state.onDidChange`). Lần đầu thấy repo
   * chỉ ghi mốc. `layCommit` chỉ được gọi khi HEAD thật sự đổi.
   *
   * Chỉ tính là COMMIT khi commit mới có cha là HEAD cũ — checkout nhánh khác,
   * reset, pull nhiều commit không phải "Sếp vừa commit". Không đọc được commit
   * (API lỗi) ⇒ không gửi, ghi log.
   */
  async doiHead(
    repo: string,
    commit: string | undefined,
    layCommit: (hash: string) => Promise<{ message?: string; parents?: readonly string[] }>,
  ): Promise<void> {
    if (!commit) return;
    const cu = this.head.get(repo);
    this.head.set(repo, commit);
    if (cu === undefined || cu === commit) return;
    if (!loaiDuocBat(this.p.layCfg(), 'git')) return;
    let c: { message?: string; parents?: readonly string[] };
    try {
      c = await layCommit(commit);
    } catch (e) {
      this.p.ghi?.(`[giác quan] không đọc được commit ${commit.slice(0, 7)}: ${(e as Error)?.message ?? e}`);
      return;
    }
    if (!Array.isArray(c.parents) || !c.parents.includes(cu)) return; // HEAD nhảy (checkout/reset/pull), không phải commit mới
    await this.gui(tomTatCommit(commit, c.message));
  }

  private async gui(tb: ThongBao): Promise<void> {
    if (!this.p.tinCay()) return; // Restricted Mode: không gửi gì
    if (!loaiDuocBat(this.p.layCfg(), tb.kind)) return; // tắt giữa lúc đang gộp
    const kq = await this.p.gui(tb).catch((e: unknown) => ({ ok: false, error: String((e as Error)?.message ?? e) }));
    if (kq.ok) this.p.daGui?.(tb);
    else this.p.ghi?.(`[giác quan] stage.notice ${tb.kind} lỗi: ${kq.error ?? ''}`);
  }

  dung(): void {
    if (this.henLuu !== null) this.huy(this.henLuu);
    if (this.henLoi !== null) this.huy(this.henLoi);
    this.henLuu = this.henLoi = null;
    this.luu.clear();
  }
}

/* ============================================================ git (thuần) */

/** Phần tối thiểu của API extension `vscode.git` (`getAPI(1)`) mà giác quan dùng. */
export interface GitRepoToiThieu {
  readonly rootUri: { readonly fsPath: string };
  readonly state: {
    readonly HEAD?: { readonly commit?: string };
    readonly onDidChange: (cb: () => void) => { dispose(): unknown };
  };
  getCommit(ref: string): Promise<{ readonly message: string; readonly parents: string[] }>;
}
export interface GitApiToiThieu {
  readonly repositories: readonly GitRepoToiThieu[];
  readonly onDidOpenRepository: (cb: (r: GitRepoToiThieu) => void) => { dispose(): unknown };
}
export interface GitExtensionToiThieu {
  readonly enabled?: boolean;
  getAPI(version: 1): GitApiToiThieu;
}

/**
 * Nối giác quan vào API git. `exports` lạ/thiếu ⇒ trả `[]` (bỏ qua êm, không ném).
 * Trả danh sách disposable để extension gỡ.
 */
export function noiGit(exportsGit: unknown, gq: GiacQuan, ghi?: (d: string) => void): { dispose(): unknown }[] {
  const ext = exportsGit as Partial<GitExtensionToiThieu> | undefined;
  if (!ext || typeof ext.getAPI !== 'function' || ext.enabled === false) return [];
  let api: GitApiToiThieu;
  try {
    api = ext.getAPI(1);
  } catch (e) {
    ghi?.(`[giác quan] git API không dùng được: ${(e as Error)?.message ?? e}`);
    return [];
  }
  const huy: { dispose(): unknown }[] = [];
  const theoDoi = (r: GitRepoToiThieu): void => {
    const khoa = r.rootUri.fsPath;
    const xem = (): void => void gq.doiHead(khoa, r.state.HEAD?.commit, (h) => r.getCommit(h));
    xem(); // ghi mốc
    huy.push(r.state.onDidChange(xem));
  };
  for (const r of api.repositories) theoDoi(r);
  huy.push(api.onDidOpenRepository(theoDoi));
  return huy;
}
