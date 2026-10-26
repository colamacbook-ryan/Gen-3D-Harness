/**
 * cns005-stage-hear.test.ts — CNS-005: `stage.hear` đánh dấu câu NÓI từ nguồn
 * ngoài trình duyệt (extension, sidecar STT, agent). Giữ một nguồn `user.text`:
 * lệnh chạy `actor.say` lên owner qua dispatcher, chỉ thêm phiếu giọng.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { EventBus } from '../../events';
import { taoRegistry } from '../commands/index';
import { SanKhauGia } from './san-khau-gia';
import { NhatKy } from '../../log';
import type { StageEvent } from '../types';
import { boPhieuGiong, layPhieuGiong } from '../../audio/so-giong';
import { batHieuLenh } from '../../behavior/hieu-lenh';
import { batPhanXa } from '../../behavior/phan-xa';

function dung(actors = ['owner', 'gen']) {
  const bus = new EventBus();
  const world = new SanKhauGia(actors);
  const d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy: new NhatKy() });
  const thay: StageEvent[] = [];
  bus.on('*', (e) => thay.push(e));
  return { d, bus, world, thay };
}
const dem = (thay: StageEvent[], ev: string) => thay.filter((e) => e.event === ev);
const nhip = () => new Promise<void>((r) => setTimeout(r, 30));

describe('stage.hear', () => {
  beforeEach(() => boPhieuGiong());

  it('đúng 1 user.text + 1 user.speech, confidence/goiGen/durationMs đúng', async () => {
    const { d, thay } = dung();
    const kq = await d.run('stage.hear', {
      text: 'Gen ơi, dựng connector Baserow',
      confidence: 0.8,
      durationMs: 1500,
    });
    expect(kq.ok).toBe(true);
    expect(dem(thay, 'user.text')).toHaveLength(1);
    const sp = dem(thay, 'user.speech');
    expect(sp).toHaveLength(1);
    expect(sp[0]!.data).toMatchObject({
      actor: 'owner',
      text: 'Gen ơi, dựng connector Baserow',
      confidence: 0.8,
      durationMs: 1500,
      goiGen: true,
    });
  });

  it('mặc định confidence 1, durationMs 0, goiGen false', async () => {
    const { d, thay } = dung();
    await d.run('stage.hear', { text: 'dừng lại' });
    expect(dem(thay, 'user.speech')[0]!.data).toMatchObject({
      confidence: 1,
      durationMs: 0,
      goiGen: false,
    });
  });

  it('`to` truyền tới user.text; phiếu đã dùng, không treo', async () => {
    const { d, thay } = dung();
    await d.run('stage.hear', { text: 'chào', to: 'gen' });
    expect(dem(thay, 'user.text')[0]!.data.to).toBe('gen');
    expect(layPhieuGiong('chào')).toBeNull();
  });

  it('không có owner → ok:false, không phát gì, không phiếu', async () => {
    const { d, thay } = dung(['gen']);
    const kq = await d.run('stage.hear', { text: 'chào' });
    expect(kq.ok).toBe(false);
    expect(dem(thay, 'user.text')).toHaveLength(0);
    expect(dem(thay, 'user.speech')).toHaveLength(0);
    expect(layPhieuGiong('chào')).toBeNull();
  });

  it('actor.say bị từ chối (`to` sai kiểu) → phiếu không rò sang câu gõ tay', async () => {
    const { d, thay } = dung();
    const kq = await d.run('stage.hear', { text: 'dừng lại', confidence: 5 });
    // confidence ngoài 0..1 bị validate từ chối trước khi tới handler
    expect(kq.ok).toBe(false);
    await d.run('actor.say', { actor: 'owner', text: 'dừng lại' });
    expect(dem(thay, 'user.speech')).toHaveLength(0);
  });

  it('registry: khai events + stage.bootstrap liệt kê', async () => {
    const spec = taoRegistry().get('stage.hear');
    expect(spec?.events).toEqual(expect.arrayContaining(['user.text', 'user.speech']));
    const { d } = dung();
    const kq = await d.run('stage.bootstrap', {});
    expect(JSON.stringify(kq)).toContain('stage.hear');
  });
});

describe('stage.hear × lớp hiểu lệnh + phản xạ', () => {
  beforeEach(() => boPhieuGiong());

  it('to:"owner" + "đi tới bàn điều khiển" → Javis đi, handled đồng bộ, chạy đúng một lần', async () => {
    const { d, bus, world, thay } = dung();
    const hl = batHieuLenh(d, bus);
    await hl.lamMoi();
    const handled: unknown[] = [];
    bus.on('user.text', (e) => handled.push(e.data.handled));
    bus.on('user.speech', (e) => handled.push(e.data.handled));
    world.lichSu.length = 0;
    const kq = await d.run('stage.hear', { text: 'đi tới bàn điều khiển', to: 'owner' });
    expect(kq.ok).toBe(true);
    // cả user.text lẫn user.speech của CÙNG câu đều mang handled:true; cái thứ ba là câu "Dạ…" của lớp lệnh
    expect(handled.slice(0, 2)).toEqual([true, true]);
    await nhip();
    expect(dem(thay, 'user.text').filter((e) => e.data.text === 'đi tới bàn điều khiển')).toHaveLength(1);
    expect(dem(thay, 'user.speech')).toHaveLength(1);
    expect(dem(thay, 'user.command')).toHaveLength(1);
    const di = world.lichSu.filter((x) => x.startsWith('moveTo'));
    expect(di).toHaveLength(1);
    expect(di[0]).toContain('owner');
    hl.thao();
  });

  it('phản xạ C0 vẫn kích hoạt: Gen quay về người nói', async () => {
    const { d, bus, world } = dung();
    const may = batPhanXa({
      dispatcher: d,
      bus,
      so: { nhipMs: 1_000_000 },
      coNaoNoi: () => true,
    });
    world.lichSu.length = 0;
    await d.run('stage.hear', { text: 'Gen ơi', to: 'camera' });
    await nhip();
    // Gen quay về máy quay + chú ý ngay, không chờ não
    expect(world.lichSu).toContain('faceTo:gen:camera');
    expect(world.lichSu.some((x) => x.startsWith('emote:chu-y'))).toBe(true);
    may.dung();
  });
});
