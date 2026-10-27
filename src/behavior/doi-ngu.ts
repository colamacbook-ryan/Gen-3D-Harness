/**
 * doi-ngu.ts — INT-07 (Ryan 27/10): ĐỘI NGŨ AGENT HIỆN HÌNH TRÊN SÂN KHẤU.
 *
 * *"Trong VS Code bạn cũng phải phân được ai là quản lý kỹ sư trưởng, ai là
 * nhân viên subagent và nó được sinh ra thể hiện thế nào trong quá trình làm
 * việc tương ứng."*
 *
 * Vai:
 *   · **Kỹ sư trưởng = Nhi** (`gen`) — agent chính của phiên, ngồi bàn riêng.
 *   · **Nhân viên = subagent** — mỗi lần agent chính giao việc, một búp bê mới
 *     bước vào từ cửa (`cua`), có tên theo vai, đi tới KHU của vai đó, ngồi
 *     vào ghế trống (hoặc đứng ở chỗ làm còn trống), làm việc; xong việc thì
 *     tới bàn Nhi nộp kết quả rồi rời đi theo cửa.
 *
 * Nguồn sự kiện là lệnh `team.event` (`src/api/commands/doi-ngu.ts`): hook của
 * Claude Code (`scripts/bao-doi-ngu.mjs`) hoặc driver não local gửi qua ws
 * bridge — CÙNG một giao thức cho mọi nguồn (Ryan chốt "cả hai").
 *
 * Máy này chạy trong trình duyệt như phản xạ (C0) và tự sinh hoạt (J2): mọi
 * hành động đi qua dispatcher với nguồn `doi-ngu`, nên nhật ký phân biệt được
 * và hàng đợi theo từng actor lo thứ tự các bước (spawn → đi → ngồi …).
 */
import type { EventBusLike, Result, StageWorld } from '../api/types';
import { TEN_HIEN_THI } from '../stage/noi-dung';

/** Nguồn ghi vào nhật ký cho lệnh do máy này sinh ra. */
export const NGUON_DOI_NGU = 'doi-ngu';

/** Tối đa bấy nhiêu nhân viên cùng hiện (mỗi người là một VRM chạy ẩn — L-42). */
export const TOI_DA_NHAN_VIEN = 6;

export type KhuLam = 'ky-thuat' | 'thiet-ke' | 'kinh-doanh' | 'phong-hop' | 'pantry';

/**
 * Vai subagent → khu làm việc. Thêm vai = thêm một dòng. Vai lạ rơi về
 * `ky-thuat` (đa số subagent là việc code).
 */
export const VAI_KHU: Readonly<Record<string, KhuLam>> = {
  builder: 'ky-thuat',
  debugger: 'ky-thuat',
  tester: 'ky-thuat',
  shipper: 'ky-thuat',
  'general-purpose': 'ky-thuat',
  claude: 'ky-thuat',
  designer: 'thiet-ke',
  scribe: 'thiet-ke',
  researcher: 'kinh-doanh',
  strategist: 'kinh-doanh',
  scout: 'kinh-doanh',
  explore: 'kinh-doanh',
  reviewer: 'phong-hop',
  architect: 'phong-hop',
  cortex: 'phong-hop',
  oracle: 'phong-hop',
  plan: 'phong-hop',
};

/** Tên hiện trên bong bóng chữ theo vai. */
export const TEN_VAI: Readonly<Record<string, string>> = {
  builder: 'Thợ xây',
  debugger: 'Bác sĩ debug',
  tester: 'Kiểm thử',
  shipper: 'DevOps',
  'general-purpose': 'Trợ lý',
  claude: 'Trợ lý',
  designer: 'Thiết kế',
  scribe: 'Thư ký',
  researcher: 'Nghiên cứu',
  strategist: 'Chiến lược',
  scout: 'Trinh sát',
  explore: 'Trinh sát',
  reviewer: 'Reviewer',
  architect: 'Kiến trúc sư',
  cortex: 'Cortex',
  oracle: 'Oracle',
  plan: 'Kế hoạch',
};

/** Chuẩn hoá tên vai: `feature-dev:code-reviewer` → `code-reviewer`, chữ thường. */
export function chuanVai(role: string): string {
  const r = role.trim().toLowerCase();
  const sau = r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r;
  return sau || 'general-purpose';
}

export function khuCuaVai(role: string): KhuLam {
  const v = chuanVai(role);
  if (VAI_KHU[v]) return VAI_KHU[v]!;
  // vai có hậu tố quen: `code-reviewer`, `pr-test-analyzer`, `type-design-analyzer`…
  if (/review|audit|verif/.test(v)) return 'phong-hop';
  if (/research|explor|search|analy/.test(v)) return 'kinh-doanh';
  if (/design|ui|ux|writ|doc/.test(v)) return 'thiet-ke';
  return 'ky-thuat';
}

