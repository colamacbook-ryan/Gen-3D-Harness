/**
 * doi-ngu.ts — INT-07 (Ryan 27/10): CÔNG TY AGENT LÀM VIỆC THEO QUY TRÌNH.
 *
 * *"Phải phân được ai là quản lý kỹ sư trưởng, ai là nhân viên subagent"* →
 * *"xác định 1 nhân vật CEO và 1 nhân vật Giám đốc… chạy tới kế bên báo cáo
 * đúng người, tới khu vực họp nhóm…"* → *"luôn phải theo quy trình, không phải
 * tự ý ai muốn làm gì là tự làm tự biên tự diễn"*.
 *
 * Tổ chức:
 *   · **CEO = Nam** (`owner`, avatar của Ryan) — bàn riêng `ban-ceo`, ngồi `ghe-ceo`.
 *     Ryan gõ yêu cầu cho agent chính = CEO giao việc cho Giám đốc.
 *   · **Giám đốc kỹ thuật = Nhi** (`gen`, agent chính) — bàn riêng
 *     `ban-dieu-khien`, ngồi `ghe-2`. Cả hai bàn lãnh đạo ở BAN GIÁM ĐỐC dọc tường
 *     bắc, ghế lưng tựa tường, mặt nhìn ra văn phòng. Nhận việc từ CEO, lập kế hoạch, giao việc,
 *     duyệt bài nhân viên, báo cáo CEO.
 *   · **Nhân viên = subagent** — búp bê sinh ra khi được giao việc, làm ở khu
 *     theo vai, nộp bài cho Giám đốc rồi về.
 *
 * QUY TRÌNH (máy pha, không phải "nghe gì diễn nấy"). Pha của cả công ty:
 *
 *   nghi → nhan-viec → lap-ke-hoach → giao-viec → thuc-hien → duyet → bao-cao → nghi
 *
 * Luật bắt buộc (máy ép, kể cả khi sự kiện tới lộn xộn):
 *   1. Mọi việc của Giám đốc đi qua MỘT hàng việc tuần tự (`hangTruong`): Nhi
 *      không thể vừa họp vừa duyệt bài vừa báo cáo.
 *   2. Nhân viên vào cửa rồi ĐỨNG CHỜ phân công — chỉ về chỗ làm SAU khi Giám đốc
 *      giao việc: giao cùng lúc ≥ 2 người ⇒ HỌP NHÓM ở Phòng họp; 1 người ⇒ giao
 *      riêng tại bàn Giám đốc. `done` tới trước khi được giao cũng phải chờ.
 *   3. Nhân viên xong việc ⇒ tới bàn Giám đốc NỘP BÀI và chờ DUYỆT (gật = đạt,
 *      nghiêng đầu hỏi lại = lỗi) rồi mới được về.
 *   4. Giám đốc chỉ BÁO CÁO CEO khi mọi nhân viên đã nộp bài và về hết — `report`
 *      tới sớm thì hoãn, nhân viên cuối về là báo cáo.
 *   5. Có việc mà chưa ai giao (thiếu `brief`) ⇒ máy tự đi qua pha nhận việc
 *      (ngầm, không diễn) — không bao giờ nhảy cóc pha.
 *   6. Cần CEO duyệt (`ask`) ⇒ Giám đốc lên bàn CEO đứng chờ; sự kiện kế tiếp
 *      (CEO đã trả lời) mới cho về.
 *   8. LỄ NGHI (Ryan: "nhân viên đối với sếp phải cung kính, nói chuyện phải có
 *      bong bóng và emoji"): cấp dưới tới gặp cấp trên thì CÚI CHÀO (`cui-chao`;
 *      đang ngồi thì gật đầu), xưng hô đúng vai (nhân viên → "chị", Giám đốc →
 *      "anh"), mọi câu là bong bóng có emoji (`LOI`) — `actor.bubble`, KHÔNG phát
 *      tiếng, để không tranh giọng với não.
 *   7. GIẤY TỜ (Ryan: "cấp trên đóng dấu kiểm nhận, họp hành có biên bản"):
 *      mọi bước ghi vào SỔ QUY TRÌNH có số thứ tự — biên bản họp (chủ trì,
 *      thành phần, phân công), phiếu giao việc riêng, DẤU KIỂM NHẬN / TRẢ LẠI
 *      của Giám đốc cho từng bài nộp, dấu CEO DUYỆT cho từng báo cáo. Sự kiện
 *      sai quy trình không bị nuốt lặng: ghi `vi-pham` vào sổ. Không dấu kiểm
 *      nhận thì nhân viên không được về; không dấu CEO thì phiên việc chưa đóng.
 *
 * Nguồn sự kiện là lệnh `team.event` (`src/api/commands/doi-ngu.ts`): hook của
 * Claude Code (`scripts/bao-doi-ngu.mjs`) và driver não local — một giao thức.
 * Mọi hành động đi qua dispatcher với nguồn `doi-ngu`; thân Nhi chỉ động khi
 * Nhi không bận việc của não (chờ có trần, quá trần thì chỉ nhìn).
 */
import type { EventBusLike, Result, StageWorld } from '../api/types';
import { TEN_HIEN_THI } from '../stage/noi-dung';

/** Nguồn ghi vào nhật ký cho lệnh do máy này sinh ra. */
export const NGUON_DOI_NGU = 'doi-ngu';

/** Tối đa bấy nhiêu nhân viên cùng hiện (mỗi người là một VRM chạy ẩn — L-42). */
export const TOI_DA_NHAN_VIEN = 6;

/** Cửa sổ gom nhân viên được giao cùng đợt (≥ 2 người trong cửa sổ ⇒ họp nhóm). */
export const CUA_SO_GIAO_MS = 1200;

export type KhuLam = 'ky-thuat' | 'thiet-ke' | 'kinh-doanh' | 'phong-hop' | 'pantry';

/** Pha quy trình của công ty, đúng thứ tự. */
export const THU_TU_PHA = [
  'nghi',
  'nhan-viec',
  'lap-ke-hoach',
  'giao-viec',
  'thuc-hien',
  'duyet',
  'bao-cao',
] as const;
export type PhaQuyTrinh = (typeof THU_TU_PHA)[number];

export const TEN_PHA: Readonly<Record<PhaQuyTrinh, string>> = {
  nghi: 'Nghỉ',
  'nhan-viec': 'Nhận việc từ CEO',
  'lap-ke-hoach': 'Lập kế hoạch',
  'giao-viec': 'Giao việc',
  'thuc-hien': 'Thực hiện',
  duyet: 'Duyệt bài',
  'bao-cao': 'Báo cáo CEO',
};

/** Loại công việc Giám đốc tự làm (hook phân loại tool, KHÔNG gửi nội dung lệnh). */
export const LOAI_VIEC = ['doc', 'tim', 'viet', 'chay-lenh', 'test', 'build', 'git', 'web', 'ke-hoach', 'khac'] as const;
export type LoaiViec = (typeof LOAI_VIEC)[number];

export const TEN_VIEC: Readonly<Record<LoaiViec, string>> = {
  doc: 'đang đọc code',
  tim: 'đang tìm kiếm',
  viet: 'đang viết code',
  'chay-lenh': 'đang chạy lệnh',
  test: 'đang chạy test',
  build: 'đang build',
  git: 'đang commit',
  web: 'đang tra cứu',
  'ke-hoach': 'đang lập kế hoạch',
  khac: 'đang làm việc',
};

