/**
 * chatroom-logic.ts — mọi quyết định của chatroom ở dạng hàm thuần:
 * đọc gói bridge, rút danh sách nhân vật từ `stage.describe`, đổi sự kiện thành
 * dòng chat, chọn người nghe, dựng lệnh `actor.say`.
 *
 * Nguồn sự thật: tên hiển thị lấy từ `stage.describe().actors[].name` (không
 * dựng bảng tên riêng — CNS-013). Nhân vật đang chọn giữ ở extension host.
 */

export type DieuKhienBoi = 'owner' | 'agent';

export interface NhanVat {
  id: string;
  name: string;
  controlledBy: DieuKhienBoi;
}

export type LoaiDong = 'sep' | 'nhan-vat' | 'lenh' | 'he-thong';

export interface DongChat {
  t: number;
  loai: LoaiDong;
  /** id người nói (owner/gen…) hoặc rỗng với dòng hệ thống. */
  ai: string;
  /** Người nghe (`to`), nếu có. */
  toi?: string;
  text: string;
  /** Câu của Sếp đến từ mic (`user.speech`). */
  giong?: boolean;
}

/* ---------------------------------------------------------------- gói bridge */

export type GoiBridge =
  | { kieu: 'su-kien'; event: string; data: Record<string, unknown> }
  | { kieu: 'ket-qua'; id: string | undefined; ok: boolean; result: unknown; error: string | undefined }
  | { kieu: 'pong' }
  | { kieu: 'la'; tho: string };

export function docGoiBridge(tho: string): GoiBridge {
  let g: unknown;
  try {
    g = JSON.parse(tho);
  } catch {
    return { kieu: 'la', tho };
  }
  if (!g || typeof g !== 'object') return { kieu: 'la', tho };
  const o = g as Record<string, unknown>;
  if (typeof o.event === 'string') {
    const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {};
    return { kieu: 'su-kien', event: o.event, data };
  }
  if ('pong' in o) return { kieu: 'pong' };
  if (typeof o.ok === 'boolean') {
    return {
      kieu: 'ket-qua',
      id: typeof o.id === 'string' ? o.id : undefined,
      ok: o.ok,
      result: o.result,
      error: typeof o.error === 'string' ? o.error : undefined,
    };
  }
  return { kieu: 'la', tho };
}

/** Sự kiện nào làm danh sách nhân vật có thể đổi → gọi lại `stage.describe`. */
export const SU_KIEN_LAM_MOI_DS: ReadonlySet<string> = new Set([
  'bridge.hello',
  'bridge.stageOnline',
  'actor.spawned',
  'actor.removed',
  'stage.reset',
]);

/* ----------------------------------------------------------- nhân vật + chọn */

export function rutNhanVat(ketQuaDescribe: unknown): NhanVat[] {
  const r = ketQuaDescribe as { actors?: unknown } | null | undefined;
  if (!r || !Array.isArray(r.actors)) return [];
  const ra: NhanVat[] = [];
  for (const a of r.actors as unknown[]) {
    const x = a as { id?: unknown; name?: unknown; controlledBy?: unknown };
    if (typeof x?.id !== 'string') continue;
    ra.push({
      id: x.id,
      name: typeof x.name === 'string' && x.name ? x.name : x.id,
      controlledBy: x.controlledBy === 'owner' ? 'owner' : 'agent',
    });
  }
  return ra;
}

export function timOwner(ds: readonly NhanVat[]): NhanVat | undefined {
  return ds.find((a) => a.controlledBy === 'owner');
}

/**
 * Người đang chọn còn hợp lệ không. Không còn (bị xoá, chưa chọn bao giờ) thì
 * lấy nhân vật `agent` đầu tiên (thường là Gen); không có agent thì người đầu
 * tiên; danh sách rỗng thì `null` (chưa biết — giữ lựa chọn cũ ở nơi lưu).
 */
export function chonHopLe(ds: readonly NhanVat[], dangChon: string | null | undefined): string | null {
  if (dangChon && ds.some((a) => a.id === dangChon)) return dangChon;
  return ds.find((a) => a.controlledBy === 'agent')?.id ?? ds[0]?.id ?? null;
}

export function tenCua(ds: readonly NhanVat[], id: string | undefined): string {
  if (!id) return '';
  if (id === 'camera') return 'Sếp (camera)';
  return ds.find((a) => a.id === id)?.name ?? id;
}

export interface LenhNoi {
  cmd: 'actor.say';
  args: { actor: string; text: string; to: string; interrupt: true };
}

/**
 * Câu Sếp gõ ở chatroom → `actor.say` lên nhân vật `controlledBy:"owner"`,
 * `to` = nhân vật đang chọn, `interrupt:true` y như ô chat trong app
 * (`src/ui/o-chat.ts`). Lớp hiểu lệnh trong sân khấu quyết người nhận cuối:
 * tên gọi trong câu thắng, không gọi tên thì dùng `to`.
 */
