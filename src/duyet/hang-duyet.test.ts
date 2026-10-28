import { describe, expect, it } from 'vitest';
import type { BanGhi, TrangThaiDoiNgu } from '../behavior/doi-ngu';
import { boDau, daCho, giayToCuaBaoCao, gioNgan, hangCanQuyet, locSo, soDoHomNay } from './hang-duyet';
import { urlBridgeMacDinh } from './ket-noi';

const T = new Date(2026, 9, 28, 10, 0).getTime();
const bg = (so: number, loai: BanGhi['loai'], t = T, tomTat = `bản ${so}`): BanGhi => ({ so, loai, t, ky: 'Nhi', tomTat });

const tt = (them: Partial<TrangThaiDoiNgu> = {}): TrangThaiDoiNgu => ({
  truong: 'gen',
  sep: 'owner',
  pha: 'nghi',
  choCeoDuyet: false,
  baoCaoCho: false,
  viecTruong: null,
  nhanVien: [],
  khongHien: 0,
  daHien: 0,
  lichSuPha: ['nghi'],
  soQuyTrinh: [],
  ceoKyTay: true,
  choKy: [],
  xinDuyetLuc: null,
  ...them,
});

describe('Bàn duyệt — logic thuần', () => {
  it('giấy tờ của một báo cáo = từ sau báo cáo trước tới chính nó', () => {
    const so = [bg(1, 'nhan-viec'), bg(2, 'kiem-nhan'), bg(3, 'bao-cao'), bg(4, 'ceo-duyet'), bg(5, 'kiem-nhan'), bg(6, 'bao-cao')];
    expect(giayToCuaBaoCao(so, 6).map((b) => b.so)).toEqual([4, 5, 6]);
    expect(giayToCuaBaoCao(so, 3).map((b) => b.so)).toEqual([1, 2, 3]);
    expect(giayToCuaBaoCao(so, 99)).toEqual([]);
  });

  it('hàng cần quyết: báo cáo cũ nhất trước, rồi lời nhắc agent đang chờ ở terminal', () => {
    const h = hangCanQuyet(
      tt({
        soQuyTrinh: [bg(3, 'bao-cao'), bg(7, 'bao-cao')],
        choKy: [
          { so: 7, t: T + 5000, tomTat: '', dat: 2, traLai: 1, ok: false },
          { so: 3, t: T, tomTat: '', dat: 1, traLai: 0, ok: true },
        ],
        choCeoDuyet: true,
        xinDuyetLuc: T + 9000,
      }),
    );
    expect(h.map((v) => v.khoa)).toEqual(['bc-3', 'bc-7', `ask-${T + 9000}`]);
    expect(h[1]!.moTa).toContain('phiên có lỗi');
    expect(h[2]!.loai).toBe('cho-tra-loi');
  });

  it('số đo hôm nay chỉ đếm bản ghi CÙNG NGÀY', () => {
    const homQua = T - 24 * 3600 * 1000;
    const s = soDoHomNay(
      tt({
        soQuyTrinh: [bg(1, 'kiem-nhan', homQua), bg(2, 'kiem-nhan'), bg(3, 'tra-lai'), bg(4, 'ceo-tra-lai'), bg(5, 'ceo-duyet'), bg(6, 'vi-pham')],
        choKy: [{ so: 9, t: T, tomTat: '', dat: 0, traLai: 0, ok: true }],
      }),
      T,
    );
    expect(s).toEqual({ choKy: 1, dangLam: 0, kiemNhan: 1, traLai: 2, ceoDuyet: 1, viPham: 1 });
  });

  it('lọc sổ: theo loại + chữ không dấu, mới nhất trước', () => {
    const so = [bg(1, 'bao-cao', T, 'Báo cáo CEO: 2 bài'), bg(2, 'kiem-nhan', T, 'Đạt: Thợ xây'), bg(3, 'bao-cao', T, 'Báo cáo CEO: 1 bài')];
    expect(locSo(so, '', '').map((b) => b.so)).toEqual([3, 2, 1]);
    expect(locSo(so, 'bao-cao', '').map((b) => b.so)).toEqual([3, 1]);
    expect(locSo(so, '', 'tho xay').map((b) => b.so)).toEqual([2]);
    expect(boDau('Đạt Ứng')).toBe('dat ung');
  });

  it('giờ ngắn + thời gian chờ', () => {
    expect(gioNgan(T, T)).toBe('10:00');
    expect(gioNgan(T - 24 * 3600 * 1000, T)).toBe('27/10 10:00');
    expect(daCho(T, T + 20_000)).toBe('vừa xong');
    expect(daCho(T, T + 5 * 60_000)).toBe('chờ 5 phút');
    expect(daCho(T, T + 3 * 3600_000)).toBe('chờ 3 giờ');
  });

  it('url bridge: localhost → 127.0.0.1, đổi cổng bằng ?bridgePort, KHÔNG tự xưng sân khấu', () => {
    expect(urlBridgeMacDinh({ search: '', protocol: 'http:', hostname: 'localhost' })).toBe('ws://127.0.0.1:8787/');
    const u = urlBridgeMacDinh({ search: '?bridgePort=8797', protocol: 'http:', hostname: '192.168.1.5' });
    expect(u).toBe('ws://192.168.1.5:8797/');
    expect(u).not.toContain('role=stage');
  });
});