/** Việc "tìm hiểu" — còn ở pha lập kế hoạch; việc khác đẩy sang thực hiện. */
const VIEC_TIM_HIEU: ReadonlySet<LoaiViec> = new Set(['doc', 'tim', 'web', 'ke-hoach']);

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

/** Tên hiện trên thẻ theo vai. */
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
  if (/review|audit|verif/.test(v)) return 'Reviewer';
  if (/test/.test(v)) return 'Kiểm thử';
  if (/research|explor|search|analy/.test(v)) return 'Nghiên cứu';
  if (/design|ui|ux/.test(v)) return 'Thiết kế';
  return v.length > 18 ? v.slice(0, 18) : v;
}

/**
 * Chỗ làm trong từng khu: `seat` = place ghế trống có thật (ngồi bằng
 * `actor.sit`), còn lại là chỗ ĐỨNG (x, z, hướng mặt độ). Test soi mọi chỗ
 * trên bộ vật cản THẬT (không đứng xuyên đồ, A* tới được từ cửa).
 */
export type ChoLam = { seat: string } | { x: number; z: number; facing: number };
export type ChoDung = { x: number; z: number; facing: number };

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

/** Chỗ Giám đốc đứng báo cáo / nhận việc: KẾ BÊN bàn CEO (phía không có bàn Nhi), nhìn sang CEO. */
export const CHO_BAO_CAO_CEO: ChoDung = { x: 1.75, z: -8.0, facing: 270 };

/** Phòng họp: Giám đốc đứng đầu bàn, nhân viên quanh bàn (nhìn về đầu bàn). */
export const CHO_CHU_TRI_HOP: ChoDung = { x: 4.6, z: 0.3, facing: 90 };
export const CHO_HOP: readonly ChoDung[] = [
  { x: 5.3, z: -0.75, facing: 270 },
  { x: 5.3, z: 1.35, facing: 270 },
  { x: 6.2, z: -1.65, facing: 270 },
  { x: 6.2, z: 2.2, facing: 270 },
  { x: 7.4, z: -1.65, facing: 270 },
  { x: 7.4, z: 2.2, facing: 270 },
];

/** Chỗ đứng TRƯỚC bàn Giám đốc (nhận việc riêng / nộp bài), lệch theo thứ tự. */
export function choNop(k: number): { x: number; z: number } {
  return { x: -2.05 + (k % 3) * 0.55, z: -6.85 };
}

/** id actor của nhân viên từ id sự kiện (tool_use_id dài, có thể có ký tự lạ). */
export function idNhanVien(id: string): string {
  const sach = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toLowerCase();
  return `nv-${sach || 'x'}`;
}

/**
 * Lời thoại theo quy trình — bong bóng chữ + emoji, xưng hô đúng vai. Thêm câu =
 * sửa bảng này (test đòi mỗi câu có emoji).
 */
export const LOI = {
  chaoCeo: 'Chào anh CEO ạ ☀️',
  ceoChaoLai: 'Chào em, bắt đầu thôi 👋',
  ceoGiaoViec: 'Nhi, anh giao việc mới nhé 📌',
  nhanViec: 'Dạ, em nhận việc ạ 🙇‍♀️',
  lapKeHoach: 'Lập kế hoạch nào 🗂️',
  moHop: 'Bắt đầu họp giao việc nhé 📋',
  dongYHop: 'Dạ rõ ạ 👍',
  chotHop: 'Chốt biên bản, ai về việc nấy 🖊️',
  chaoGiamDoc: 'Chào chị Giám đốc ạ 🙇',
  giaoRieng: (viec: string) => `${viec ? `Em làm: ${viec.length > 26 ? `${viec.slice(0, 25)}…` : viec}` : 'Em nhận phần này'} nhé 📝`,
  lamNgay: 'Dạ em làm ngay ạ 💪',
  nopBai: 'Em nộp bài ạ 📄',
  nopBaiLoi: 'Em nộp bài… còn vướng ạ 😥',
  kiemNhan: 'Đạt! Đóng dấu kiểm nhận ✅',
  traLaiLamLai: 'Chưa đạt — sửa lại rồi nộp nhé 🔁',
  traLai: 'Chưa đạt — trả lại ❌',
  camOn: 'Em cảm ơn chị ạ 🙏',
  suaNgay: 'Dạ em sửa ngay ạ 🙇',
  xinLoi: 'Dạ em xin lỗi chị ạ 🙇',
  baoCao: (dat: number, traLai: number) => `Báo cáo anh: ${dat} việc đạt, ${traLai} trả lại 📊`,
  ceoDuyet: 'Tốt lắm, duyệt! ✅',
  ceoDuyetCoLoi: 'Được, xử lý tiếp nhé 👍',
  xinDuyet: 'Anh duyệt giúp em bước này ạ 🙏',
  ceoTraLoi: 'Ok, làm tiếp đi 👌',
  ceoXemSau: 'Để anh xem rồi ký ở Bàn duyệt 🖋️',
  ceoKyDuyet: (so: number) => `Đã ký duyệt báo cáo số ${so} ✅`,
  ceoKyTraLai: (so: number) => `Báo cáo số ${so} chưa đạt, xem lại nhé ↩️`,
  camOnCeo: 'Dạ em cảm ơn anh ạ 🙏',
  xemLai: 'Dạ em xem lại ngay ạ 🙇‍♀️',
  daA: 'Dạ ạ 🙇‍♀️',
  gonHoSo: 'Sắp xếp lại hồ sơ… 🗃️',
  hetPhien: 'Hết phiên rồi, nghỉ chút ☕',
  veTruoc: 'Em xin phép về ạ 👋',
  loiRoi: 'Ơ, lỗi rồi 😣',
  xanhRoi: 'Xanh rồi! 🎉',
} as const;

/**
 * Bong bóng hiện bao lâu (ms) theo độ dài câu: ~16 ký tự/giây + 0,9 s nhìn
 * sang, tối thiểu 2,4 s. Bản đầu cố định 1,8 s — người thật đọc không kịp câu
 * tiếng Việt có emoji (và máy kiểm ~1 fps không kịp vẽ khung nào).
 */
export function msBongBong(cau: string): number {
  return Math.max(2400, 900 + [...cau].length * 62);
}

const huongDo = (c: ChoDung): [number, number, number] => {
  const r = (c.facing * Math.PI) / 180; // facing 0 = nhìn +Z
  return [c.x + Math.sin(r), 0, c.z + Math.cos(r)];
};

/* ------------------------------------------------------------- máy */

/** Bản ghi trong sổ quy trình — giấy tờ của công ty. */
export type LoaiBanGhi =
  | 'nhan-viec'
  | 'bien-ban-hop'
  | 'phieu-giao'
  | 'kiem-nhan'
  | 'tra-lai'
  | 'xin-duyet'
  | 'bao-cao'
  | 'ceo-duyet'
  | 'ceo-tra-lai'
  | 'vi-pham';

export interface BanGhi {
  /** Số thứ tự trong sổ (tăng dần, không tái dùng). */
  so: number;
  loai: LoaiBanGhi;
  /** Mốc thời gian (ms, đồng hồ của máy). */
  t: number;
  /** Người ký / đóng dấu. */
  ky: string;
  /** Tóm tắt một dòng (hiện lên màn hình / chatroom). */
  tomTat: string;
  /** Chi tiết theo loại: thành phần họp, phân công, người nộp bài… */
  chiTiet?: Record<string, unknown>;
}

/** Sổ giữ tối đa bấy nhiêu bản ghi gần nhất (bộ nhớ trình duyệt). */
export const TOI_DA_SO = 300;

