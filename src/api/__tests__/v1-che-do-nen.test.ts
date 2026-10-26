/**
 * v1-che-do-nen.test.ts — V1 (INT-06): quyết định chế độ vẽ, lọc tin vỏ VS
 * Code, bỏ khung theo đồng hồ thật, nối DOM (bằng EventTarget giả).
 */
import { describe, expect, it } from 'vitest';
import {
  DUNG_SAI_KHUNG_MS,
  FPS_NEN,
  KHUNG_NEN_MS,
  NGUON_VO_VSCODE,
  docTinVo,
  nenVeKhung,
  quyetCheDo,
  theoDoiCheDoNen,
  type RenderMode,
} from '../../stage/che-do-nen';
import { SU_KIEN_HE_THONG } from '../registry';

describe('quyetCheDo', () => {
  it('trình duyệt thường: focus = full, mất focus/ẩn = nen', () => {
    expect(quyetCheDo({ an: false, coFocus: true, vs: null })).toBe('full');
    expect(quyetCheDo({ an: false, coFocus: false, vs: null })).toBe('nen');
    expect(quyetCheDo({ an: true, coFocus: true, vs: null })).toBe('nen');
  });
  it('có tin vỏ VS Code: vỏ thắng focus của iframe (gõ chatroom không làm sân khấu nền)', () => {
    expect(quyetCheDo({ an: false, coFocus: false, vs: { visible: true, active: true } })).toBe('full');
    expect(quyetCheDo({ an: false, coFocus: true, vs: { visible: true, active: false } })).toBe('nen');
    expect(quyetCheDo({ an: false, coFocus: true, vs: { visible: false, active: true } })).toBe('nen');
    expect(quyetCheDo({ an: true, coFocus: true, vs: { visible: true, active: true } })).toBe('nen');
  });
});

describe('docTinVo — chỉ nhận tin của cửa sổ cha, đúng khoá', () => {
  const cha = { ten: 'cha' };
  const minh = { ten: 'minh' };
  const ORIGIN = 'http://127.0.0.1:5213';
  const tin = (data: unknown, origin = 'vscode-webview://abc', source: unknown = cha) => ({ data, origin, source });
  const dung = { nguon: NGUON_VO_VSCODE, loai: 'nen', visible: true, active: false };

  it('nhận đúng tin vỏ VS Code', () => {
    expect(docTinVo(tin(dung), cha, minh, ORIGIN)).toEqual({ visible: true, active: false });
    expect(docTinVo(tin(dung, ORIGIN), cha, minh, ORIGIN)).toEqual({ visible: true, active: false });
  });
  it('từ chối: source khác cha, không nằm trong khung, origin lạ, sai khoá, sai kiểu', () => {
    expect(docTinVo(tin(dung, undefined, { ten: 'la' }), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin(dung, undefined, minh), minh, minh, ORIGIN)).toBeNull(); // top-level: parent === window
    expect(docTinVo(tin(dung, 'https://ac-ke.example'), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin({ ...dung, nguon: 'khac' }), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin({ ...dung, loai: 'napLai' }), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin({ ...dung, active: 'false' }), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin(null), cha, minh, ORIGIN)).toBeNull();
    expect(docTinVo(tin('nen'), cha, minh, ORIGIN)).toBeNull();
  });
});

describe('nenVeKhung — bỏ khung theo đồng hồ thật', () => {
  it('ngưỡng có tên: 15 fps, dung sai 1 ms', () => {
    expect(FPS_NEN).toBe(15);
    expect(KHUNG_NEN_MS).toBeCloseTo(66.67, 1);
    expect(DUNG_SAI_KHUNG_MS).toBe(1);
  });
  it('full luôn vẽ; nen chỉ vẽ khi đủ khoảng', () => {
    expect(nenVeKhung('full', 1, 0)).toBe(true);
    expect(nenVeKhung('nen', 1000, -Infinity)).toBe(true);
    expect(nenVeKhung('nen', 1016.7, 1000)).toBe(false);
    expect(nenVeKhung('nen', 1066.6, 1000)).toBe(true); // rung vsync vẫn được nhận
  });
  for (const hz of [60, 120, 144, 240]) {
    it(`rAF ${hz} Hz trong 10 s → ≤ 15,3 fps và ≥ 12 fps`, () => {
      const buoc = 1000 / hz;
      let cuoi = -Infinity;
      let ve = 0;
      for (let i = 0; i < hz * 10; i++) {
        const t = i * buoc + (i % 2 ? 0.05 : -0.05); // rung vsync
        if (nenVeKhung('nen', t, cuoi)) {
          cuoi = t;
          ve++;
        }
      }
      expect(ve / 10).toBeLessThanOrEqual(15.3);
      expect(ve / 10).toBeGreaterThanOrEqual(12);
    });
  }
});

