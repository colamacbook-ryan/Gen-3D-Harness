/** do-fps.test.ts — đo FPS bằng đồng hồ thật để tự tắt/bật bloom (sửa bug A3: `dt` kẹp). */
import { describe, expect, it } from 'vitest';
import { DoFps, HAN_FPS_THAP_MS } from '../do-fps';

/** Chạy chuỗi khung cách nhau `khoangMs`, trả mốc (ms từ khung đầu) khi quyết định đầu tiên khác null. */
function chay(khoangMs: number, soKhung: number, nen = false, d = new DoFps()) {
  const ra: { sau: number; qd: string }[] = [];
  for (let i = 0; i < soKhung; i++) {
    const qd = d.capNhat(1000 + i * khoangMs, nen);
    if (qd) ra.push({ sau: i * khoangMs, qd });
  }
  return ra;
}

describe('DoFps', () => {
  it('3 fps: tắt bloom ngay khi FPS thấp quá 2 s (không phải 10–20 s)', () => {
    const ra = chay(1000 / 3, 30);
    expect(ra[0].qd).toBe('tat');
    expect(ra[0].sau).toBeGreaterThan(HAN_FPS_THAP_MS);
    expect(ra[0].sau).toBeLessThanOrEqual(HAN_FPS_THAP_MS + 1000 / 3 + 1);
  });

  it('1 fps: tắt ở khung thứ 4 (3 khoảng > 2 s)', () => {
    const ra = chay(1000, 10);
    expect(ra[0]).toEqual({ sau: 3000, qd: 'tat' });
  });

  it('60 fps: không tắt (chỉ đề nghị bật)', () => {
    const ra = chay(1000 / 60, 600);
    expect(ra.every((r) => r.qd === 'bat')).toBe(true);
  });

  it('vùng giữa ngưỡng (28 fps): không tắt, không bật', () => {
    expect(chay(1000 / 28, 300)).toEqual([]);
  });

  it('đang chế độ nền: không đo, dù 3 fps', () => {
    expect(chay(1000 / 3, 60, true)).toEqual([]);
  });

  it('ra khỏi nền: khung đầu sau nền không bị tính là chậm', () => {
    const d = new DoFps();
    chay(1000 / 60, 10, false, d);
    d.capNhat(5000, true); // nền, bỏ mốc cũ
    expect(d.capNhat(60_000, false)).toBeNull(); // khoảng 55 s nhưng là khung đầu
    expect(d.capNhat(60_016, false)).toBe('bat');
  });

  it('một khung chậm lẻ tẻ rồi nhanh lại thì reset bộ đếm', () => {
    const d = new DoFps();
    let t = 0;
    const buoc = (ms: number) => d.capNhat((t += ms), false);
    buoc(16);
    for (let i = 0; i < 4; i++) expect(buoc(400)).toBeNull(); // 1600 ms thấp
    buoc(16); // nhanh → reset
    for (let i = 0; i < 4; i++) expect(buoc(400)).toBeNull(); // lại 1600 ms, vẫn chưa tắt
  });
});
