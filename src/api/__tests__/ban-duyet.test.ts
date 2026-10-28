/**
 * Bàn duyệt (phương án 1, Ryan 28/10) — CEO THẬT ký báo cáo của đội agent.
 *
 * Giao kèo:
 *  1. `ceoKyTay` ⇒ báo cáo vào hàng `choKy`, Nam KHÔNG tự đóng dấu.
 *  2. `team.sign approve` ⇒ dấu `ceo-duyet` (kyTay) ngay sau, rời hàng chờ, bắn `team.signed`.
 *  3. `team.sign reject` ⇒ dấu `ceo-tra-lai` mang góp ý (đã bỏ ký tự lạ, cắt ngắn).
 *  4. Ký số không chờ / ký hai lần ⇒ lỗi, sổ không đổi.
 *  5. Sổ + hàng chờ ký sống qua lần tải lại (kho lưu).
 *  6. Não (MCP) KHÔNG được ký thay Sếp; `team.state` thì đọc được.
 *  7. `ask` ghi mốc `xinDuyetLuc`, sự kiện kế tiếp xoá mốc.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia } from './san-khau-gia';
import { batDoiNgu, type DuLieuSoDoiNgu, type KhoSoDoiNgu, type MayDoiNgu, TOI_DA_GOP_Y } from '../../behavior/doi-ngu';
import { datMayDoiNgu } from '../../behavior/so-doi-ngu';
import { lyDoCamNao } from '../../../bridge/mcp';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;
let may: MayDoiNgu;
let kho: DuLieuSoDoiNgu | null;

const khoGia: KhoSoDoiNgu = {
  doc: () => (kho ? structuredClone(kho) : null),
  ghi: (x) => {
    kho = structuredClone(x);
  },
};
const nghi = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5)));

const bat = () => {
  may = batDoiNgu({ dispatcher: d, bus, nghi, ceoKyTay: true, luu: khoGia });
  datMayDoiNgu(may);
};

beforeEach(() => {
  kho = null;
  world = new SanKhauGia(['owner', 'gen']);
  bus = new EventBus();
  d = new Dispatcher({ registry: taoRegistry(), world, bus });
  bat();
});
afterEach(() => {
  may.dung();
  datMayDoiNgu(null);
});

const su = (kind: string, them: Record<string, unknown> = {}) =>
  d.run('team.event', { kind, id: `${kind}-${Math.random().toString(36).slice(2, 7)}`, ...them });

/** Một vòng việc trọn: giao → nhân viên xong → báo cáo. Trả số báo cáo. */
async function motVong(): Promise<number> {
  await su('brief');
  await d.run('team.event', { kind: 'spawn', id: 'v1', role: 'builder', task: 'Viết test' });
  await may.xong();
  await d.run('team.event', { kind: 'done', id: 'v1' });
  await may.xong();
  await su('report');
  await may.xong();
  return may.trangThai().choKy.at(-1)!.so;
}

const loai = () => may.trangThai().soQuyTrinh.map((b) => b.loai);