export const LOAI_SU_KIEN = [
  'session-start',
  'brief',
  'work',
  'work-result',
  'spawn',
  'done',
  'fail',
  'rework',
  'ask',
  'report',
  'compact',
  'session-end',
] as const;
export type LoaiSuKien = (typeof LOAI_SU_KIEN)[number];

export interface SuKienDoiNgu {
  kind: LoaiSuKien;
  id: string;
  role: string;
  task: string;
  source: string;
  tool: LoaiViec;
  ok: boolean;
}

/** Cửa duy nhất máy này cần ở dispatcher (test dựng được trên sân khấu giả). */
export interface CuaLenhDoiNgu {
  run(cmd: string, args?: Record<string, unknown>, nguon?: string): Promise<Result>;
  dangBan(actor: string): boolean;
  /** Đọc trạng thái (tư thế, màn hình) — tuỳ chọn để test tối giản được. */
  readonly world?: Pick<StageWorld, 'describe'>;
}

export interface ThamSoDoiNgu {
  dispatcher: CuaLenhDoiNgu;
  bus: EventBusLike;
  /** id CEO trên sân khấu (mặc định `owner`). */
  sep?: string;
  /** id Giám đốc kỹ thuật (mặc định `gen`). */
  truong?: string;
  /** Chờ (test tiêm đồng hồ giả). */
  nghi?: (ms: number) => Promise<void>;
  /** Đồng hồ (test tiêm) — chỉ để giãn nhịp cập nhật thẻ/màn hình. */
  bayGio?: () => number;
  /** Trần chờ một người rảnh thân (ms). */
  tranChoMs?: number;
  /** Cửa sổ gom giao việc (ms). */
  cuaSoGiaoMs?: number;
  /**
   * Bàn duyệt (phương án 1): CEO THẬT (Ryan) ký báo cáo bằng tay qua `team.sign`
   * thay vì Nam tự đóng dấu. Báo cáo nằm trong `choKy` tới khi được ký.
   * Mặc định `false` (Nam tự duyệt như INT-07 vòng 2).
   */
  ceoKyTay?: boolean;
  /** Lưu sổ + hàng chờ ký qua lần tải lại trang (app dùng localStorage). */
  luu?: KhoSoDoiNgu;
}

/** Báo cáo đang chờ CEO ký tay. */
export interface BaoCaoChoKy {
  /** Số của bản ghi `bao-cao` trong sổ. */
  so: number;
  t: number;
  tomTat: string;
  dat: number;
  traLai: number;
  /** Phiên không có lỗi lặp lại / bài trả lại. */
  ok: boolean;
}

/** Dữ liệu lưu được của máy (sổ giấy tờ + hàng chờ ký). */
export interface DuLieuSoDoiNgu {
  so: BanGhi[];
  choKy: BaoCaoChoKy[];
}

export interface KhoSoDoiNgu {
  doc(): DuLieuSoDoiNgu | null;
  ghi(d: DuLieuSoDoiNgu): void;
}

export type QuyetDinhCeo = 'approve' | 'reject';

/** Trần chữ góp ý của CEO khi trả lại. */
export const TOI_DA_GOP_Y = 200;

export type PhaNhanVien = 'vao' | 'cho-giao' | 'lam' | 'nop' | 'cho-duyet' | 'lam-lai' | 've';

export interface NhanVienDangLam {
  actor: string;
  role: string;
  khu: KhuLam;
  cho: ChoLam | null;
  task: string;
  source: string;
  pha: PhaNhanVien;
}

export interface TrangThaiDoiNgu {
  truong: string;
  sep: string;
  pha: PhaQuyTrinh;
  /** Giám đốc đang đứng chờ CEO duyệt. */
  choCeoDuyet: boolean;
  /** Báo cáo đang hoãn vì còn nhân viên chưa nộp bài. */
  baoCaoCho: boolean;
  /** Việc Giám đốc đang làm trong hàng việc tuần tự (null = rảnh). */
  viecTruong: string | null;
  nhanVien: NhanVienDangLam[];
  /** Subagent không hiện được vì đã đủ `TOI_DA_NHAN_VIEN` người. */
  khongHien: number;
  /** Tổng số subagent đã hiện từ lúc bật. */
  daHien: number;
  /** Nhật ký pha (để kiểm quy trình). */
  lichSuPha: PhaQuyTrinh[];
  /** Sổ quy trình: biên bản, phiếu giao, dấu kiểm nhận, dấu CEO, vi phạm. */
  soQuyTrinh: BanGhi[];
  /** Bàn duyệt: CEO ký tay hay Nam tự duyệt. */
  ceoKyTay: boolean;
  /** Báo cáo chờ CEO ký tay (mới nhất cuối). */
  choKy: BaoCaoChoKy[];
  /** Lúc Giám đốc bắt đầu đứng chờ CEO trả lời (`ask`), null = không chờ. */
  xinDuyetLuc: number | null;
}

export interface MayDoiNgu {
  trangThai(): TrangThaiDoiNgu;
  /**
   * CEO ký tay một báo cáo đang chờ (Bàn duyệt). Ghi dấu `ceo-duyet` /
   * `ceo-tra-lai` vào sổ, bắn `team.signed`, rồi diễn trên sân khấu (không chờ).
   * Ném lỗi khi số báo cáo không nằm trong hàng chờ ký.
   */
  kyBaoCao(so: number, quyet: QuyetDinhCeo, gopY?: string): BanGhi;
  /** Chờ mọi chuỗi đang chạy xong (test). */
  xong(): Promise<void>;
  dung(): void;
}

interface NhanVienNoi extends NhanVienDangLam {
  idSk: string;
  /** Đã vào sân khấu (spawn xong). */
  vaoXong: Promise<boolean>;
  /** Giám đốc đã giao việc (họp hoặc giao riêng). */
  giaoXong: Promise<void>;
  baoGiao: () => void;
  huy: boolean;
}

const hua = <T = void>() => {
  let giai!: (v: T) => void;
  const p = new Promise<T>((r) => (giai = r));
  return { p, giai };
};

