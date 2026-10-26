/**
 * cns001-nguoi-nhan.test.ts — CNS-001 (Ryan chốt 26/10): người nhận câu nói.
 *
 * Luật: tên gọi trong câu thắng; câu không gọi tên thì người nhận là nhân vật
 * đích `to` mà người nói chỉ định; không có `to` hợp lệ (hoặc "camera") thì
 * giữ hành vi cũ (mặc định Gen).
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../events';
import { BOI_CANH_TRONG, batHieuLenh, phanTich, type BoiCanh } from '../hieu-lenh';

const BC: BoiCanh = {
  ...BOI_CANH_TRONG,
  actors: [
    { id: 'owner', controlledBy: 'owner' },
    { id: 'gen', controlledBy: 'agent' },
  ],
  places: [{ id: 'ban-dieu-khien', kind: 'desk' }],
};

describe('phanTich — người nhận theo `to`', () => {
  it('chọn Javis + "đi tới bàn điều khiển" → Javis đi', () => {
    const kq = phanTich('đi tới bàn điều khiển', BC, 'owner');
    expect(kq.nguoiNhan).toEqual(['owner']);
    expect(kq.coGoiTen).toBe(false);
    expect(kq.lenh[0].cmd).toBe('actor.moveTo');
    expect(kq.lenh[0].args).toMatchObject({ actor: 'owner', to: 'ban-dieu-khien' });
  });
  it('chọn Gen + "Javis, đi tới bàn điều khiển" → tên trong câu thắng: Javis', () => {
    const kq = phanTich('Javis, đi tới bàn điều khiển', BC, 'gen');
    expect(kq.nguoiNhan).toEqual(['owner']);
    expect(kq.coGoiTen).toBe(true);
  });
  it('không `to` → hành vi cũ: Gen', () => {
    expect(phanTich('đi tới bàn điều khiển', BC).nguoiNhan).toEqual(['gen']);
  });
  it('`to` = "camera" hoặc không tồn tại → Gen', () => {
    expect(phanTich('đi tới bàn điều khiển', BC, 'camera').nguoiNhan).toEqual(['gen']);
    expect(phanTich('đi tới bàn điều khiển', BC, 'ma-lai').nguoiNhan).toEqual(['gen']);
  });
});

/** Dispatcher giả đủ cho lớp hiểu lệnh: ghi lại lệnh đã chạy. */
function dungMay() {
  const bus = new EventBus();
  const daChay: { cmd: string; args: Record<string, unknown> }[] = [];
  const dispatcher = {
    registry: new Map([['actor.say', { params: [{ name: 'to' }] }]]),
    async run(cmd: string, args: Record<string, unknown>) {
      daChay.push({ cmd, args });
      if (cmd === 'stage.bootstrap') {
        return {
          ok: true,
          result: {
            commands: [], places: [{ id: 'ban-dieu-khien', kind: 'desk' }],
            emotes: [], screens: [], props: [],
          },
        };
      }
      if (cmd === 'stage.describe') {
        return { ok: true, result: { actors: [
          { id: 'owner', controlledBy: 'owner', pos: [0, 0, 0] },
          { id: 'gen', controlledBy: 'agent', pos: [1, 0, 0] },
        ], places: [] } };
      }
      return { ok: true, result: {} };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hl = batHieuLenh(dispatcher as any, bus);
  return { bus, hl, daChay };
}
const choNhip = () => new Promise((r) => setTimeout(r, 20));

describe('batHieuLenh — `to` trong dữ liệu sự kiện', () => {
  for (const ev of ['user.text', 'user.speech'] as const) {
    it(`${ev} {to:"owner"} không gọi tên → Javis đi, handled đặt đồng bộ`, async () => {
      const { bus, hl, daChay } = dungMay();
      await hl.lamMoi();
      daChay.length = 0;
      let handled: unknown;
      bus.on('*', (e) => { if (e.event === ev) handled = e.data.handled; });
      bus.emit(ev, { actor: 'owner', text: 'đi tới bàn điều khiển', to: 'owner' });
      expect(handled).toBe(true); // đồng bộ, ngay trong lượt emit
      await choNhip();
      const di = daChay.find((c) => c.cmd === 'actor.moveTo');
      expect(di?.args.actor).toBe('owner');
      hl.thao();
    });
    it(`${ev} {to:"camera"} → Gen đi (hành vi cũ)`, async () => {
      const { bus, hl, daChay } = dungMay();
      await hl.lamMoi();
      daChay.length = 0;
      bus.emit(ev, { actor: 'owner', text: 'đi tới bàn điều khiển', to: 'camera' });
      await choNhip();
      expect(daChay.find((c) => c.cmd === 'actor.moveTo')?.args.actor).toBe('gen');
      hl.thao();
    });
  }
  it('to:"owner" + câu tự do không khớp lệnh → Javis trả "chưa hiểu" (cơ chế C2), handled', async () => {
    const { bus, hl, daChay } = dungMay();
    await hl.lamMoi();
    daChay.length = 0;
    const e = bus.emit('user.text', { actor: 'owner', text: 'hôm nay trời đẹp nhỉ', to: 'owner' });
    expect(e.data.handled).toBe(true);
    await choNhip();
    expect(daChay.find((c) => c.cmd === 'actor.say')?.args.actor).toBe('owner');
    hl.thao();
  });
  it('to:"gen" + câu tự do → không handled (chảy tới não như cũ)', async () => {
    const { bus, hl } = dungMay();
    await hl.lamMoi();
    const e = bus.emit('user.text', { actor: 'owner', text: 'hôm nay trời đẹp nhỉ', to: 'gen' });
    expect(e.data.handled).toBeUndefined();
    hl.thao();
  });
});
