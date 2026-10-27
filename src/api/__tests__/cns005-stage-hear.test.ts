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
import { boPhieuGiong, datPhieuGiong, layPhieuGiong } from '../../audio/so-giong';
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

  it('validate từ chối trước handler (confidence ngoài 0..1) → không có phiếu rò sang câu gõ tay', async () => {
    const { d, thay } = dung();
    const kq = await d.run('stage.hear', { text: 'dừng lại', confidence: 5 });
    // confidence ngoài 0..1 bị validate từ chối trước khi tới handler
    expect(kq.ok).toBe(false);
    await d.run('actor.say', { actor: 'owner', text: 'dừng lại' });
    expect(dem(thay, 'user.speech')).toHaveLength(0);
  });

  it('actor.say THẬT SỰ thất bại trong handler → boPhieuGiong chạy, phiếu không rò sang câu gõ tay', async () => {
    const { d, world, thay } = dung();
    // owner có trong describe() (stage.hear qua được) nhưng coActor báo không có → actor.say ném lỗi TRONG handler
    world.coActor = () => false;
    const kq = await d.run('stage.hear', { text: 'dừng lại' });
    expect(kq.ok).toBe(false);
    expect(dem(thay, 'user.speech')).toHaveLength(0);
    // phiếu phải đã bị xoá (không đợi actor.say sau tiêu thụ)
    expect(layPhieuGiong('dừng lại')).toBeNull();
  });

  it('boPhieuGiong(text) chỉ xoá phiếu đúng câu đó', () => {
    datPhieuGiong({ text: 'câu A', confidence: 1, durationMs: 0, goiGen: false });
    boPhieuGiong('câu B');
    expect(layPhieuGiong('câu A')).not.toBeNull();
    datPhieuGiong({ text: 'câu A', confidence: 1, durationMs: 0, goiGen: false });
    boPhieuGiong('câu A');
    expect(layPhieuGiong('câu A')).toBeNull();
  });

  it('owner đang bận (đang nói câu trước) → câu tới NGAY (interrupt), vẫn có user.speech', async () => {
    const { d, thay } = dung();
    const di = d.run('actor.say', { actor: 'owner', text: 'câu trước đang nói dở' });
    const nghe = d.run('stage.hear', { text: 'dừng lại ngay' });
    await new Promise<void>((r) => setTimeout(r, 5)); // ngắn hơn một nhịp hành động của sân khấu giả
    expect(dem(thay, 'user.text').filter((e) => e.data.text === 'dừng lại ngay')).toHaveLength(1);
    expect(dem(thay, 'user.speech')).toHaveLength(1);
    expect((await nghe).ok).toBe(true);
    await di;
  });

  it('chữ STT thô "ghen ơi" → chuẩn hoá "Gen ơi" cho cả text lẫn goiGen', async () => {
    const { d, thay } = dung();
    await d.run('stage.hear', { text: 'ghen ơi dựng module' });
    expect(dem(thay, 'user.text')[0]!.data.text).toBe('Gen ơi dựng module');
    expect(dem(thay, 'user.speech')[0]!.data).toMatchObject({ text: 'Gen ơi dựng module', goiGen: true });
  });

  it('nói với chính mình (to === id người nói): `to` trong sự kiện giữ nguyên (để định tuyến), user.speech khớp user.text', async () => {
    const { d, thay, world } = dung();
    world.lichSu.length = 0;
    await d.run('stage.hear', { text: 'chào mọi người', to: 'owner' });
    expect(dem(thay, 'user.text')[0]!.data.to).toBe('owner');
    expect(dem(thay, 'user.speech')[0]!.data.to).toBe('owner');
    expect(dem(thay, 'actor.sayStart')[0]!.data.actor).toBe('owner');
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

  it('to:"owner" (chatroom chọn Javis) + "đi tới bàn điều khiển" → Javis đi (INT-02), handled đồng bộ, chạy đúng một lần', async () => {
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

  it('dedup khoá theo to|text: Javis rồi Gen nghe đúng câu trong 2 s → Gen vẫn đi; cùng to cùng câu (speech+text) chỉ chạy 1 lần', async () => {
    const { d, bus, world } = dung(['owner', 'gen', 'javis']);
    const hl = batHieuLenh(d, bus);
    await hl.lamMoi();
    world.lichSu.length = 0;
    await d.run('stage.hear', { text: 'đi tới bàn điều khiển', to: 'javis' });
    await d.run('stage.hear', { text: 'đi tới bàn điều khiển', to: 'gen' });
    await nhip();
    const di = world.lichSu.filter((x) => x.startsWith('moveTo'));
    expect(di.some((x) => x.includes('javis'))).toBe(true);
    expect(di.some((x) => x.includes('gen'))).toBe(true);
    expect(di).toHaveLength(2); // mỗi người đúng một lần dù mỗi câu bắn cả user.text lẫn user.speech
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
    // Gen quay về máy quay + ngẩng mặt chú ý ngay, không chờ não (I1 #74: `actor.express`, không chiếm thân)
    expect(world.lichSu).toContain('faceTo:gen:camera');
    expect(world.lichSu).toContain('express:surprised');
    may.dung();
  });
});