export function batDoiNgu(ts: ThamSoDoiNgu): MayDoiNgu {
  const { dispatcher, bus } = ts;
  const truong = ts.truong ?? 'gen';
  const sep = ts.sep ?? 'owner';
  const nghi = ts.nghi ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const bayGio = ts.bayGio ?? (() => Date.now());
  const tranCho = ts.tranChoMs ?? 20000;
  const cuaSoGiao = ts.cuaSoGiaoMs ?? CUA_SO_GIAO_MS;
  const tenTruong = TEN_HIEN_THI[truong] ?? truong;
  const tenSep = TEN_HIEN_THI[sep] ?? sep;

  const theoSuKien = new Map<string, NhanVienNoi>();
  /** Chuỗi bước của từng nhân viên (theo id sự kiện). */
  const chuoi = new Map<string, Promise<void>>();
  /** Hàng việc TUẦN TỰ của Giám đốc — luật 1. */
  let hangTruong: Promise<void> = Promise.resolve();
  let soViecTruong = 0;
  let viecTruong: string | null = null;
  /** Nhân viên đã vào, chờ gom thành một đợt giao việc. */
  let choGiao: NhanVienNoi[] = [];
  let henGiao = false;

  let pha: PhaQuyTrinh = 'nghi';
  const lichSuPha: PhaQuyTrinh[] = ['nghi'];
  let choCeoDuyet = false;
  let xinDuyetLuc: number | null = null;
  const kyTay = ts.ceoKyTay === true;
  let choKy: BaoCaoChoKy[] = [];
  let baoCaoCho = false;
  let khongHien = 0;
  let daHien = 0;
  let soNop = 0;
  let loiLienTiep = 0;
  let viecDangLam: LoaiViec | null = null;
  let tTheCuoi = -Infinity;
  let tManCuoi = -Infinity;
  let tat = false;
  const so: BanGhi[] = [];
  let soCuoi = 0;
  // sổ là giấy tờ: tải lại trang không được mất (lưu hỏng thì bắt đầu sổ trắng)
  try {
    const cu = ts.luu?.doc();
    if (cu && Array.isArray(cu.so)) {
      for (const b of cu.so.slice(-TOI_DA_SO)) {
        if (b && typeof b.so === 'number' && typeof b.loai === 'string' && typeof b.tomTat === 'string') so.push(b);
      }
      soCuoi = so.reduce((m, b) => Math.max(m, b.so), 0);
      if (Array.isArray(cu.choKy)) {
        const coTrongSo = new Set(so.filter((b) => b.loai === 'bao-cao').map((b) => b.so));
        choKy = cu.choKy.filter((c) => c && typeof c.so === 'number' && coTrongSo.has(c.so));
      }
    }
  } catch (e) {
    console.warn('[đội ngũ] không đọc được sổ đã lưu', e);
  }
  const luuLai = (): void => {
    try {
      ts.luu?.ghi({ so: so.map((b) => ({ ...b })), choKy: choKy.map((c) => ({ ...c })) });
    } catch (e) {
      console.warn('[đội ngũ] không lưu được sổ', e);
    }
  };
  /** Dấu kiểm nhận từ lần báo cáo trước — báo cáo CEO mang theo. */
  let demKiemNhan = { dat: 0, traLai: 0 };

  const chay = async (cmd: string, args: Record<string, unknown>): Promise<Result> => {
    const r = await dispatcher.run(cmd, args, NGUON_DOI_NGU);
    if (!r.ok) console.warn(`[đội ngũ] ${cmd} lỗi: ${r.error}`);
    return r;
  };

  const tuThe = (id: string) => dispatcher.world?.describe().actors.find((a) => a.id === id);

  function sangPha(moi: PhaQuyTrinh, them: Record<string, unknown> = {}): void {
    if (moi === pha) return;
    const truoc = pha;
    pha = moi;
    lichSuPha.push(moi);
    bus.emit('team.phase', { pha: moi, ten: TEN_PHA[moi], truoc, choCeoDuyet, ...them });
  }

  /** Luật 7: ghi một bản giấy tờ vào sổ quy trình (và bắn `team.record`). */
  function ghiSo(loai: LoaiBanGhi, ky: string, tomTat: string, chiTiet?: Record<string, unknown>): BanGhi {
    const b: BanGhi = { so: ++soCuoi, loai, t: bayGio(), ky, tomTat, ...(chiTiet ? { chiTiet } : {}) };
    so.push(b);
    if (so.length > TOI_DA_SO) so.splice(0, so.length - TOI_DA_SO);
    luuLai();
    bus.emit('team.record', { ...b });
    return b;
  }

  /** Luật 5: có việc mà chưa ai giao ⇒ đi qua pha nhận việc (ngầm) rồi lập kế hoạch. */
  function damBaoDaNhanViec(): void {
    if (pha !== 'nghi') return;
    ghiSo('nhan-viec', tenTruong, 'Nhận việc NGẦM — không có lệnh giao của CEO trước đó', { ngam: true });
    sangPha('nhan-viec', { ngam: true });
    sangPha('lap-ke-hoach', { ngam: true });
  }

  /* ---------------- thân người: chờ rảnh, đi, ngồi ---------------- */

  /** Chờ thân rảnh (có trần) — để các bước nối đúng thứ tự, không chen việc não. */
  async function choThan(actor: string): Promise<boolean> {
    let doi = 0;
    while (dispatcher.dangBan(actor) && !tat) {
      if (doi >= tranCho) return false;
      await nghi(150);
      doi += 150;
    }
    return !tat;
  }

  /** Đi tới một chỗ (đứng dậy trước nếu đang ngồi), rồi quay mặt. */
  async function diToi(
    actor: string,
    to: string | ChoDung | { x: number; z: number },
    nhin?: string | [number, number, number],
  ): Promise<boolean> {
    if (!(await choThan(actor))) return false;
    if (tuThe(actor)?.state === 'sitting') {
      await chay('actor.stand', { actor });
      if (!(await choThan(actor))) return false;
    }
    const dich = typeof to === 'string' ? to : [to.x, 0, to.z];
    const r = await chay('actor.moveTo', { actor, to: dich });
    if (!r.ok) return false;
    if (!(await choThan(actor))) return false;
    const huong = nhin ?? (typeof to !== 'string' && 'facing' in to ? huongDo(to) : undefined);
    if (huong) await chay('actor.faceTo', { actor, target: huong });
    return true;
  }

  /** Giám đốc về ngồi bàn mình (`ghe-2`) — không làm gì nếu đã ngồi đúng chỗ. */
  async function veBan(): Promise<void> {
    const st = tuThe(truong);
    if (st?.state === 'sitting' && st.at === 'ghe-2') return;
    if (!(await choThan(truong))) return;
    await chay('actor.sit', { actor: truong, seat: 'ghe-2' });
    await choThan(truong);
  }

  /** CEO phản ứng: nhìn Giám đốc + gật nhẹ (không chiếm thân — Ryan có thể đang lái Nam). */
  async function ceoNghe(ms: number, hoi = false): Promise<void> {
    await chay('actor.lookAt', { actor: sep, target: truong });
    await chay('actor.listen', { actor: sep, on: true, question: hoi });
    await nghi(ms);
    await chay('actor.listen', { actor: sep, on: false });
  }

  /** Nói = bong bóng + emoji, KHÔNG tiếng (chiếm thân trong lúc hiện — bước kế tiếp tự xếp sau). */
  async function noiCau(actor: string, text: string, ms = msBongBong(text)): Promise<void> {
    await chay('actor.bubble', { actor, text, durationMs: ms });
  }

  /** Nói rồi CHỜ câu đó hiện xong — để người kia đáp sau, hai câu không chồng nhau. */
  async function noiCauXong(actor: string, text: string, ms = msBongBong(text)): Promise<void> {
    await noiCau(actor, text, ms);
    await choThan(actor);
  }

  /**
   * Cấp dưới chào cấp trên: đứng thì CÚI CHÀO (gập người), đang ngồi thì GẬT
   * ĐẦU (gập người trên ghế là phá dáng ngồi). Quay mặt về cấp trên trước.
   */
  async function cuiChao(actor: string, capTren: string): Promise<void> {
    if (tuThe(actor)?.state === 'sitting') {
      await chay('actor.lookAt', { actor, target: capTren });
      await chay('actor.listen', { actor, on: true });
      await nghi(700);
      await chay('actor.listen', { actor, on: false });
      return;
    }
    await chay('actor.faceTo', { actor, target: capTren });
    await chay('actor.emote', { actor, emote: 'cui-chao' });
  }

  /* ---------------- thẻ tên + màn hình ---------------- */

  function theTruong(): string {
    if (choCeoDuyet) return `${tenTruong} · GĐ kỹ thuật · chờ CEO duyệt`;
    if (pha === 'nghi' || pha === 'nhan-viec') return `${tenTruong} · Giám đốc kỹ thuật`;
    if (pha === 'thuc-hien' && viecDangLam) {
      return `${tenTruong} · GĐ kỹ thuật · ${loiLienTiep ? 'đang sửa lỗi' : TEN_VIEC[viecDangLam]}`;
    }
    return `${tenTruong} · GĐ kỹ thuật · ${TEN_PHA[pha].toLowerCase()}`;
  }

  async function capNhatThe(): Promise<void> {
    tTheCuoi = bayGio();
    await chay('actor.label', { actor: truong, text: theTruong(), tone: 'truong' });
  }

  async function ganTheCoDinh(): Promise<void> {
    await chay('actor.label', { actor: truong, text: theTruong(), tone: 'truong' });
    await chay('actor.label', { actor: sep, text: `${tenSep} · CEO`, tone: 'ceo' });
  }

  async function hienManHinh(noiDung: string, kind = 'text'): Promise<void> {
    const mh = dispatcher.world?.describe().screens ?? [];
    if (!mh.some((s) => s.id === 'may-tinh')) return;
    tManCuoi = bayGio();
    await chay('screen.show', { screen: 'may-tinh', kind, content: noiDung });
  }

  /* ---------------- hàng việc của Giám đốc (luật 1) ---------------- */

  function lamTruong(ten: string, viec: () => Promise<void>): Promise<void> {
    soViecTruong += 1;
    const sau = hangTruong.then(async () => {
      try {
        if (tat) return;
        viecTruong = ten;
        await viec();
      } catch (e) {
        console.warn('[đội ngũ]', ten, e);
      } finally {
        viecTruong = null;
        soViecTruong -= 1;
      }
    });
    hangTruong = sau;
    return sau;
  }

  /* ---------------- chuỗi của từng nhân viên ---------------- */

  function noi(idSk: string, viec: () => Promise<void>): void {
    const truoc = chuoi.get(idSk) ?? Promise.resolve();
    const sau = truoc.then(viec).catch((e) => console.warn('[đội ngũ]', e));
    chuoi.set(idSk, sau);
  }

  function chonCho(khu: KhuLam): ChoLam | null {
    const dangGiu = new Set([...theoSuKien.values()].map((n) => n.cho).filter(Boolean));
    return CHO_LAM[khu].find((c) => !dangGiu.has(c)) ?? null;
  }

  const phatNv = (nv: NhanVienNoi, them: Record<string, unknown> = {}) =>
    bus.emit('team.member', { actor: nv.actor, role: nv.role, khu: nv.khu, pha: nv.pha, source: nv.source, ...them });

  async function veChoLam(nv: NhanVienNoi): Promise<void> {
    const c = nv.cho;
    if (c && 'seat' in c) {
      await chay('actor.sit', { actor: nv.actor, seat: c.seat });
    } else if (c) {
      await diToi(nv.actor, c);
      await chay('actor.play', { actor: nv.actor, clip: 'type', loop: true });
    } else {
      // hết chỗ trong khu: đứng làm ở Pantry cho đỡ chen
      const p = CHO_LAM.pantry[0] as ChoDung;
      await diToi(nv.actor, { x: p.x + (daHien % 3) * 0.6, z: p.z, facing: p.facing });
      await chay('actor.play', { actor: nv.actor, clip: 'think', loop: true });
    }
  }

  async function roiDi(nv: NhanVienNoi, ok: boolean): Promise<void> {
    nv.pha = 've';
    phatNv(nv, { ok });
    await choThan(nv.actor);
    if (nv.huy) await noiCauXong(nv.actor, LOI.veTruoc);
    if (tuThe(nv.actor)?.state === 'sitting') await chay('actor.stand', { actor: nv.actor });
    await diToi(nv.actor, 'cua');
    await chay('actor.remove', { actor: nv.actor });
    theoSuKien.delete(nv.idSk);
    chuoi.delete(nv.idSk);
    bus.emit('team.member', { actor: nv.actor, role: nv.role, khu: nv.khu, pha: 'roi', ok, source: nv.source });
    sauKhiNhanVienVe();
  }

  /** Nhân viên cuối về: báo cáo đang hoãn thì chạy, không thì Giám đốc làm tiếp. */
  function sauKhiNhanVienVe(): void {
    if (theoSuKien.size > 0 || choGiao.length) return;
    if (baoCaoCho) {
      baoCaoCho = false;
      void lamTruong('bao-cao', baoCao);
    } else if (pha === 'duyet' || pha === 'giao-viec') {
      sangPha('thuc-hien');
      void capNhatThe();
    }
  }

  /* ---------------- các việc của Giám đốc ---------------- */

  async function moPhien(): Promise<void> {
    sangPha('nghi');
    await capNhatThe();
    // CEO đang đứng rảnh ở bàn mình ⇒ ngồi vào ghế CEO
    const ceo = tuThe(sep);
    if (ceo?.state === 'idle' && ceo.at === 'ban-ceo' && !dispatcher.dangBan(sep)) {
      await chay('actor.sit', { actor: sep, seat: 'ghe-ceo' });
    }
    await chay('actor.lookAt', { actor: truong, target: sep });
    if (!(await choThan(truong))) return;
    await cuiChao(truong, sep);
    await noiCauXong(truong, LOI.chaoCeo);
    await noiCauXong(sep, LOI.ceoChaoLai);
    await veBan();
  }

  /**
   * Giấy tờ + pha của lệnh giao việc ghi NGAY lúc nhận `brief`, không đợi tới lượt
   * trong hàng việc của Giám đốc: hàng đó còn đang diễn màn chào CEO vài giây, và
   * subagent (`spawn`) tới trong lúc ấy sẽ thấy pha "nghỉ" ⇒ ghi oan "nhận việc
   * NGẦM" rồi pha bị kéo lùi về "nhận việc" (đo thật trên Bàn duyệt 28/10).
   */
  function ghiNhanViec(): void {
    sangPha('nhan-viec');
    ghiSo('nhan-viec', tenSep, `CEO ${tenSep} giao việc cho Giám đốc ${tenTruong}`);
  }

  /** Phần DIỄN của nhận việc (chạy theo lượt trong hàng việc của Giám đốc). */
  async function nhanViec(): Promise<void> {
    await capNhatThe();
    if (await diToi(truong, CHO_BAO_CAO_CEO, sep)) {
      // tới KẾ BÊN CEO: cúi chào → CEO giao (Giám đốc nghe + gật) → nhận lời
      await cuiChao(truong, sep);
      await choThan(truong);
      await chay('actor.lookAt', { actor: sep, target: truong });
      await chay('actor.listen', { actor: truong, on: true });
      await noiCauXong(sep, LOI.ceoGiaoViec);
      await chay('actor.listen', { actor: truong, on: false });
      await noiCauXong(truong, LOI.nhanViec);
      await veBan();
    } else {
      await chay('actor.lookAt', { actor: truong, target: sep });
    }
    // đội đã vào việc trong lúc diễn ⇒ không kéo pha lùi
    if (pha !== 'nhan-viec') return;
    sangPha('lap-ke-hoach');
    await capNhatThe();
    await noiCau(truong, LOI.lapKeHoach);
    await hienManHinh('KẾ HOẠCH\n• Phân tích yêu cầu của CEO\n• Chia việc cho đội\n• Thực hiện → duyệt → báo cáo');
  }

  /** Luật 2: giao việc cho một đợt nhân viên — họp nếu ≥ 2, giao riêng nếu 1. */
  async function giaoViec(dot: NhanVienNoi[]): Promise<void> {
    const conLai: NhanVienNoi[] = [];
    for (const nv of dot) if ((await nv.vaoXong) && !nv.huy) conLai.push(nv);
    if (!conLai.length) return;
    damBaoDaNhanViec();
    sangPha('giao-viec');
    await capNhatThe();
    if (conLai.length >= 2) await hopNhom(conLai);
    else await giaoRieng(conLai[0]!);
    for (const nv of conLai) nv.baoGiao();
    sangPha('thuc-hien');
    viecDangLam = null;
    await capNhatThe();
  }

  async function hopNhom(dot: NhanVienNoi[]): Promise<void> {
    const batDau = bayGio();
    bus.emit('team.meeting', { pha: 'bat-dau', truong, nhanVien: dot.map((n) => n.actor) });
    const nhiToi = diToi(truong, CHO_CHU_TRI_HOP);
    await Promise.all(dot.map((nv, i) => diToi(nv.actor, CHO_HOP[i % CHO_HOP.length]!, truong)));
    await nhiToi;
    // nhân viên chào chủ trì (cùng lúc), chủ trì mở họp, giao việc, cả đội "Dạ rõ"
    await Promise.all(dot.map((nv) => cuiChao(nv.actor, truong)));
    await Promise.all(dot.map((nv) => choThan(nv.actor)));
    await chay('actor.lookAt', { actor: truong, target: dot[0]!.actor });
    await noiCauXong(truong, LOI.moHop);
    await chay('actor.emote', { actor: truong, emote: 'ra-lenh' });
    await Promise.all(dot.map((nv) => chay('actor.listen', { actor: nv.actor, on: true })));
    await nghi(1500);
    await Promise.all(dot.map((nv) => chay('actor.listen', { actor: nv.actor, on: false })));
    await Promise.all(dot.map((nv) => noiCau(nv.actor, LOI.dongYHop)));
    await choThan(truong);
    await noiCauXong(truong, LOI.chotHop);
    // biên bản họp: chủ trì, thành phần, phân công — ký bởi người chủ trì
    const phanCong = dot.map((n) => ({ actor: n.actor, vai: tenCuaVai(n.role), viec: n.task }));
    const bb = ghiSo('bien-ban-hop', tenTruong, `Biên bản họp giao việc — ${dot.length} người`, {
      chuTri: tenTruong,
      diaDiem: 'Phòng họp',
      batDau,
      ketThuc: bayGio(),
      thanhPhan: [tenTruong, ...phanCong.map((p) => p.vai)],
      phanCong,
    });
    await hienManHinhHop(bb, phanCong);
    bus.emit('team.meeting', { pha: 'xong', truong, nhanVien: dot.map((n) => n.actor), bienBan: bb.so });
    await veBan();
  }

  async function hienManHinhHop(bb: BanGhi, phanCong: { vai: string; viec: string }[]): Promise<void> {
    const mh = dispatcher.world?.describe().screens ?? [];
    if (!mh.some((x) => x.id === 'tivi')) return;
    const dong = phanCong.map((p) => `• ${p.vai} — ${p.viec || '(việc chưa ghi)'}`.slice(0, 70));
    await chay('screen.show', {
      screen: 'tivi',
      kind: 'text',
      content: [`BIÊN BẢN HỌP SỐ ${bb.so}`, `Chủ trì: ${tenTruong} (Giám đốc kỹ thuật)`, 'Phân công:', ...dong, `Ký: ${tenTruong}`].join('\n'),
    });
  }

  async function giaoRieng(nv: NhanVienNoi): Promise<void> {
    await veBan();
    await diToi(nv.actor, choNop(soNop++), truong);
    await cuiChao(nv.actor, truong);
    await noiCauXong(nv.actor, LOI.chaoGiamDoc);
    await chay('actor.lookAt', { actor: truong, target: nv.actor });
    await chay('actor.listen', { actor: nv.actor, on: true });
    await noiCauXong(truong, LOI.giaoRieng(nv.task));
    await chay('actor.listen', { actor: nv.actor, on: false });
    await noiCauXong(nv.actor, LOI.lamNgay);
    ghiSo('phieu-giao', tenTruong, `Phiếu giao việc: ${tenCuaVai(nv.role)} — ${nv.task || '(việc chưa ghi)'}`, {
      actor: nv.actor,
      vai: tenCuaVai(nv.role),
      viec: nv.task,
    });
  }

  /**
   * Luật 3 + 7: Giám đốc duyệt bài một nhân viên đang đứng trước bàn và ĐÓNG
   * DẤU: `ok` ⇒ "ĐÃ KIỂM NHẬN"; không ⇒ "TRẢ LẠI" (`lamLai` = về làm lại).
   */
  async function duyet(nv: NhanVienNoi, ok: boolean, lamLai = false): Promise<void> {
    if (pha !== 'bao-cao') sangPha('duyet');
    await capNhatThe();
    await veBan();
    await chay('actor.lookAt', { actor: truong, target: nv.actor });
    if (ok) {
      await chay('actor.listen', { actor: truong, on: true });
      await chay('actor.express', { actor: truong, expression: 'happy', weight: 0.8, durationMs: 1500 });
    } else {
      // bài lỗi: Giám đốc hỏi lại (nghiêng đầu), mặt lo
      await chay('actor.listen', { actor: truong, on: true, question: true });
      await chay('actor.express', { actor: truong, expression: 'sad', weight: 0.6, durationMs: 1800 });
    }
    await noiCauXong(truong, ok ? LOI.kiemNhan : lamLai ? LOI.traLaiLamLai : LOI.traLai);
    await chay('actor.listen', { actor: truong, on: false });
    const dau = ok ? 'ĐÃ KIỂM NHẬN' : lamLai ? 'TRẢ LẠI — LÀM LẠI' : 'TRẢ LẠI';
    if (ok) demKiemNhan.dat += 1;
    else demKiemNhan.traLai += 1;
    const b = ghiSo(ok ? 'kiem-nhan' : 'tra-lai', tenTruong, `${dau}: ${tenCuaVai(nv.role)} — ${nv.task || '(việc chưa ghi)'}`, {
      actor: nv.actor,
      vai: tenCuaVai(nv.role),
      viec: nv.task,
      dau,
      lamLai,
    });
    // dấu hiện ngay trên thẻ người nộp — ai nhìn cũng biết bài đã qua cấp trên
    await chay('actor.label', { actor: nv.actor, text: `${tenCuaVai(nv.role)} · ${ok ? '✔' : '✘'} ${dau}`, tone: 'nhan-vien' });
    bus.emit('team.review', { truong, actor: nv.actor, role: nv.role, ok, lamLai, dau, so: b.so });
  }

  async function baoCao(): Promise<void> {
    damBaoDaNhanViec();
    sangPha('bao-cao');
    viecDangLam = null;
    await capNhatThe();
    if (await diToi(truong, CHO_BAO_CAO_CEO, sep)) {
      await cuiChao(truong, sep);
      await choThan(truong);
      await chay('actor.lookAt', { actor: sep, target: truong });
      await noiCauXong(truong, LOI.baoCao(demKiemNhan.dat, demKiemNhan.traLai));
      await chay('actor.listen', { actor: sep, on: true });
      await nghi(600);
      await chay('actor.listen', { actor: sep, on: false });
      // ký tay: CEO thật ký ở Bàn duyệt, Nam không tự đóng dấu thay
      if (kyTay) await noiCauXong(sep, LOI.ceoXemSau);
      else await noiCauXong(sep, loiLienTiep || demKiemNhan.traLai ? LOI.ceoDuyetCoLoi : LOI.ceoDuyet);
      await noiCauXong(truong, LOI.daA);
      await veBan();
    }
    const tot = loiLienTiep === 0;
    const tomTat = `Báo cáo CEO: ${demKiemNhan.dat} bài kiểm nhận, ${demKiemNhan.traLai} bài trả lại`;
    const bc = ghiSo('bao-cao', tenTruong, tomTat, { ...demKiemNhan, ok: tot, ...(kyTay ? { choKy: true } : {}) });
    if (kyTay) {
      choKy.push({ so: bc.so, t: bc.t, tomTat, dat: demKiemNhan.dat, traLai: demKiemNhan.traLai, ok: tot });
      luuLai();
      bus.emit('team.report', { truong, sep, ok: tot, baoCao: bc.so, choKy: true, ...demKiemNhan });
    } else {
      const dauCeo = ghiSo('ceo-duyet', tenSep, `CEO ĐÃ DUYỆT báo cáo số ${bc.so}`, { baoCao: bc.so });
      bus.emit('team.report', { truong, sep, ok: tot, baoCao: bc.so, dauCeo: dauCeo.so, ...demKiemNhan });
    }
    demKiemNhan = { dat: 0, traLai: 0 };
    loiLienTiep = 0;
    sangPha('nghi');
    await capNhatThe();
  }

  async function xinDuyet(): Promise<void> {
    choCeoDuyet = true;
    xinDuyetLuc = bayGio();
    ghiSo('xin-duyet', tenTruong, `Giám đốc ${tenTruong} xin CEO duyệt`);
    bus.emit('team.phase', { pha, ten: TEN_PHA[pha], truoc: pha, choCeoDuyet: true });
    await capNhatThe();
    if (await diToi(truong, CHO_BAO_CAO_CEO, sep)) {
      await cuiChao(truong, sep);
      await choThan(truong);
      await noiCauXong(truong, LOI.xinDuyet);
    }
    await chay('actor.lookAt', { actor: sep, target: truong });
  }

  async function hetChoDuyet(): Promise<void> {
    if (!choCeoDuyet) return;
    choCeoDuyet = false;
    xinDuyetLuc = null;
    bus.emit('team.phase', { pha, ten: TEN_PHA[pha], truoc: pha, choCeoDuyet: false });
    await ceoNghe(500);
    await noiCauXong(sep, LOI.ceoTraLoi);
    await noiCauXong(truong, LOI.daA);
    await capNhatThe();
    await choThan(truong);
    await veBan();
  }

  async function gonNgu(): Promise<void> {
    // PreCompact: Giám đốc ra kệ hồ sơ sắp xếp lại ghi chép rồi về bàn
    if (await diToi(truong, 'ke-module')) {
      await noiCau(truong, LOI.gonHoSo);
      await chay('actor.play', { actor: truong, clip: 'think' });
      await choThan(truong);
    }
    await veBan();
  }

  async function hetPhien(): Promise<void> {
    for (const nv of theoSuKien.values()) {
      nv.huy = true;
      nv.baoGiao();
    }
    choGiao = [];
    baoCaoCho = false;
    choCeoDuyet = false;
    xinDuyetLuc = null;
    viecDangLam = null;
    sangPha('nghi');
    await capNhatThe();
    await noiCauXong(truong, LOI.hetPhien);
    if (await diToi(truong, 'sofa')) await chay('actor.sit', { actor: truong, seat: 'sofa' });
  }

  /* ---------------- nhận sự kiện ---------------- */

  function vao(sk: SuKienDoiNgu): void {
    if (theoSuKien.has(sk.id)) return; // sự kiện lặp
    if (theoSuKien.size >= TOI_DA_NHAN_VIEN) {
      khongHien += 1;
      return;
    }
    damBaoDaNhanViec();
    const khu = khuCuaVai(sk.role);
    const vx = hua<boolean>();
    const gx = hua<void>();
    const nv: NhanVienNoi = {
      idSk: sk.id,
      actor: idNhanVien(sk.id),
      role: chuanVai(sk.role),
      khu,
      cho: null,
      task: sk.task,
      source: sk.source,
      pha: 'vao',
      vaoXong: vx.p,
      giaoXong: gx.p,
      baoGiao: gx.giai,
      huy: false,
    };
    nv.cho = chonCho(khu);
    theoSuKien.set(sk.id, nv);
    daHien += 1;
    phatNv(nv, { task: nv.task });

    noi(sk.id, async () => {
      const r = await chay('actor.spawn', { id: nv.actor, name: tenCuaVai(sk.role), at: 'cua', controlledBy: 'agent' });
      if (!r.ok) {
        theoSuKien.delete(sk.id);
        choGiao = choGiao.filter((x) => x !== nv);
        vx.giai(false);
        gx.giai();
        return;
      }
      const viec = nv.task.length > 34 ? `${nv.task.slice(0, 33)}…` : nv.task;
      await chay('actor.label', {
        actor: nv.actor,
        text: viec ? `${tenCuaVai(sk.role)} · ${viec}` : tenCuaVai(sk.role),
        tone: 'nhan-vien',
      });
      await chay('actor.lookAt', { actor: nv.actor, target: truong });
      nv.pha = 'cho-giao';
      phatNv(nv);
      vx.giai(true);
      // luật 2: KHÔNG tự về chỗ — chờ Giám đốc giao việc
      await nv.giaoXong;
      if (nv.huy) return roiDi(nv, false);
      await veChoLam(nv);
      nv.pha = 'lam';
      phatNv(nv);
    });

    choGiao.push(nv);
    if (!henGiao) {
      henGiao = true;
      void nghi(cuaSoGiao).then(() => {
        henGiao = false;
        const dot = choGiao;
        choGiao = [];
        if (dot.length && !tat) void lamTruong('giao-viec', () => giaoViec(dot));
      });
    }
  }

  function xongViec(sk: SuKienDoiNgu): void {
    const nv = theoSuKien.get(sk.id);
    if (!nv) {
      ghiSo('vi-pham', sk.source, `Nộp bài "${sk.kind}" cho việc chưa từng được giao (${sk.id.slice(0, 24)}) — bỏ qua`);
      return;
    }
    const tot = sk.kind === 'done';
    const lamLai = sk.kind === 'rework';
    noi(sk.id, async () => {
      if (nv.huy || !theoSuKien.has(sk.id)) return;
      nv.pha = 'nop';
      phatNv(nv, { ok: tot });
      await choThan(nv.actor);
      if (tuThe(nv.actor)?.state === 'sitting' || (nv.cho && 'seat' in nv.cho)) {
        await chay('actor.stand', { actor: nv.actor });
      } else {
        await chay('actor.stop', { actor: nv.actor });
      }
      await diToi(nv.actor, choNop(soNop++), truong);
      await cuiChao(nv.actor, truong);
      await noiCauXong(nv.actor, tot || lamLai ? LOI.nopBai : LOI.nopBaiLoi);
      nv.pha = 'cho-duyet';
      phatNv(nv, { ok: tot });
      // luật 3: chờ Giám đốc duyệt + đóng dấu xong mới được đi
      await lamTruong('duyet', () => duyet(nv, tot, lamLai));
      await cuiChao(nv.actor, truong);
      await noiCauXong(nv.actor, tot ? LOI.camOn : lamLai ? LOI.suaNgay : LOI.xinLoi);
      if (lamLai) {
        // bị trả lại: quay về chỗ làm, làm lại — chưa được về
        nv.pha = 'lam-lai';
        phatNv(nv);
        await veChoLam(nv);
        nv.pha = 'lam';
        phatNv(nv);
        return;
      }
      await roiDi(nv, tot);
    });
  }

  /** Giám đốc tự làm (tool của agent chính): thẻ + màn hình, giãn nhịp, không chiếm thân. */
  function lamViec(sk: SuKienDoiNgu): void {
    damBaoDaNhanViec();
    viecDangLam = sk.tool;
    if (pha === 'lap-ke-hoach' && !VIEC_TIM_HIEU.has(sk.tool)) sangPha('thuc-hien');
    const t = bayGio();
    if (t - tTheCuoi >= 2000) void capNhatThe();
    if (t - tManCuoi >= 4000 && pha === 'thuc-hien') {
      void hienManHinh(`▶ ${TEN_VIEC[sk.tool]}…`, sk.tool === 'viet' ? 'code' : 'log');
    }
  }

  function ketQuaViec(sk: SuKienDoiNgu): void {
    // bong bóng chỉ khi Giám đốc đang rảnh thân — không chen vào việc khác (nó chiếm thân)
    const ranh = !dispatcher.dangBan(truong) && viecTruong === null;
    if (!sk.ok) {
      loiLienTiep += 1;
      void chay('actor.express', { actor: truong, expression: 'sad', weight: 0.6, durationMs: 2500 });
      if (ranh && loiLienTiep === 1) void noiCau(truong, LOI.loiRoi);
      void capNhatThe();
    } else if (loiLienTiep > 0) {
      loiLienTiep = 0;
      void chay('actor.express', { actor: truong, expression: 'happy', weight: 0.9, durationMs: 2000 });
      if (ranh) void noiCau(truong, LOI.xanhRoi);
      void capNhatThe();
    }
  }

  void ganTheCoDinh();
  const goReset = bus.on('stage.reset', () => {
    theoSuKien.clear();
    chuoi.clear();
    choGiao = [];
    baoCaoCho = false;
    choCeoDuyet = false;
    xinDuyetLuc = null;
    pha = 'nghi';
    void ganTheCoDinh();
  });

  const go = bus.on('team.event', (e) => {
    if (tat) return;
    const d = e.data as Partial<SuKienDoiNgu> | undefined;
    if (!d || typeof d.id !== 'string' || typeof d.kind !== 'string') return;
    if (!(LOAI_SU_KIEN as readonly string[]).includes(d.kind)) return;
    const sk: SuKienDoiNgu = {
      kind: d.kind as LoaiSuKien,
      id: d.id,
      role: typeof d.role === 'string' ? d.role : 'general-purpose',
      task: typeof d.task === 'string' ? d.task : '',
      source: typeof d.source === 'string' ? d.source : 'khac',
      tool: (LOAI_VIEC as readonly string[]).includes(String(d.tool)) ? (d.tool as LoaiViec) : 'khac',
      ok: d.ok !== false,
    };
    // luật 6: sự kiện nào (trừ một lần hỏi nữa) cũng nghĩa là CEO đã trả lời
    if (choCeoDuyet && sk.kind !== 'ask') void lamTruong('het-cho-duyet', hetChoDuyet);
    switch (sk.kind) {
      case 'session-start':
        void lamTruong('mo-phien', moPhien);
        break;
      case 'brief':
        ghiNhanViec();
        void lamTruong('nhan-viec', nhanViec);
        break;
      case 'work':
        lamViec(sk);
        break;
      case 'work-result':
        ketQuaViec(sk);
        break;
      case 'spawn':
        vao(sk);
        break;
      case 'done':
      case 'fail':
      case 'rework':
        xongViec(sk);
        break;
      case 'ask':
        if (!choCeoDuyet) void lamTruong('xin-duyet', xinDuyet);
        break;
      case 'report':
        // luật 4: còn nhân viên chưa nộp bài thì hoãn
        if (theoSuKien.size > 0 || choGiao.length) {
          baoCaoCho = true;
          bus.emit('team.phase', { pha, ten: TEN_PHA[pha], truoc: pha, choCeoDuyet, baoCaoCho: true });
        } else void lamTruong('bao-cao', baoCao);
        break;
      case 'compact':
        void lamTruong('gon-ngu', gonNgu);
        break;
      case 'session-end':
        void lamTruong('het-phien', hetPhien);
        break;
    }
  });

  /** Diễn cảnh CEO ký (không chờ — Bàn duyệt cần câu trả lời ngay). */
  async function dienKy(soBc: number, duyet: boolean): Promise<void> {
    await noiCauXong(sep, duyet ? LOI.ceoKyDuyet(soBc) : LOI.ceoKyTraLai(soBc));
    await choThan(truong);
    await noiCauXong(truong, duyet ? LOI.camOnCeo : LOI.xemLai);
    await capNhatThe();
  }

  function kyBaoCao(soBc: number, quyet: QuyetDinhCeo, gopY = ''): BanGhi {
    const i = choKy.findIndex((c) => c.so === soBc);
    if (i < 0) throw new Error(`Báo cáo số ${soBc} không nằm trong hàng chờ ký`);
    const duyet = quyet === 'approve';
    const y = gopY.replace(/\s+/g, ' ').trim().slice(0, TOI_DA_GOP_Y);
    choKy.splice(i, 1);
    const dau = duyet
      ? ghiSo('ceo-duyet', tenSep, `CEO ĐÃ DUYỆT báo cáo số ${soBc} (ký tay)`, { baoCao: soBc, kyTay: true, ...(y ? { gopY: y } : {}) })
      : ghiSo('ceo-tra-lai', tenSep, `CEO TRẢ LẠI báo cáo số ${soBc}${y ? `: ${y}` : ''}`, { baoCao: soBc, kyTay: true, gopY: y });
    bus.emit('team.signed', { baoCao: soBc, quyet, dauCeo: dau.so, ...(y ? { gopY: y } : {}) });
    void lamTruong(duyet ? 'ceo-ky' : 'ceo-tra-lai', () => dienKy(soBc, duyet));
    return { ...dau };
  }

  return {
    kyBaoCao,
    trangThai: () => ({
      truong,
      sep,
      pha,
      choCeoDuyet,
      baoCaoCho,
      viecTruong,
      nhanVien: [...theoSuKien.values()].map(({ actor, role, khu, cho, task, source, pha: p }) => ({
        actor,
        role,
        khu,
        cho,
        task,
        source,
        pha: p,
      })),
      khongHien,
      daHien,
      lichSuPha: [...lichSuPha],
      soQuyTrinh: so.map((b) => ({ ...b })),
      ceoKyTay: kyTay,
      choKy: choKy.map((c) => ({ ...c })),
      xinDuyetLuc,
    }),
    async xong() {
      // chuỗi + hàng Giám đốc + hẹn gom có thể nối thêm bước — chờ tới khi đứng yên
      for (let i = 0; i < 80; i += 1) {
        if (henGiao) {
          await nghi(cuaSoGiao);
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }
        const ds = [...chuoi.values(), hangTruong];
        await Promise.all(ds);
        await new Promise((r) => setTimeout(r, 0));
        const moi = [...chuoi.values(), hangTruong];
        if (!henGiao && soViecTruong === 0 && moi.every((p) => ds.includes(p))) return;
      }
    },
    dung() {
      tat = true;
      go();
      goReset();
    },
  };
}
