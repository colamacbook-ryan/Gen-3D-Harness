/**
 * Văn phòng búp bê (Ryan 27/10) — phần THUẦN của "va chạm + place theo cảnh".
 *
 * Giao kèo: cảnh văn phòng dùng CÙNG BỘ ID place với căn nhà (lệnh/não/J2 không
 * phải sửa), và `bo-cuc` nhận bộ vật cản + khung sàn của cảnh đang dựng; trả
 * `null` thì về đúng hành vi căn nhà (mọi test cũ dựa vào đó).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { biChan, datCanhChan, kepTrongPhong, thongDuong, timDuong, truotVaCham } from '../../stage/bo-cuc';
import { datPlacesCanh, dsPlaces, PLACES, PLACES_VAN_PHONG, timPlace } from '../../stage/noi-dung';

afterEach(() => {
  datCanhChan(null);
  datPlacesCanh(null);
});

describe('văn phòng — place cùng bộ id với căn nhà', () => {
  it('đủ và chỉ đúng các id của căn nhà', () => {
    expect(PLACES_VAN_PHONG.map((p) => p.id).sort()).toEqual(PLACES.map((p) => p.id).sort());
  });

  it('cùng loại (kind) từng id — ghế vẫn là ghế, bàn vẫn là bàn', () => {
    for (const p of PLACES_VAN_PHONG) expect(p.kind, p.id).toBe(PLACES.find((q) => q.id === p.id)!.kind);
  });

  it('mọi chỗ đứng nằm trong sàn văn phòng (x −12…12 · z −9…8)', () => {
    for (const p of PLACES_VAN_PHONG) {
      const [x, , z] = p.standAt ?? p.pos;
      expect(x, p.id).toBeGreaterThanOrEqual(-12);
      expect(x, p.id).toBeLessThanOrEqual(12);
      expect(z, p.id).toBeGreaterThanOrEqual(-9);
      expect(z, p.id).toBeLessThanOrEqual(8);
    }
  });

  it('datPlacesCanh đổi timPlace/dsPlaces, null trả về căn nhà', () => {
    datPlacesCanh(PLACES_VAN_PHONG);
    expect(timPlace('bep')?.pos).toEqual([11.0, 0, 5.0]);
    expect(dsPlaces()).toBe(PLACES_VAN_PHONG);
    datPlacesCanh(null);
    expect(timPlace('bep')?.pos).toEqual(PLACES.find((p) => p.id === 'bep')!.pos);
  });
});

describe('va chạm theo cảnh (datCanhChan)', () => {
  const vp = { x0: -12, x1: 12, z0: -9, z1: 8 };

  it('khung sàn mới: đi được tới x = 11 (căn nhà kẹp ở 6,5)', () => {
    expect(kepTrongPhong(11, 0)[0]).toBeCloseTo(6.5);
    datCanhChan({ hop: [], ...vp });
    expect(kepTrongPhong(11, 0)[0]).toBeCloseTo(11);
    expect(kepTrongPhong(20, -20)).toEqual([11.5, -8.5]);
  });

  it('chỉ hộp của cảnh mới chặn; hộp căn nhà không còn hiệu lực', () => {
    // giữa phòng khách căn nhà có bàn trà — văn phòng thì trống chỗ đó
    const coNha = biChan(-5.5, 3, 0.3);
    datCanhChan({ hop: [{ id: 'ban-thu', x0: 1, x1: 2, z0: 1, z1: 2 }], ...vp });
    if (coNha) expect(biChan(-5.5, 3, 0.3)).toBeNull();
    expect(biChan(1.5, 1.5, 0.3)).toBe('ban-thu');
  });

  it('truotVaCham dừng trước hộp của cảnh, trượt dọc mép', () => {
    datCanhChan({ hop: [{ id: 'ban-thu', x0: 1, x1: 2, z0: -1, z1: 1 }], ...vp });
    const [x, z] = truotVaCham(0, 0, 0.9, 0.5, 0.34);
    expect(x).toBe(0);
    expect(z).toBe(0.5);
  });
});

describe('tìm đường A* (timDuong)', () => {
  const vp = { x0: -12, x1: 12, z0: -9, z1: 8 };

  it('đường thẳng thoáng → đúng một điểm (hành vi cũ)', () => {
    datCanhChan({ hop: [], ...vp });
    expect(timDuong(0, 0, 5, 3)).toEqual([[5, 3]]);
  });

  it('vòng qua một bức chắn dài, mọi chặng đều thoáng, tới đúng đích', () => {
    // bức chắn ngang z ∈ [−0,2; 0,2], x ∈ [−6; 6] — chỉ hở hai đầu
    datCanhChan({ hop: [{ id: 'chan-dai', x0: -6, x1: 6, z0: -0.2, z1: 0.2 }], ...vp });
    const d = timDuong(0, -3, 0, 3, 0.34);
    expect(d.length).toBeGreaterThan(1);
    expect(d[d.length - 1]).toEqual([0, 3]);
    let [x, z] = [0, -3];
    for (const [nx, nz] of d) {
      expect(thongDuong(x, z, nx, nz, 0.3), `${x},${z} → ${nx},${nz}`).toBe(true);
      [x, z] = [nx, nz];
    }
    // phải vòng ra ngoài đầu bức chắn
    expect(d.some(([px]) => Math.abs(px) > 6)).toBe(true);
  });

  it('đích nằm trong vật cản → dừng ở ô thoáng gần nhất, không xuyên', () => {
    datCanhChan({ hop: [{ id: 'ban', x0: 2, x1: 3, z0: -0.5, z1: 0.5 }], ...vp });
    const d = timDuong(0, 0, 2.5, 0, 0.34);
    const [x, z] = d[d.length - 1]!;
    expect(biChan(x, z, 0.34)).toBeNull();
    expect(Math.hypot(x - 2.5, z)).toBeLessThan(1.2);
  });
});

describe('tìm đường — đích bị khép kín', () => {
  it('tới ô tới-được gần đích nhất, không đi thẳng vào tường', () => {
    // hộp rỗng ruột quanh (5, 0): bốn bức chắn khép kín
    datCanhChan({
      hop: [
        { id: 'b', x0: 3, x1: 7, z0: -2.2, z1: -2 },
        { id: 'n', x0: 3, x1: 7, z0: 2, z1: 2.2 },
        { id: 't', x0: 3, x1: 3.2, z0: -2.2, z1: 2.2 },
        { id: 'd', x0: 6.8, x1: 7, z0: -2.2, z1: 2.2 },
      ],
      x0: -12,
      x1: 12,
      z0: -9,
      z1: 8,
    });
    const d = timDuong(-3, 0, 5, 0, 0.34);
    const [x, z] = d[d.length - 1]!;
    expect(x).toBeLessThan(3); // dừng ngoài bức chắn tây, không xuyên
    expect(biChan(x, z, 0.34)).toBeNull();
    expect(Math.hypot(x - 5, z)).toBeLessThan(3);
  });
});
