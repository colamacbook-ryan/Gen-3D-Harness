/**
 * b1-steer-bo-cuc.test.ts — B1 (Issue #18): `actor.steer` + bảng bố cục.
 *
 * Ba giao kèo phải giữ, kiểm bằng số chứ không bằng mắt:
 *  1. `actor.steer` **không xếp hàng** — steer mới thay steer cũ, và gửi steer
 *     lúc actor đang bận cũng không bị đẩy vào hàng đợi.
 *  2. Kẹp trong phòng + không đi xuyên bàn/kệ (`bo-cuc.truotVaCham`).
 *  3. Đang steer thì `at` luôn `null` (giao kèo A1 không được phá), còn
 *     `nearest` vẫn luôn có.
 * Cộng thêm: `controlledBy`. (Bảng bố cục căn nhà D1/F1/J1 đã bỏ 27/10 cùng
 * cảnh nhà — văn phòng tự đo vật cản lúc dựng, xem `vp-van-phong.test.ts`.)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import type { StageEvent, StageState } from '../types';
import { biChan, datCanhChan, kepTrongPhong, LE_TUONG, SAN_MAC_DINH, truotVaCham } from '../../stage/bo-cuc';
import { PLACES, timPlace } from '../../stage/noi-dung';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;

beforeEach(() => {
  world = new SanKhauGia(['owner', 'gen']);
  bus = new EventBus();
  d = new Dispatcher({ registry: taoRegistry(), world, bus });
});

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

function actor(st: StageState, id: string) {
  const a = st.actors.find((x) => x.id === id);
  if (!a) throw new Error(`không thấy actor ${id}`);
  return a;
}

async function dc(): Promise<StageState> {
  const kq = await d.run('stage.describe');
  if (!kq.ok) throw new Error(kq.error);
  return kq.result as StageState;
}

describe('actor.steer — lái bằng vận tốc', () => {
  it('nhận vx/vz/ms, trả durationMs đúng ms đã yêu cầu', async () => {
    const kq = await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 150 });
    expect(kq.ok).toBe(true);
    if (!kq.ok) return;
    expect((kq.result as { durationMs: number }).durationMs).toBe(NHIP_MS);
    expect((kq.result as { vz: number }).vz).toBe(-1.6);
  });

  it('KHÔNG xếp hàng: gửi liên tiếp 5 lệnh, không lệnh nào bị queue', async () => {
    const queued: StageEvent[] = [];
    bus.on('cmd.queued', (e) => queued.push(e));
    for (let i = 0; i < 5; i++) {
      const kq = await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 120 });
      expect(kq.ok).toBe(true);
    }
    expect(queued).toEqual([]);
    expect(d.soCho('owner')).toBe(0);
  });

  it('KHÔNG xếp hàng sau lưng một lệnh đang chiếm thân (moveTo)', async () => {
    const queued: StageEvent[] = [];
    bus.on('cmd.queued', (e) => queued.push(e));
    void d.run('actor.moveTo', { actor: 'owner', to: 'ban-1' });
    const kq = await d.run('actor.steer', { actor: 'owner', vx: 1.6, vz: 0, ms: 120 });
    expect(kq.ok).toBe(true);
    // `actor.play` thì NGƯỢC LẠI: vẫn phải xếp hàng (giao kèo A1 còn nguyên)
    void d.run('actor.play', { actor: 'gen', clip: 'wave' });
    void d.run('actor.play', { actor: 'gen', clip: 'nod' });
    await cho(NHIP_MS * 4);
    expect(queued.map((e) => e.data.cmd)).toEqual(['actor.play']);
  });

  it('steer mới THAY steer cũ (không cộng dồn hai vận tốc)', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 1.6, vz: 0, ms: 1000 });
    await d.run('actor.steer', { actor: 'owner', vx: -1.6, vz: 0, ms: 1000 });
    const lanSteer = world.lichSu.filter((x) => x.startsWith('steer:owner'));
    expect(lanSteer).toEqual(['steer:owner:1.60,0.00', 'steer:owner:-1.60,0.00']);
    // chỉ MỘT hành động đang chiếm thân
    expect(actor(await dc(), 'owner').state).toBe('walking');
  });

  it('vận tốc bị kẹp ở 1,6 m/s dù agent gửi lớn hơn', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 4, vz: 0, ms: 50 });
    expect(world.lichSu.filter((x) => x.startsWith('steer:owner'))).toEqual([
      'steer:owner:1.60,0.00',
    ]);
  });

  it('đang steer thì state = walking và `at` = null, `nearest` vẫn có', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 400 });
    const a = actor(await dc(), 'owner');
    expect(a.state).toBe('walking');
    expect(a.at).toBeNull();
    expect(a.nearest.place).not.toBeNull();
    expect(a.nearest.distance).toBeGreaterThanOrEqual(0);
  });

  it('steer vận tốc 0 = dừng: về idle và `at` trở lại', async () => {
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: -1.6, ms: 200 });
    await d.run('actor.steer', { actor: 'owner', vx: 0, vz: 0, ms: 120 });
    const a = actor(await dc(), 'owner');
    expect(a.state).toBe('idle');
    expect(a.at).toBe('buc-trung-tam');
  });

  it('actor không có → lỗi rõ ràng, không nổ', async () => {
    const kq = await d.run('actor.steer', { actor: 'khong-co', vx: 1, vz: 0, ms: 100 });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.error).toContain('khong-co');
  });

  it('có trong stage.bootstrap kèm tham số + ví dụ (agent tự học được)', async () => {
    const kq = await d.run('stage.bootstrap');
    expect(kq.ok).toBe(true);
    if (!kq.ok) return;
    const boot = kq.result as {
      commands: Array<{ cmd: string; params: Array<{ name: string }>; example: unknown }>;
      events: string[];
    };
    const sp = boot.commands.find((c) => c.cmd === 'actor.steer');
    expect(sp).toBeDefined();
    expect(sp!.params.map((p) => p.name)).toEqual(['actor', 'vx', 'vz', 'ms']);
    // KHÔNG có `interrupt`: lệnh không chiếm hàng đợi nên không cần cắt ngang
    expect(sp!.params.map((p) => p.name)).not.toContain('interrupt');
    expect(boot.events).toContain('actor.steerDone');
  });
});

/**
 * Va chạm trên MỘT bộ vật cản tổng hợp (nạp bằng `datCanhChan` y như `World`
 * nạp hộp đo của văn phòng) — test giữ CƠ CHẾ, không giữ chỗ đứng của đồ đạc.
 */
