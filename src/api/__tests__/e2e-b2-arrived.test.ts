// E2E 26/10 (B2): moveTo bị cắt bằng interrupt từng vẫn bắn actor.arrived
import { describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { NhatKy } from '../../log';
import { SanKhauGia } from './san-khau-gia';

describe('moveTo bị cắt', () => {
  it('không được bắn actor.arrived khi chưa tới nơi', async () => {
    const world = new SanKhauGia(['lan']);
    const bus = new EventBus();
    const nk = new NhatKy();
    nk.theoBus(bus);
    const d = new Dispatcher({ registry: taoRegistry(), world, bus, nhatKy: nk });
    const suKien: string[] = [];
    bus.on('*', (e) => suKien.push(e.event));
    const r = await d.run('actor.moveTo', { actor: 'lan', to: [6, 0, 6] });
    expect(r.ok).toBe(true);
    // cắt NGAY (trước nhịp 20 ms của sân khấu giả) — như phản xạ driver cắt cú đi của Gen
    await d.run('actor.turnTo', { actor: 'lan', target: [0, 0, -5], interrupt: true });
    await new Promise((x) => setTimeout(x, 30));
    expect(world.lichSu).toContain('moveTo:lan');
    expect(suKien).not.toContain('actor.arrived');
  });
});