export function tenCuaVai(role: string): string {
  const v = chuanVai(role);
  if (TEN_VAI[v]) return TEN_VAI[v]!;
  // vai plugin (`code-reviewer`, `pr-test-analyzer`…): đặt tên theo việc chính
  if (/review|audit|verif/.test(v)) return 'Reviewer';
  if (/test/.test(v)) return 'Kiểm thử';
  if (/research|explor|search|analy/.test(v)) return 'Nghiên cứu';
  if (/design|ui|ux/.test(v)) return 'Thiết kế';
  return v.length > 18 ? v.slice(0, 18) : v;
}

/**
 * Chỗ làm trong từng khu: `seat` = place ghế trống có thật (ngồi bằng
 * `actor.sit`), còn lại là chỗ ĐỨNG (x, z, hướng mặt độ). Toạ độ khớp
 * `van-phong.ts`; test soi mọi chỗ trên bộ vật cản THẬT (không đứng xuyên đồ,
 * A* tới được từ cửa).
 */
export type ChoLam = { seat: string } | { x: number; z: number; facing: number };

export const CHO_LAM: Readonly<Record<KhuLam, readonly ChoLam[]>> = {
  'ky-thuat': [
    { seat: 'cho-kt-1' },
    { seat: 'cho-kt-2' },
    { x: -8.75, z: -5.0, facing: 270 },
    { x: -6.25, z: -5.0, facing: 90 },
  ],
  'thiet-ke': [
    { x: -8.6, z: 5.3, facing: 0 },
    { x: -6.8, z: 5.3, facing: 0 },
  ],
  'kinh-doanh': [
    { seat: 'cho-kd-1' },
    { x: 7.2, z: -5.95, facing: 90 },
    { x: 9.5, z: -5.95, facing: 270 },
  ],
  'phong-hop': [{ seat: 'ghe-1' }, { x: 5.2, z: 0.3, facing: 90 }],
  pantry: [{ x: 7.4, z: 4.6, facing: 0 }],
};

/** Chỗ đứng nộp kết quả cạnh bàn Nhi (lệch theo thứ tự để hai người không chồng). */
export function choNop(k: number): { x: number; z: number } {
  return { x: 3.5 + (k % 3) * 0.55, z: -2.35 };
}

/** id actor của nhân viên từ id sự kiện (tool_use_id dài, có thể có ký tự lạ). */
export function idNhanVien(id: string): string {
  const sach = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toLowerCase();
  return `nv-${sach || 'x'}`;
}

/* ------------------------------------------------------------- máy */

export interface SuKienDoiNgu {
  kind: 'spawn' | 'done' | 'fail';
  id: string;
  role: string;
  task: string;
  source: string;
}

/** Cửa duy nhất máy này cần ở dispatcher (test dựng được trên sân khấu giả). */
export interface CuaLenhDoiNgu {
  run(cmd: string, args?: Record<string, unknown>, nguon?: string): Promise<Result>;
  dangBan(actor: string): boolean;
  /** Đọc trạng thái (tư thế Nhi) — tuỳ chọn để test tối giản được. */
  readonly world?: Pick<StageWorld, 'describe'>;
}

export interface ThamSoDoiNgu {
  dispatcher: CuaLenhDoiNgu;
  /** id Sếp trên sân khấu (mặc định `owner`) — chỉ để gắn thẻ "Sếp". */
  sep?: string;
  bus: EventBusLike;
  /** id kỹ sư trưởng (mặc định `gen`). */
  truong?: string;
  /** Chờ (test tiêm đồng hồ giả). */
  nghi?: (ms: number) => Promise<void>;
  /** Trần chờ một nhân viên rảnh trước khi rời đi (ms). */
  tranChoMs?: number;
}

export interface NhanVienDangLam {
  actor: string;
  role: string;
  khu: KhuLam;
  cho: ChoLam | null;
  task: string;
  source: string;
  /** 'vao' (đang vào chỗ) · 'lam' · 'nop' · 've' (đang rời đi) */
  pha: 'vao' | 'lam' | 'nop' | 've';
}

export interface TrangThaiDoiNgu {
  truong: string;
  nhanVien: NhanVienDangLam[];
  /** Subagent không hiện được vì đã đủ `TOI_DA_NHAN_VIEN` người. */
  khongHien: number;
  /** Tổng số subagent đã hiện từ lúc bật. */
  daHien: number;
}

export interface MayDoiNgu {
  trangThai(): TrangThaiDoiNgu;
  /** Chờ mọi chuỗi đang chạy xong (test). */
  xong(): Promise<void>;
  dung(): void;
}

