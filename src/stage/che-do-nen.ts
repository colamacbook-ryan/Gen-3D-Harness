/**
 * che-do-nen.ts — CHẾ ĐỘ NỀN (V1, INT-06): sân khấu cạnh IDE không được làm
 * chậm việc code.
 *
 * Áp cho MỌI mặt (trình duyệt thường lẫn tab VS Code), không riêng extension:
 *  - trình duyệt thường: `visibilitychange` + `blur`/`focus` của chính cửa sổ;
 *  - trong vỏ panel VS Code: tin `postMessage` từ cửa sổ cha
 *    `{nguon:"gen-stage-vscode", loai:"nen", visible, active}`
 *    (`vscode/src/thuan/html.ts` chuyển tiếp từ `onDidChangeViewState`, CNS-020).
 *
 * KHÔNG phải lệnh: không có đường nào qua dispatcher/MCP để não chỉnh fps —
 * chỉ người đang ngồi trước máy (focus/ẩn tab) quyết định.
 *
 * File này thuần (không import three, không đụng DOM toàn cục) để test được
 * trong vitest `environment: node`; phần nối DOM nhận một `EventTarget` giả được.
 */

/**
 * Trần khung hình khi nền. 15 fps (L-42 · ngân sách "tầng thở"): đủ để Gen
 * thở/nhép miệng/đi trông còn sống khi liếc sang, mà GPU chỉ còn ~1/4 so với
 * 60 Hz. Thấp hơn (≤ 10) thì đi bộ giật thấy rõ; cao hơn thì quạt vẫn quay.
 */
export const FPS_NEN = 15;

/** Khoảng cách tối thiểu giữa hai khung vẽ khi nền (ms). */
export const KHUNG_NEN_MS = 1000 / FPS_NEN;

/**
 * Dung sai khi so mốc rAF: mốc vsync 60 Hz là 16,67 ms nhưng có rung ±0,1 ms,
 * nên khung thứ 4 (66,67 ms) có thể ra 66,6 ms → bị bỏ thành khung thứ 5
 * (12 fps). Cho lùi 1 ms: trần thực tế ≤ 1000/65,67 ≈ 15,2 fps.
 */
export const DUNG_SAI_KHUNG_MS = 1;

/**
 * `dt` tối đa đưa vào các lerp theo khung (camera bám, nhìn quanh…) khi nền.
 * Chế độ thường kẹp 1/20 s; ở 15 fps `dt` thật là 1/15 s, kẹp 1/20 thì mọi lerp
 * chậm đi 25 %. Hành động có thời lượng KHÔNG phụ thuộc số này (nội suy theo
 * đồng hồ thật + hẹn giờ huỷ được), đây chỉ là phần trang trí.
 */
export const DT_TOI_DA_NEN = 0.1;

/** Pixel ratio khi nền: 1 (thường là min(devicePixelRatio, 2) — màn retina = 4× số điểm ảnh). */
export const TY_LE_PIXEL_NEN = 1;

export type RenderMode = 'full' | 'nen';

/** Khoá tin của vỏ panel VS Code — chỉ nhận đúng khoá này. */
export const NGUON_VO_VSCODE = 'gen-stage-vscode';

export interface TinHieuNen {
  /** `document.hidden` của chính trang. */
  an: boolean;
  /** Cửa sổ trang có focus không (`focus`/`blur`). */
  coFocus: boolean;
  /** Tin gần nhất của vỏ VS Code; `null` = không chạy trong VS Code (hoặc vỏ chưa báo). */
  vs: { visible: boolean; active: boolean } | null;
}

/**
 * Quyết định chế độ vẽ.
 *  - Trang ẩn → nền (thật ra rAF đã dừng, nhưng `describe` phải nói thật).
 *  - Có tin vỏ VS Code → vỏ là nguồn sự thật: nền khi panel không visible hoặc
 *    không active. Bỏ qua `blur` của iframe vì iframe mất focus cả khi Sếp gõ
 *    trong chatroom ngay cạnh — khi đó vẫn đang "xem" sân khấu theo nghĩa panel.
 *  - Không có vỏ → mất focus cửa sổ = Sếp đang ở app khác (IDE) → nền.
 */
export function quyetCheDo(t: TinHieuNen): RenderMode {
  if (t.an) return 'nen';
  if (t.vs) return t.vs.visible && t.vs.active ? 'full' : 'nen';
  return t.coFocus ? 'full' : 'nen';
}

