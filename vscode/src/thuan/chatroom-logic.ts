/**
 * chatroom-logic.ts — mọi quyết định của chatroom ở dạng hàm thuần:
 * đọc gói bridge, rút danh sách nhân vật từ `stage.describe`, đổi sự kiện thành
 * dòng chat, chọn người nghe, dựng lệnh `actor.say`.
 *
 * Nguồn sự thật: tên hiển thị lấy từ `stage.describe().actors[].name` (không
 * dựng bảng tên riêng — CNS-013). Nhân vật đang chọn giữ ở extension host.
 */
import type { CheDoNao } from './cau-hinh';

export type DieuKhienBoi = 'owner' | 'agent';

export interface NhanVat {
  id: string;
  name: string;
  controlledBy: DieuKhienBoi;
}

/** `giac-quan` (V3): dòng nhỏ "👁 …" cho mỗi notice IDE đã gửi. */
export type LoaiDong = 'sep' | 'nhan-vat' | 'lenh' | 'he-thong' | 'giac-quan';

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
    case 'team.record': {
      // INT-07 — sổ quy trình: biên bản họp, dấu kiểm nhận, dấu CEO duyệt… (một dòng mỗi bản ghi)
      const tomTat = chu(data.tomTat);
      if (!tomTat || typeof data.so !== 'number') return null;
      const ky = chu(data.ky);
      return { t, loai: 'he-thong', ai: '', text: `📋 #${data.so} ${tomTat}${ky ? ` — ký: ${ky}` : ''}` };
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

/** V1 (INT-06) — chế độ vẽ sân khấu (`stage.describe().renderMode` / `stage.renderMode`); null = chưa biết. */
export type CheDoVe = 'full' | 'nen' | null;

/** Setting `genStage.nao` (định nghĩa ở `cau-hinh.ts`). */
export type { CheDoNao };

/** Trạng thái driver não do extension quản lý (hiện cho Sếp đọc). */
export type TrangThaiDriverNao = 'tat' | 'dang-chay' | 'cua-ngoai' | 'loi';

export interface MoHinhChatroom {
  bridgeNoi: boolean;
  sanKhauNoi: boolean;
  panel: TrangThaiPanel;
  nhanVat: NhanVat[];
  dangChon: string | null;
  dong: DongChat[];
  /** Cảnh báo một dòng (vd sân khấu ẩn → lệnh sẽ chờ). Rỗng = không có. */
  canhBao: string;
  /** V1 (INT-06) — sân khấu đang vẽ đủ hay chế độ nền. */
  renderMode: CheDoVe;
  /** V1 — `brainConnected` (describe) / `bridge.brain.connected`; null = chưa biết. */
  naoNoi: boolean | null;
  /** V1 — setting `genStage.nao` + trạng thái driver extension quản lý. */
  naoCheDo: CheDoNao;
  naoDriver: TrangThaiDriverNao;
  /** Chữ + màu đèn đã tính sẵn ở host (`chuSanKhau`/`chuNao`) — webview chỉ vẽ. */
  trangThaiSanKhau: { chu: string; den: MauDen };
  trangThaiNao: { chu: string; den: MauDen };
  /** V2 — giọng nói (tai-nghe) + nút 🎤. */
  giong: MoHinhGiong;
}

export type MauDen = 'xanh' | 'vang' | 'do';

/** Chữ trạng thái sân khấu ở thanh trên chatroom (CNS-003: ẩn / nền / đã nối). */
export function chuSanKhau(m: Pick<MoHinhChatroom, 'sanKhauNoi' | 'panel' | 'renderMode'>): { chu: string; den: MauDen } {
  if (!m.sanKhauNoi) return { chu: 'Sân khấu: chưa nối', den: 'do' };
  if (m.panel === 'an') return { chu: 'Sân khấu: đang ẩn (tạm dừng)', den: 'vang' };
  if (m.renderMode === 'nen') return { chu: 'Sân khấu: chế độ nền (≤15 fps)', den: 'vang' };
  return { chu: 'Sân khấu: đã nối', den: 'xanh' };
}

/** Chữ trạng thái não: có não nối bridge chưa + driver extension bật hay không. */
export function chuNao(m: Pick<MoHinhChatroom, 'bridgeNoi' | 'naoNoi' | 'naoCheDo' | 'naoDriver'>): { chu: string; den: MauDen } {
  const nguon = m.naoCheDo === 'tat' ? '' : ` · ${m.naoCheDo}${m.naoDriver === 'dang-chay' ? '' : m.naoDriver === 'cua-ngoai' ? ' (driver ngoài)' : m.naoDriver === 'loi' ? ' (lỗi)' : ' (chưa bật)'}`;
  if (!m.bridgeNoi || m.naoNoi === null) return { chu: 'Não: ?' + nguon, den: 'do' };
  if (m.naoNoi) return { chu: 'Não: đã nối' + nguon, den: 'xanh' };
  return { chu: 'Não: chưa nối' + (m.naoCheDo === 'tat' ? ' (genStage.nao = tat)' : nguon), den: m.naoCheDo === 'tat' ? 'vang' : 'do' };
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

/* ------------------------------------------------------ V2 — giọng nói */

/**
 * Pha của MỘT lần thu (tai-nghe). `nghi` = không thu; `bo-qua`/`loi`/`cho-xac-nhan`
 * là pha "kết quả" — giữ trên màn hình tới lần thu kế / tới khi Sếp xử lý.
 */
export type PhaGiong = 'nghi' | 'khoi-dong' | 'nghe' | 'nhan-dang' | 'bo-qua' | 'loi' | 'cho-xac-nhan';

/** `giu` = nút giữ-để-nói (không VAD); `bat-tat` = lệnh/phím bật-tắt (có VAD). */
export type CheDoGiong = 'giu' | 'bat-tat';

/** Câu tai-nghe nhận được nhưng KHÔNG tự gửi (tin cậy < 0,6) — chờ Sếp sửa rồi Gửi/Bỏ. */
export interface CauChoXacNhan {
  /** Tăng mỗi câu mới — webview chỉ ghi đè ô sửa khi id đổi (không xoá chữ Sếp đang sửa). */
  id: number;
  text: string;
  confidence: number;
  durationMs: number;
  /** Người nghe lúc bắt đầu thu (INT-02) — đổi lựa chọn giữa chừng không đổi câu này. */
  to: string;
}

export interface TrangThaiGiong {
  pha: PhaGiong;
  cheDo: CheDoGiong | null;
  /** Người nghe (`--to`) của lần thu hiện tại / gần nhất. */
  toi: string | null;
  /** Một dòng tiếng Việt cho Sếp đọc (rỗng = không hiện). */
  chu: string;
  /** Gợi ý sửa khi lỗi (rỗng = không có). */
  goiY: string;
  cau: CauChoXacNhan | null;
  /** Đang gửi `stage.hear` cho câu chờ xác nhận — chặn bấm Gửi hai lần. */
  dangGui: boolean;
}

export interface MoHinhGiong extends TrangThaiGiong {
  /** Nút 🎤 bấm được không — tính sẵn ở host. */
  nutDuoc: boolean;
  /** Vì sao nút bị tắt (title của nút). */
  nutLyDo: string;
  /** id các nhân vật agent đang nói (`actor.sayStart` chưa có `actor.sayDone`). */
  dangNoi: string[];
}

export const GIONG_NGHI: TrangThaiGiong = { pha: 'nghi', cheDo: null, toi: null, chu: '', goiY: '', cau: null, dangGui: false };

/** Lý do `bo-qua` của tai-nghe → câu tiếng Việt. Lý do lạ vẫn hiện (không nuốt). */
export function chuBoQua(lyDo: string): string {
  switch (lyDo) {
    case 'gen-dang-noi':
      return 'Bỏ qua: nhân vật đang nói — đợi nói xong rồi nói lại (bán song công, tránh mic thu tiếng loa).';
    case 'im-lang':
      return 'Bỏ qua: không nghe thấy tiếng nói nào.';
    case 'rong':
      return 'Bỏ qua: không nhận ra chữ nào — nói rõ và gần mic hơn.';
    case 'huy':
      return 'Đã huỷ lần thu — không nhận dạng, không gửi.';
    default:
      return `Bỏ qua (${lyDo || 'không rõ lý do'}).`;
  }
}

export type MaLoiTaiNghe = 'thiet-bi' | 'stt' | 'bridge' | 'tham-so' | 'khac';

/** tai-nghe thoát cứng (tín hiệu lần 2 trong lúc chờ STT) — coi như huỷ, không phải lỗi. */
export const MA_THOAT_HUY = 130;

/**
 * Mã thoát của tai-nghe (hợp đồng CLI): 0 xong · 2 thiết bị · 4 STT/bridge · 64 tham số
 * (gồm Node < 22.18) · 130 thoát cứng vì tín hiệu thứ hai lúc chờ STT (= huỷ, xử lý ở `giong.ts`).
 */
export function maLoiTuMaThoat(ma: number | null): MaLoiTaiNghe {
  if (ma === 2) return 'thiet-bi';
  // 4 = STT hoặc bridge; tai-nghe luôn in `loi` kèm mã chính xác trước khi thoát 4 — đây chỉ là dự phòng
  if (ma === 4) return 'stt';
  if (ma === 64) return 'tham-so';
  return 'khac';
}

/** Lỗi tai-nghe → { chu, goiY } cho chatroom. `cong` để gợi ý đúng cổng đang cấu hình. */
export function chuLoi(
  ma: string,
  chiTiet: string,
  cong: { bridgePort: number; sttPort: number },
): { chu: string; goiY: string } {
  const them = chiTiet ? `: ${chiTiet}` : '';
  switch (ma) {
    case 'thiet-bi':
      return {
        chu: `Lỗi micro${them}`,
        goiY: 'Kiểm tra ffmpeg/PipeWire (`ffmpeg -version`, `pactl list short sources`) hoặc đặt genStage.taiNghe.nguon (User settings).',
      };
    case 'stt':
      return {
        chu: `Lỗi nhận dạng giọng${them}`,
        goiY: `Bridge có nghe /stt ở cổng ${cong.sttPort} không? Cần \`pnpm bridge\` + \`bash scripts/fetch-stt.sh\` (một lần); cổng khác thì đặt genStage.sttPort.`,
      };
    case 'bridge':
      return {
        chu: `Lỗi nối bridge${them}`,
        goiY: `Bridge ws cổng ${cong.bridgePort} — chạy "Gen-Stage: Bật bridge + sân khấu" hoặc \`pnpm bridge\`.`,
      };
    case 'tham-so':
      return {
        chu: `tai-nghe từ chối chạy${them}`,
        goiY: 'tai-nghe cần Node ≥ 22.18 (`node -v` trong PATH mà VS Code thấy — đặt genStage.pnpm là đường dẫn tuyệt đối nếu dùng nvm). Node đã đủ mà vẫn lỗi = lệch hợp đồng CLI — báo Gen (xem "Gen-Stage: Xem nhật ký").',
      };
    default:
      return { chu: `Lỗi tai-nghe${them}`, goiY: 'Xem "Gen-Stage: Xem nhật ký" (dòng [tai-nghe]).' };
  }
}

/**
 * Nút 🎤 bấm được không. Đang thu thì LUÔN bấm được (để thả/dừng — nút tắt giữa
 * chừng là mất `pointerup`). Không thu: cần bridge + có người nghe + không nhân
 * vật agent nào đang nói (bán song công phía UI; tai-nghe còn tự chặn lần nữa).
 */
export function nutMic(
  m: Pick<MoHinhChatroom, 'bridgeNoi' | 'nhanVat' | 'dangChon'>,
  g: TrangThaiGiong,
  dangNoi: readonly string[],
): { nutDuoc: boolean; nutLyDo: string } {
  if (g.pha === 'khoi-dong' || g.pha === 'nghe' || g.pha === 'nhan-dang') return { nutDuoc: true, nutLyDo: '' };
  if (!m.bridgeNoi) return { nutDuoc: false, nutLyDo: 'Chưa nối bridge' };
  if (!m.dangChon) return { nutDuoc: false, nutLyDo: 'Chưa có nhân vật nào để nghe' };
  if (dangNoi.length) {
    return { nutDuoc: false, nutLyDo: `${dangNoi.map((id) => tenCua(m.nhanVat, id)).join(', ')} đang nói — đợi nói xong` };
  }
  return { nutDuoc: true, nutLyDo: '' };
}