describe('Bàn duyệt — CEO ký tay', () => {
  it('báo cáo vào hàng chờ ký, Nam không tự đóng dấu', async () => {
    const bc: Record<string, unknown>[] = [];
    bus.on('team.report', (e) => bc.push(e.data as Record<string, unknown>));
    const so = await motVong();
    const tt = may.trangThai();
    expect(tt.ceoKyTay).toBe(true);
    expect(tt.choKy).toEqual([expect.objectContaining({ so, dat: 1, traLai: 0, ok: true })]);
    expect(loai()).not.toContain('ceo-duyet');
    expect(bc[0]).toMatchObject({ baoCao: so, choKy: true });
    expect(bc[0]!.dauCeo).toBeUndefined();
  });

  it('team.sign approve ⇒ dấu CEO ký tay, rời hàng chờ, bắn team.signed', async () => {
    const ky: Record<string, unknown>[] = [];
    bus.on('team.signed', (e) => ky.push(e.data as Record<string, unknown>));
    const so = await motVong();
    const r = await d.run('team.sign', { report: so, decision: 'approve' });
    expect(r.ok).toBe(true);
    await may.xong();
    const tt = may.trangThai();
    expect(tt.choKy).toEqual([]);
    const dau = tt.soQuyTrinh.at(-1)!;
    expect(dau).toMatchObject({ loai: 'ceo-duyet', ky: 'Nam', chiTiet: { baoCao: so, kyTay: true } });
    expect(ky).toEqual([expect.objectContaining({ baoCao: so, quyet: 'approve', dauCeo: dau.so })]);
  });

  it('team.sign reject ⇒ dấu TRẢ LẠI mang góp ý đã làm sạch, cắt ngắn', async () => {
    const so = await motVong();
    const dai = `Thiếu test‮ cho ca rỗng ${'x'.repeat(400)}`;
    expect((await d.run('team.sign', { report: so, decision: 'reject', note: dai })).ok).toBe(true);
    const dau = may.trangThai().soQuyTrinh.at(-1)!;
    expect(dau.loai).toBe('ceo-tra-lai');
    const gopY = String(dau.chiTiet!.gopY);
    expect(gopY.startsWith('Thiếu test cho ca rỗng')).toBe(true);
    expect(gopY).not.toMatch(/‮/);
    expect(gopY.length).toBeLessThanOrEqual(TOI_DA_GOP_Y);
  });

  it('ký số không chờ / ký hai lần ⇒ lỗi, sổ không đổi', async () => {
    const so = await motVong();
    expect((await d.run('team.sign', { report: 9999, decision: 'approve' })).ok).toBe(false);
    expect((await d.run('team.sign', { report: so, decision: 'approve' })).ok).toBe(true);
    const n = may.trangThai().soQuyTrinh.length;
    const lai = await d.run('team.sign', { report: so, decision: 'reject' });
    expect(lai.ok).toBe(false);
    expect(may.trangThai().soQuyTrinh.length).toBe(n);
  });

  it('sổ + hàng chờ ký sống qua lần tải lại; số thứ tự không tái dùng', async () => {
    const so = await motVong();
    const cu = may.trangThai().soQuyTrinh;
    may.dung();
    bat(); // "tải lại trang": máy mới đọc kho
    const tt = may.trangThai();
    expect(tt.soQuyTrinh).toEqual(cu);
    expect(tt.choKy.map((c) => c.so)).toEqual([so]);
    await d.run('team.sign', { report: so, decision: 'approve' });
    expect(may.trangThai().soQuyTrinh.at(-1)!.so).toBe(cu.at(-1)!.so + 1);
  });

  it('kho hỏng ⇒ sổ trắng, không ném', () => {
    may.dung();
    kho = { so: 'rác' as unknown as [], choKy: [] };
    expect(() => bat()).not.toThrow();
    expect(may.trangThai().soQuyTrinh).toEqual([]);
  });

  it('ask ghi mốc chờ CEO trả lời, sự kiện kế tiếp xoá mốc', async () => {
    await su('ask');
    await may.xong();
    expect(may.trangThai().xinDuyetLuc).toEqual(expect.any(Number));
    expect((await su('work', { tool: 'doc' })).ok).toBe(true);
    await may.xong();
    expect(may.trangThai().xinDuyetLuc).toBeNull();
  });

  it('team.state trả trạng thái + giới hạn sổ; thiếu máy ⇒ lỗi rõ', async () => {
    await motVong();
    const r = await d.run('team.state', { limit: 2 });
    expect(r.ok).toBe(true);
    const tt = (r as { result: { soQuyTrinh: unknown[]; choKy: unknown[] } }).result;
    expect(tt.soQuyTrinh).toHaveLength(2);
    expect(tt.choKy).toHaveLength(1);
    datMayDoiNgu(null);
    const loi = await d.run('team.state');
    expect(loi.ok).toBe(false);
  });

  it('não (MCP) không được ký thay Sếp, nhưng được đọc', () => {
    expect(lyDoCamNao('team.sign', { report: 1, decision: 'approve' })).toMatch(/chỉ dành cho Boss/);
    expect(lyDoCamNao('team.state', {})).toBeNull();
  });
});