describe('kẹp sàn + va chạm (bo-cuc.ts)', () => {
  const BAN = { id: 'ban', x0: 2, x1: 3, z0: -0.5, z1: 0.5 };
  const TU = { id: 'tu', x0: -4, x1: -3, z0: 2, z1: 4 };
  beforeEach(() => datCanhChan({ hop: [BAN, TU], ...SAN_MAC_DINH }));
  afterEach(() => datCanhChan(null));

  it('kẹp trong sàn: đi ra ngoài mép thì dừng ở lề', () => {
    expect(kepTrongPhong(99, 0)[0]).toBeCloseTo(SAN_MAC_DINH.x1 - LE_TUONG, 5);
    expect(kepTrongPhong(0, -99)[1]).toBeCloseTo(SAN_MAC_DINH.z0 + LE_TUONG, 5);
    const [x, z] = truotVaCham(0, 0, 50, 50);
    expect(x).toBeLessThanOrEqual(SAN_MAC_DINH.x1 - LE_TUONG + 1e-9);
    expect(z).toBeLessThanOrEqual(SAN_MAC_DINH.z1 - LE_TUONG + 1e-9);
  });

  it('tâm vật cản bị chặn, chỗ trống trước nó thì không', () => {
    expect(biChan(2.5, 0)).toBe('ban');
    expect(biChan(2.5, 1.4)).toBeNull();
  });

  it('đi thẳng vào vật cản thì dừng trước nó, không lọt vào trong', () => {
    const [x, z] = truotVaCham(0, 0, 2.5, 0);
    expect(biChan(x, z)).toBeNull();
    expect(x).toBeLessThan(BAN.x0);
  });

  it('TRƯỢT dọc vật cản: đi chéo vào mép vẫn nhích được theo trục còn lại', () => {
    const x0 = BAN.x0 - 0.31;
    const [x, z] = truotVaCham(x0, 0, 2.5, 0.3);
    expect(x).toBeCloseTo(x0, 5); // trục X bị bàn chặn
    expect(z).toBeGreaterThan(0); // trục Z vẫn đi được → men theo mép
  });

  it('bị chặn cả hai trục thì đứng yên, không bị đẩy xuyên', () => {
    // đi thẳng vào mặt tủ: trục X bị chặn, trục Z không đổi → đứng yên
    const x0 = TU.x1 + 0.31;
    const zm = (TU.z0 + TU.z1) / 2;
    const [x, z] = truotVaCham(x0, zm, TU.x1 - 0.2, zm);
    expect([x, z]).toEqual([x0, zm]);
  });
});

describe('place giữ ĐỦ id cũ (hợp đồng agent/MCP không đổi)', () => {
  it('đủ 12 id cũ (INT-07 thêm bàn/ghế CEO + ghế `cho-*` cho nhân viên, không bớt id nào)', () => {
    const can = [
      'ban-dieu-khien',
      'ban-1',
      'ban-2',
      'ghe-1',
      'ghe-2',
      'buc-trung-tam',
      'cua',
      'ke-module',
      'sofa',
      'ban-an',
      'bep',
      'cua-so',
    ];
    const co = new Set(PLACES.map((p) => p.id));
    for (const id of can) expect(co.has(id), id).toBe(true);
    for (const p of PLACES) if (!can.includes(p.id)) expect(p.id, 'id mới phải là chỗ CEO / ghế nhân viên').toMatch(/^(cho-|ban-ceo$|ghe-ceo$)/);
    expect(timPlace('ghe-1')?.kind).toBe('seat');
  });
});

describe('controlledBy (Issue #18 mục 3)', () => {
  it('stage.describe trả controlledBy cho mọi actor', async () => {
    const st = await dc();
    expect(actor(st, 'owner').controlledBy).toBe('owner');
    expect(actor(st, 'gen').controlledBy).toBe('agent');
  });

  it('actor.spawn nhận controlledBy, mặc định là agent', async () => {
    await d.run('actor.spawn', { id: 'phu', at: 'ban-2' });
    expect(actor(await dc(), 'phu').controlledBy).toBe('agent');
    await d.run('actor.spawn', { id: 'chu2', at: 'ban-1', controlledBy: 'owner' });
    expect(actor(await dc(), 'chu2').controlledBy).toBe('owner');
  });

  it('camera.preset có `theo-owner`', async () => {
    const kq = await d.run('camera.preset', { name: 'theo-owner' });
    expect(kq.ok).toBe(true);
    expect(world.may).toBe('theo-owner');
  });
});
