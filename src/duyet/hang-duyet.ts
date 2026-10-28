/**
 * hang-duyet.ts — logic THUẦN của trang Bàn duyệt (phương án 1, Ryan 28/10):
 * biến `team.state` thành "việc cần anh quyết", số đo hôm nay, và lọc sổ.
 * Không DOM, không ws — test được bằng vitest.
 *
 * Nguyên tắc (từ clip Versarix + bản rà GenOS): trang tổ chức theo CÂU HỎI của
 * Sếp — "tôi cần quyết gì ngay" — không theo phân hệ dữ liệu.
 */
import type { BanGhi, BaoCaoChoKy, LoaiBanGhi, TrangThaiDoiNgu } from '../behavior/doi-ngu';

/** Một dòng trong hàng "Cần anh quyết". */
export type ViecCanQuyet =
  | { loai: 'ky-bao-cao'; khoa: string; t: number; tieuDe: string; moTa: string; baoCao: BaoCaoChoKy; lienQuan: BanGhi[] }
  | { loai: 'cho-tra-loi'; khoa: string; t: number; tieuDe: string; moTa: string };

export interface SoDoHomNay {
  choKy: number;
  dangLam: number;
  kiemNhan: number;
  traLai: number;
  ceoDuyet: number;
  viPham: number;
}

/** Nhãn tiếng Việt cho loại giấy tờ (cột "Loại" của sổ). */
export const TEN_LOAI: Readonly<Record<LoaiBanGhi, string>> = {
  'nhan-viec': 'Nhận việc',
  'bien-ban-hop': 'Biên bản họp',
  'phieu-giao': 'Phiếu giao',
  'kiem-nhan': 'Kiểm nhận',
  'tra-lai': 'Trả lại',
  'xin-duyet': 'Xin duyệt',
  'bao-cao': 'Báo cáo',
  'ceo-duyet': 'CEO duyệt',
  'ceo-tra-lai': 'CEO trả lại',
  'vi-pham': 'Vi phạm',
};

/** Giấy tờ thuộc một báo cáo: từ sau báo cáo trước tới chính nó. */
export function giayToCuaBaoCao(so: readonly BanGhi[], soBc: number): BanGhi[] {
  const i = so.findIndex((b) => b.so === soBc);
  if (i < 0) return [];
  let dau = i;
  while (dau > 0 && so[dau - 1]!.loai !== 'bao-cao') dau -= 1;
  return so.slice(dau, i + 1);
}

/**
 * Hàng "Cần anh quyết": báo cáo chờ ký (cũ nhất trước — chờ lâu nhất lên đầu),
 * rồi Claude Code đang chờ anh ở terminal (không trả lời từ web được: hook
 * không bao giờ được chặn Claude Code — chỉ nhắc).
 */
export function hangCanQuyet(tt: TrangThaiDoiNgu): ViecCanQuyet[] {
  const ra: ViecCanQuyet[] = [...tt.choKy]
    .sort((a, b) => a.t - b.t)
    .map((bc) => ({
      loai: 'ky-bao-cao' as const,
      khoa: `bc-${bc.so}`,
      t: bc.t,
      tieuDe: `Ký báo cáo #${bc.so}`,
      moTa: `${bc.dat} bài kiểm nhận · ${bc.traLai} bài trả lại${bc.ok ? '' : ' · phiên có lỗi'}`,
      baoCao: bc,
      lienQuan: giayToCuaBaoCao(tt.soQuyTrinh, bc.so),
    }));
  if (tt.choCeoDuyet && tt.xinDuyetLuc !== null) {
    ra.push({
      loai: 'cho-tra-loi',
      khoa: `ask-${tt.xinDuyetLuc}`,
      t: tt.xinDuyetLuc,
      tieuDe: 'Agent đang chờ anh trả lời',
      moTa: 'Trả lời ngay trong terminal Claude Code — Nhi đứng chờ ở bàn CEO tới khi anh trả lời',
    });
  }
  return ra;
}

const cungNgay = (a: number, b: number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

/** Bốn – sáu con số đầu trang, tính theo NGÀY của `bayGio`. */
export function soDoHomNay(tt: TrangThaiDoiNgu, bayGio: number): SoDoHomNay {
  const hn = tt.soQuyTrinh.filter((b) => cungNgay(b.t, bayGio));
  const dem = (l: LoaiBanGhi) => hn.filter((b) => b.loai === l).length;
  return {
    choKy: tt.choKy.length,
    dangLam: tt.nhanVien.length,
    kiemNhan: dem('kiem-nhan'),
    traLai: dem('tra-lai') + dem('ceo-tra-lai'),
    ceoDuyet: dem('ceo-duyet'),
    viPham: dem('vi-pham'),
  };
}

/** Lọc sổ: theo loại (rỗng = mọi loại) + chữ (không dấu, không phân biệt hoa). Mới nhất trước. */
export function locSo(so: readonly BanGhi[], loai: LoaiBanGhi | '', chu: string): BanGhi[] {
  const q = boDau(chu.trim());
  return so
    .filter((b) => !loai || b.loai === loai)
    .filter((b) => !q || boDau(`${b.so} ${b.tomTat} ${b.ky} ${TEN_LOAI[b.loai] ?? b.loai}`).includes(q))
    .slice()
    .reverse();
}

export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** "14:05" hôm nay, "27/10 14:05" ngày khác. */
export function gioNgan(t: number, bayGio: number): string {
  const d = new Date(t);
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return cungNgay(t, bayGio) ? hh : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}`;
}

/** "chờ 3 phút", "chờ 2 giờ" — Sếp nhìn là biết việc nào đọng lâu. */
export function daCho(t: number, bayGio: number): string {
  const s = Math.max(0, Math.round((bayGio - t) / 1000));
  if (s < 60) return 'vừa xong';
  const p = Math.round(s / 60);
  if (p < 60) return `chờ ${p} phút`;
  const g = Math.round(p / 60);
  if (g < 48) return `chờ ${g} giờ`;
  return `chờ ${Math.round(g / 24)} ngày`;
}

export const TEN_PHA_NV: Readonly<Record<string, string>> = {
  vao: 'Vào cửa',
  'cho-giao': 'Chờ giao việc',
  lam: 'Đang làm',
  nop: 'Nộp bài',
  'cho-duyet': 'Chờ duyệt',
  'lam-lai': 'Làm lại',
  ve: 'Ra về',
};