export function taoLenhNoi(
  ds: readonly NhanVat[],
  dangChon: string | null,
  chu: string,
): { ok: true; lenh: LenhNoi } | { ok: false; loi: string } {
  const text = chu.trim();
  if (!text) return { ok: false, loi: 'Câu rỗng' };
  const owner = timOwner(ds);
  if (!owner) return { ok: false, loi: 'Sân khấu chưa có nhân vật controlledBy "owner" để nói hộ Sếp' };
  const to = chonHopLe(ds, dangChon);
  if (!to) return { ok: false, loi: 'Chưa có nhân vật nào để nghe' };
  return { ok: true, lenh: { cmd: 'actor.say', args: { actor: owner.id, text, to, interrupt: true } } };
}

/* -------------------------------------------------------- sự kiện → dòng chat */

/** Câu mic: cùng người, cùng chữ với dòng `sep` gần nhất trong cửa sổ này thì gộp. */
export const CUA_SO_GOP_GIONG_MS = 3000;

export function suKienThanhDong(
  event: string,
  data: Record<string, unknown>,
  ds: readonly NhanVat[],
  t: number,
): DongChat | null {
  const chu = (x: unknown): string => (typeof x === 'string' ? x : '');
  switch (event) {
    case 'user.text':
    case 'user.speech': {
      const text = chu(data.text);
      if (!text) return null;
      const d: DongChat = { t, loai: 'sep', ai: chu(data.actor) || 'owner', text };
      if (typeof data.to === 'string') d.toi = data.to;
      if (event === 'user.speech') d.giong = true;
      return d;
    }
    case 'actor.sayStart': {
      const ai = chu(data.actor);
      const text = chu(data.text);
      if (!ai || !text) return null;
      // owner nói = câu của Sếp, đã hiện qua user.text — không lặp lại
      if (ds.find((a) => a.id === ai)?.controlledBy === 'owner') return null;
      return { t, loai: 'nhan-vat', ai, text };
    }
    case 'user.command': {
      if (data.matched !== true) return null;
      const ai = Array.isArray(data.actors) ? (data.actors as unknown[]).map(String).join(', ') : '';
      const cmd = chu(data.cmd) || '?';
      return { t, loai: 'lenh', ai: '', text: `Hiểu lệnh: ${cmd}${ai ? ' → ' + ai : ''}` };
    }
    case 'bridge.stageOnline':
      return { t, loai: 'he-thong', ai: '', text: 'Sân khấu đã nối bridge' };
    case 'bridge.stageOffline':
      return { t, loai: 'he-thong', ai: '', text: 'Sân khấu ngắt khỏi bridge' };
    default:
      return null;
  }
}

/**
 * Thêm một dòng vào log (giữ tối đa `toiDa` dòng cuối).
 *
 * C1: mic đi qua `actor.say` owner nên bắn `user.text` RỒI `user.speech` cùng
 * câu → gộp vào dòng trước (đánh dấu `giong`) thay vì hiện hai lần.
 */
export function themDong(ds: readonly DongChat[], d: DongChat, toiDa = 200): DongChat[] {
  if (d.loai === 'sep') {
    for (let i = ds.length - 1; i >= 0 && i >= ds.length - 5; i--) {
      const c = ds[i]!;
      if (
        c.loai === 'sep' &&
        c.ai === d.ai &&
        c.text === d.text &&
        d.t - c.t <= CUA_SO_GOP_GIONG_MS &&
        Boolean(c.giong) !== Boolean(d.giong)
      ) {
        const gop: DongChat = { ...c, giong: true };
        if (!gop.toi && d.toi) gop.toi = d.toi;
        return [...ds.slice(0, i), gop, ...ds.slice(i + 1)];
      }
    }
  }
  const ra = [...ds, d];
  return ra.length > toiDa ? ra.slice(ra.length - toiDa) : ra;
}

/* ------------------------------------------------------- mô hình cho webview */

export type TrangThaiPanel = 'chua-mo' | 'hien' | 'an';

export interface MoHinhChatroom {
  bridgeNoi: boolean;
  sanKhauNoi: boolean;
  panel: TrangThaiPanel;
  nhanVat: NhanVat[];
  dangChon: string | null;
  dong: DongChat[];
  /** Cảnh báo một dòng (vd sân khấu ẩn → lệnh sẽ chờ). Rỗng = không có. */
  canhBao: string;
}

/**
 * CNS-003: sân khấu ẩn thì script của nó bị VS Code tạm dừng → lệnh gửi lúc
 * đó nằm chờ tới khi hiện lại (hoặc hết hạn 30 s của bridge).
 */
export function canhBaoCho(m: Pick<MoHinhChatroom, 'bridgeNoi' | 'sanKhauNoi' | 'panel'>): string {
  if (!m.bridgeNoi) return 'Chưa nối được bridge — chạy "Gen-Stage: Bật bridge + sân khấu" hoặc `pnpm bridge`.';
  if (!m.sanKhauNoi) return 'Bridge chưa thấy sân khấu — mở "Gen-Stage: Mở sân khấu".';
  if (m.panel === 'an') return 'Tab sân khấu đang ẩn: VS Code tạm dừng nó, lệnh sẽ chờ tới khi tab hiện lại.';
  return '';
}