export function batDoiNgu(ts: ThamSoDoiNgu): MayDoiNgu {
  const { dispatcher, bus } = ts;
  const truong = ts.truong ?? 'gen';
  const sep = ts.sep ?? 'owner';
  const nghi = ts.nghi ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tranCho = ts.tranChoMs ?? 60000;

  /** Theo id SỰ KIỆN (tool_use_id), không theo id actor — sự kiện done mang id sự kiện. */
  const theoSuKien = new Map<string, NhanVienDangLam>();
  /** Chuỗi bước của từng nhân viên: spawn chưa xong mà done đã tới thì done xếp sau. */
  const chuoi = new Map<string, Promise<void>>();
  let khongHien = 0;
  let daHien = 0;
  let soNop = 0;
  let tat = false;

  const chay = async (cmd: string, args: Record<string, unknown>): Promise<Result> => {
    const r = await dispatcher.run(cmd, args, NGUON_DOI_NGU);
    if (!r.ok) console.warn(`[đội ngũ] ${cmd} lỗi: ${r.error}`);
    return r;
  };

  /** Chỗ làm còn trống trong khu (chưa nhân viên nào giữ). */
  function chonCho(khu: KhuLam): ChoLam | null {
    const dangGiu = new Set([...theoSuKien.values()].map((n) => n.cho).filter(Boolean));
    return CHO_LAM[khu].find((c) => !dangGiu.has(c)) ?? null;
  }

  async function choRanh(actor: string): Promise<void> {
    let doi = 0;
    while (dispatcher.dangBan(actor) && doi < tranCho && !tat) {
      await nghi(150);
      doi += 150;
    }
  }

  function noi(idSk: string, viec: () => Promise<void>): void {
    const truoc = chuoi.get(idSk) ?? Promise.resolve();
    const sau = truoc.then(viec).catch((e) => console.warn('[đội ngũ]', e));
    chuoi.set(idSk, sau);
  }

  /**
   * Thẻ tên cho người CỐ ĐỊNH của đội: Nhi = kỹ sư trưởng, Nam = Sếp. Gắn lúc
   * bật và sau mỗi `stage.reset` (reset dựng lại actor nên thẻ mất theo).
   */
  async function ganTheCoDinh(): Promise<void> {
    await chay('actor.label', { actor: truong, text: `${TEN_HIEN_THI[truong] ?? truong} · Kỹ sư trưởng`, tone: 'truong' });
    await chay('actor.label', { actor: sep, text: `${TEN_HIEN_THI[sep] ?? sep} · Sếp`, tone: 'sep' });
  }

  /**
   * Kỹ sư trưởng phản ứng. Mắt luôn nhìn sang (không chiếm thân). Thân chỉ
   * động khi Nhi RẢNH — không bao giờ chen việc của não:
   *   · đang đứng rảnh → về ngồi bàn điều phối `ghe-2` (giao việc từ bàn);
   *   · đang ngồi rảnh → giữ nguyên (emote đứng dậy diễn sẽ phá dáng ngồi);
   *   · không có `world` để đọc tư thế (test tối giản) → diễn emote như cũ.
   */
  async function truongPhanUng(nhin: string, emote: string, veBan = false): Promise<void> {
    await chay('actor.lookAt', { actor: truong, target: nhin });
    if (dispatcher.dangBan(truong)) return;
    const st = dispatcher.world?.describe().actors.find((a) => a.id === truong);
    if (st?.state === 'sitting') return;
    if (veBan && st?.state === 'idle') await chay('actor.sit', { actor: truong, seat: 'ghe-2' });
    else await chay('actor.emote', { actor: truong, emote });
  }

  function vao(sk: SuKienDoiNgu): void {
    if (theoSuKien.has(sk.id)) return; // sự kiện lặp
    if (theoSuKien.size >= TOI_DA_NHAN_VIEN) {
      khongHien += 1;
      return;
    }
    const khu = khuCuaVai(sk.role);
    const nv: NhanVienDangLam = {
      actor: idNhanVien(sk.id),
      role: chuanVai(sk.role),
      khu,
      cho: null,
      task: sk.task,
      source: sk.source,
      pha: 'vao',
    };
    nv.cho = chonCho(khu);
    theoSuKien.set(sk.id, nv);
    daHien += 1;
    bus.emit('team.member', { actor: nv.actor, role: nv.role, khu, task: nv.task, pha: 'vao', source: nv.source });
    noi(sk.id, async () => {
      const r = await chay('actor.spawn', {
        id: nv.actor,
        name: tenCuaVai(sk.role),
        at: 'cua',
        controlledBy: 'agent',
      });
      if (!r.ok) {
        theoSuKien.delete(sk.id);
        return;
      }
      const viec = nv.task.length > 34 ? `${nv.task.slice(0, 33)}…` : nv.task;
      await chay('actor.label', {
        actor: nv.actor,
        text: viec ? `${tenCuaVai(sk.role)} · ${viec}` : tenCuaVai(sk.role),
        tone: 'nhan-vien',
      });
      await truongPhanUng(nv.actor, 'ra-lenh', true);
      const c = nv.cho;
      if (c && 'seat' in c) {
        await chay('actor.sit', { actor: nv.actor, seat: c.seat });
      } else if (c) {
        await chay('actor.moveTo', { actor: nv.actor, to: [c.x, 0, c.z] });
        const r = (c.facing * Math.PI) / 180; // facing 0 = nhìn +Z
        await chay('actor.turnTo', { actor: nv.actor, target: [c.x + Math.sin(r), 0, c.z + Math.cos(r)] });
        await chay('actor.play', { actor: nv.actor, clip: 'type', loop: true });
      } else {
        // hết chỗ trong khu: đứng làm ở Pantry cho đỡ chen
        const p = CHO_LAM.pantry[0] as { x: number; z: number; facing: number };
        await chay('actor.moveTo', { actor: nv.actor, to: [p.x + (daHien % 3) * 0.6, 0, p.z] });
        await chay('actor.play', { actor: nv.actor, clip: 'think', loop: true });
      }
      nv.pha = 'lam';
      bus.emit('team.member', { actor: nv.actor, role: nv.role, khu, pha: 'lam' });
    });
  }

  function xongViec(sk: SuKienDoiNgu): void {
    const nv = theoSuKien.get(sk.id);
    if (!nv) return;
    const tot = sk.kind === 'done';
    noi(sk.id, async () => {
      nv.pha = 'nop';
      bus.emit('team.member', { actor: nv.actor, role: nv.role, khu: nv.khu, pha: 'nop', ok: tot });
      // đứng dậy / dừng clip lặp — chỉ đụng CHÍNH nhân viên này, không ai khác
      if (nv.cho && 'seat' in nv.cho) await chay('actor.stand', { actor: nv.actor });
      else await chay('actor.stop', { actor: nv.actor });
      const n = choNop(soNop++);
      await chay('actor.moveTo', { actor: nv.actor, to: [n.x, 0, n.z] });
      await choRanh(nv.actor);
      await chay('actor.faceTo', { actor: nv.actor, target: truong });
      await chay('actor.emote', { actor: nv.actor, emote: tot ? 'thanh-cong' : 'boi-roi' });
      await truongPhanUng(nv.actor, tot ? 'dong-y' : 'suy-nghi');
      nv.pha = 've';
      await chay('actor.moveTo', { actor: nv.actor, to: 'cua' });
      await choRanh(nv.actor);
      await chay('actor.remove', { actor: nv.actor });
      theoSuKien.delete(sk.id);
      chuoi.delete(sk.id);
      bus.emit('team.member', { actor: nv.actor, role: nv.role, khu: nv.khu, pha: 'roi', ok: tot });
    });
  }

  void ganTheCoDinh();
  const goReset = bus.on('stage.reset', () => {
    theoSuKien.clear();
    chuoi.clear();
    void ganTheCoDinh();
  });

  const go = bus.on('team.event', (e) => {
    if (tat) return;
    const d = e.data as Partial<SuKienDoiNgu> | undefined;
    if (!d || typeof d.id !== 'string' || typeof d.kind !== 'string') return;
    const sk: SuKienDoiNgu = {
      kind: d.kind as SuKienDoiNgu['kind'],
      id: d.id,
      role: typeof d.role === 'string' ? d.role : 'general-purpose',
      task: typeof d.task === 'string' ? d.task : '',
      source: typeof d.source === 'string' ? d.source : 'khac',
    };
    if (sk.kind === 'spawn') vao(sk);
    else if (sk.kind === 'done' || sk.kind === 'fail') xongViec(sk);
  });

  return {
    trangThai: () => ({
      truong,
      nhanVien: [...theoSuKien.values()].map((n) => ({ ...n })),
      khongHien,
      daHien,
    }),
    async xong() {
      // chuỗi có thể nối thêm bước trong lúc chờ — chờ tới khi đứng yên
      for (let i = 0; i < 20; i += 1) {
        const ds = [...chuoi.values()];
        if (!ds.length) return;
        await Promise.all(ds);
        if ([...chuoi.values()].every((p) => ds.includes(p))) return;
      }
    },
    dung() {
      tat = true;
      go();
      goReset();
    },
  };
}