describe('thứ tự giấy tờ khi subagent tới sát lệnh giao việc', () => {
  it('session-start → brief → spawn liền nhau: KHÔNG ghi "nhận việc ngầm", pha không bị kéo lùi', async () => {
    await su('session-start');
    await su('brief');
    await d.run('team.event', { kind: 'spawn', id: 'sat', role: 'builder', task: 'Viết test' });
    await may.xong();
    const tt = may.trangThai();
    expect(tt.soQuyTrinh.map((b) => b.loai)[0]).toBe('nhan-viec');
    expect(tt.soQuyTrinh[0]!.chiTiet?.ngam).toBeUndefined();
    expect(tt.soQuyTrinh.filter((b) => b.loai === 'nhan-viec')).toHaveLength(1);
    const i = tt.lichSuPha.lastIndexOf('nhan-viec');
    expect(tt.lichSuPha.slice(i + 1)).not.toContain('nhan-viec');
    expect(tt.lichSuPha.indexOf('giao-viec')).toBeGreaterThan(tt.lichSuPha.indexOf('nhan-viec'));
  });
});

describe('token trên giấy tờ', () => {
  it('bài nộp mang token của nhân viên; báo cáo mang token Giám đốc dồn từ các report', async () => {
    await su('brief');
    await d.run('team.event', { kind: 'spawn', id: 'tk', role: 'builder', task: 'Viết test' });
    await may.xong();
    await d.run('team.event', { kind: 'done', id: 'tk', tokens: 4200 });
    await may.xong();
    await su('report', { tokens: 1000 });
    await may.xong();
    const so = may.trangThai().soQuyTrinh;
    expect(so.find((b) => b.loai === 'kiem-nhan')!.chiTiet).toMatchObject({ tokens: 4200 });
    expect(so.find((b) => b.loai === 'bao-cao')!.chiTiet).toMatchObject({ tokens: 1000 });
    expect(may.trangThai().choKy.at(-1)).toMatchObject({ tokens: 1000 });
    // báo cáo kế không mang lại token cũ
    await su('report');
    await may.xong();
    expect(may.trangThai().soQuyTrinh.filter((b) => b.loai === 'bao-cao').at(-1)!.chiTiet!.tokens).toBeUndefined();
  });

  it('tokens âm / không phải số ⇒ lệnh từ chối', async () => {
    expect((await su('report', { tokens: -1 })).ok).toBe(false);
    expect((await su('report', { tokens: 'nhiều' })).ok).toBe(false);
  });
});

describe('giấy tờ trước, diễn sau — phần diễn kẹt không làm đứng quy trình', () => {
  it('moveTo của Giám đốc không bao giờ trả lời ⇒ kiểm nhận + báo cáo vẫn vào sổ, hàng chờ ký có báo cáo, việc sau vẫn chạy', async () => {
    may.dung();
    let treo = false;
    const cua = {
      run: (cmd: string, args: Record<string, unknown> = {}, nguon?: string) =>
        treo && cmd === 'actor.moveTo' && args.actor === 'gen' ? new Promise<never>(() => {}) : d.run(cmd, args, nguon),
      dangBan: (a: string) => d.dangBan(a),
      world,
    };
    may = batDoiNgu({ dispatcher: cua, bus, nghi, ceoKyTay: true, luu: khoGia, tranViecTruongMs: 300 });
    datMayDoiNgu(may);
    await su('brief');
    await d.run('team.event', { kind: 'spawn', id: 'k1', role: 'builder', task: 'Viết test' });
    await may.xong();
    treo = true; // từ đây mọi cú đi của Nhi kẹt mãi (máy chậm / tab sân khấu bị che)
    await d.run('team.event', { kind: 'done', id: 'k1' });
    await su('report');
    // không dùng may.xong() (chuỗi diễn kẹt thật) — chờ theo đồng hồ, có trần
    for (let i = 0; i < 100 && may.trangThai().choKy.length === 0; i++) await new Promise((r) => setTimeout(r, 30));
    const tt = may.trangThai();
    expect(tt.soQuyTrinh.map((b) => b.loai)).toEqual(expect.arrayContaining(['kiem-nhan', 'bao-cao']));
    expect(tt.choKy).toHaveLength(1);
    // hàng việc của Giám đốc không đứng: một ask sau đó vẫn tới lượt
    await su('ask');
    for (let i = 0; i < 100 && may.trangThai().xinDuyetLuc === null; i++) await new Promise((r) => setTimeout(r, 30));
    expect(may.trangThai().xinDuyetLuc).not.toBeNull();
  });
});
