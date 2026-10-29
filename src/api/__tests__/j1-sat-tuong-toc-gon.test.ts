/**
 * j1-sat-tuong-toc-gon.test.ts — J1 (Issue #78).
 *
 * Boss 27/10: *"nội thất nên thiết kế sát tường để chừa không gian giữa để
 * hoạt động… chỉnh lại tóc của các nhân vật cho gọn gàng vì đang rối quá"*.
 *
 * File này giữ phần ĐO ĐƯỢC BẰNG SỐ THUẦN của J1 — bộ số tóc (bảng bố cục căn
 * nhà đã bỏ 27/10 cùng cảnh nhà).
 * Phần phải chạy trên GPU thật (độ dài chuỗi tóc thật của từng model, lệch tóc
 * khi đứng/đi/emote, `min.y` mọi khối, ảnh 5 preset) nằm ở
 * `scripts/kiem-j1.mjs`, chạy trên Firefox thật — test đơn vị không thay được
 * nó, nhưng nó cũng không thay được test này: đây là cái CHẶN mọi lần dời đồ
 * về sau.
 */
import { describe, expect, it } from 'vitest';
import { SO_TOC_J1 } from '../../stage/nhanvat';

describe('J1 (#78) — bộ số tóc gọn', () => {
  it('trần độ dài chuỗi tóc ≤ 0,45 m (đề bài: ngang lưng trên)', () => {
    expect(SO_TOC_J1.tranDai).toBeLessThanOrEqual(0.45);
    expect(SO_TOC_J1.tranDai).toBeGreaterThan(0.2); // không rút thành tóc tém
  });

  it('sàn hãm (`dragForce`) ≥ 0,45 và vẫn là hãm, không phải khoá cứng', () => {
    expect(SO_TOC_J1.sanHam).toBeGreaterThanOrEqual(0.45);
    expect(SO_TOC_J1.sanHam).toBeLessThan(1);
  });

  it('sàn thu gọn đủ thấp để trần 0,45 m với tới được chuỗi tóc dài 1,09 m', () => {
    // chuỗi tóc đo thật của `avatar.vrm` sau chibi hoá: 1,09 m (ghi chú G1).
    expect(SO_TOC_J1.sanThuToc).toBeLessThanOrEqual(SO_TOC_J1.tranDai / 1.09 + 1e-9);
  });

  it('cứng thêm so với model gốc (stiffness tăng vừa, không khoá tóc)', () => {
    expect(SO_TOC_J1.cungThem).toBeGreaterThan(2.6);
    expect(SO_TOC_J1.cungThem).toBeLessThanOrEqual(4);
  });

  it('mốc lệch tóc của Boss không bị nới', () => {
    expect(SO_TOC_J1.mocLech).toEqual({ dung: 0.02, di: 0.05, emote: 0.07 });
  });
});