/**
 * Tin từ vỏ panel VS Code có hợp lệ không.
 *  - `source` PHẢI là cửa sổ cha (và trang thật sự nằm trong khung) — không
 *    nhận từ tab/iframe con nào khác;
 *  - origin là `vscode-webview://…` (vỏ thật) hoặc chính origin của app (vỏ
 *    thử cùng origin — cùng origin vốn đã điều khiển được trang, không mở thêm gì);
 *  - đúng khoá `nguon` + `loai`, `visible`/`active` là boolean.
 * Trả `{visible, active}` hoặc `null`.
 */
export function docTinVo(
  ev: { data: unknown; origin: string; source: unknown },
  cha: unknown,
  chinhMinh: unknown,
  originMinh: string,
): { visible: boolean; active: boolean } | null {
  if (!cha || cha === chinhMinh || ev.source !== cha) return null;
  if (!ev.origin.startsWith('vscode-webview://') && ev.origin !== originMinh) return null;
  const d = ev.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (d.nguon !== NGUON_VO_VSCODE || d.loai !== 'nen') return null;
  if (typeof d.visible !== 'boolean' || typeof d.active !== 'boolean') return null;
  return { visible: d.visible, active: d.active };
}

/**
 * Có vẽ khung này không. Chế độ thường: luôn vẽ. Nền: chỉ vẽ khi đã qua đủ
 * `KHUNG_NEN_MS` (trừ dung sai) kể từ khung vẽ trước — theo ĐỒNG HỒ THẬT
 * (mốc rAF), không đếm khung, nên màn 60/120/144 Hz đều ra ≤ 15 fps.
 */
export function nenVeKhung(mode: RenderMode, bayGio: number, lanVeTruoc: number): boolean {
  if (mode === 'full') return true;
  return bayGio - lanVeTruoc >= KHUNG_NEN_MS - DUNG_SAI_KHUNG_MS;
}

/** Phần DOM tối thiểu cần để theo dõi (cho test truyền bản giả). */
export interface CuaSoTheoDoi {
  addEventListener(ten: string, fn: (ev: Event) => void): void;
  removeEventListener(ten: string, fn: (ev: Event) => void): void;
  parent: unknown;
  location: { origin: string };
}

export interface TaiLieuTheoDoi {
  hidden: boolean;
  hasFocus(): boolean;
  addEventListener(ten: string, fn: () => void): void;
  removeEventListener(ten: string, fn: () => void): void;
}

/**
 * Nối DOM → `quyetCheDo` → `khiDoi(mode)` (chỉ gọi khi chế độ ĐỔI, và một lần
 * lúc bắt đầu). Trả hàm gỡ.
 */
export function theoDoiCheDoNen(
  win: CuaSoTheoDoi,
  doc: TaiLieuTheoDoi,
  khiDoi: (mode: RenderMode, tin: TinHieuNen) => void,
): () => void {
  const tin: TinHieuNen = { an: doc.hidden, coFocus: doc.hasFocus(), vs: null };
  let hienTai: RenderMode | null = null;
  const tinh = (): void => {
    const m = quyetCheDo(tin);
    if (m === hienTai) return;
    hienTai = m;
    khiDoi(m, { ...tin, vs: tin.vs ? { ...tin.vs } : null });
  };
  const khiAnHien = (): void => {
    tin.an = doc.hidden;
    tinh();
  };
  const khiFocus = (): void => {
    tin.coFocus = true;
    tinh();
  };
  const khiBlur = (): void => {
    tin.coFocus = false;
    tinh();
  };
  const khiTin = (ev: Event): void => {
    const vs = docTinVo(ev as MessageEvent, win.parent, win, win.location.origin);
    if (!vs) return;
    tin.vs = vs;
    tinh();
  };
  doc.addEventListener('visibilitychange', khiAnHien);
  win.addEventListener('focus', khiFocus);
  win.addEventListener('blur', khiBlur);
  win.addEventListener('message', khiTin);
  tinh();
  return () => {
    doc.removeEventListener('visibilitychange', khiAnHien);
    win.removeEventListener('focus', khiFocus);
    win.removeEventListener('blur', khiBlur);
    win.removeEventListener('message', khiTin);
  };
}