/** EventTarget giả tối thiểu (vitest chạy `environment: node`). */
function taoGia() {
  const nghe = new Map<string, Set<(ev: Event) => void>>();
  const on = (ten: string, fn: (ev: Event) => void) => {
    if (!nghe.has(ten)) nghe.set(ten, new Set());
    nghe.get(ten)!.add(fn);
  };
  const off = (ten: string, fn: (ev: Event) => void) => nghe.get(ten)?.delete(fn);
  const ban = (ten: string, ev: unknown = {}) => {
    for (const fn of nghe.get(ten) ?? []) fn(ev as Event);
  };
  const cha = { ten: 'vo' };
  const win = { addEventListener: on, removeEventListener: off, parent: cha as unknown, location: { origin: 'http://127.0.0.1:5213' } };
  const doc = { hidden: false, coFocus: true, hasFocus() { return this.coFocus; }, addEventListener: on, removeEventListener: off };
  return { win, doc, cha, ban, nghe };
}

describe('theoDoiCheDoNen — nối DOM', () => {
  it('báo chế độ lúc đầu + chỉ khi ĐỔI; nghe blur/focus/visibilitychange/tin vỏ; gỡ sạch', () => {
    const g = taoGia();
    const ds: RenderMode[] = [];
    const go = theoDoiCheDoNen(g.win, g.doc, (m) => ds.push(m));
    expect(ds).toEqual(['full']);
    g.ban('blur');
    g.ban('blur');
    expect(ds).toEqual(['full', 'nen']);
    g.ban('focus');
    expect(ds).toEqual(['full', 'nen', 'full']);
    g.doc.hidden = true;
    g.ban('visibilitychange');
    g.doc.hidden = false;
    g.ban('visibilitychange');
    expect(ds).toEqual(['full', 'nen', 'full', 'nen', 'full']);
    // tin vỏ: panel mất active → nen, kể cả khi iframe vẫn có focus
    g.ban('message', { source: g.cha, origin: 'vscode-webview://x', data: { nguon: NGUON_VO_VSCODE, loai: 'nen', visible: true, active: false } });
    expect(ds.at(-1)).toBe('nen');
    // tin giả từ nguồn khác bị bỏ
    g.ban('message', { source: {}, origin: 'vscode-webview://x', data: { nguon: NGUON_VO_VSCODE, loai: 'nen', visible: true, active: true } });
    expect(ds.at(-1)).toBe('nen');
    // từ giờ blur của iframe không quyết nữa
    g.ban('message', { source: g.cha, origin: 'vscode-webview://x', data: { nguon: NGUON_VO_VSCODE, loai: 'nen', visible: true, active: true } });
    g.ban('blur');
    expect(ds.at(-1)).toBe('full');
    go();
    expect([...g.nghe.values()].every((s) => s.size === 0)).toBe(true);
  });
  it('mở trang khi chưa có focus → nen ngay từ đầu', () => {
    const g = taoGia();
    g.doc.coFocus = false;
    const ds: RenderMode[] = [];
    theoDoiCheDoNen(g.win, g.doc, (m) => ds.push(m));
    expect(ds).toEqual(['nen']);
  });
});

it('stage.renderMode là sự kiện hệ thống (có trong bootstrap)', () => {
  expect(SU_KIEN_HE_THONG).toContain('stage.renderMode');
});
