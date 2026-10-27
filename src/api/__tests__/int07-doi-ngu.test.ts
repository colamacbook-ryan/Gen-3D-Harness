/**
 * INT-07 (Ryan 27/10) — ĐỘI NGŨ AGENT hiện hình: Nhi là kỹ sư trưởng, mỗi
 * subagent là một nhân viên búp bê sinh ra theo việc thật.
 *
 * Giao kèo kiểm bằng số:
 *  1. `team.event spawn` → nhân viên MỚI vào từ cửa, tới đúng khu theo vai,
 *     ngồi ghế trống / đứng chỗ làm; Nhi nhìn sang (kỹ sư trưởng giao việc).
 *  2. `done`/`fail` → nhân viên tới bàn Nhi nộp kết quả rồi RỜI sân khấu.
 *  3. Đủ `TOI_DA_NHAN_VIEN` thì không sinh thêm (ngân sách hiệu năng L-42).
 *  4. Chỗ làm của mọi khu đứng NGOÀI vật cản THẬT và A* tới được từ cửa.
 *  5. Não (MCP) không được giả việc thật: `team.event` bị chặn như `stage.notice`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { EventBus } from '../../events';
import { SanKhauGia } from './san-khau-gia';
import {
  batDoiNgu,
  CHO_LAM,
  chuanVai,
  tenCuaVai,
  idNhanVien,
  khuCuaVai,
  TOI_DA_NHAN_VIEN,
  type MayDoiNgu,
} from '../../behavior/doi-ngu';
import { biChan, datCanhChan, SAN_MAC_DINH, timDuong } from '../../stage/bo-cuc';
import { timPlace } from '../../stage/noi-dung';
import { lyDoCamNao, LENH_CHI_CHO_BOSS } from '../../../bridge/mcp';
import { vatCanVanPhong } from './vat-can';

let world: SanKhauGia;
let bus: EventBus;
let d: Dispatcher;
let may: MayDoiNgu;

beforeEach(() => {
  world = new SanKhauGia(['owner', 'gen']);
  bus = new EventBus();
  d = new Dispatcher({ registry: taoRegistry(), world, bus });
  may = batDoiNgu({ dispatcher: d, bus, nghi: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))) });
});

const giao = (id: string, role: string, task = 'việc thử') =>
  d.run('team.event', { kind: 'spawn', id, role, task, source: 'claude-code' });
const nhatKyLenh = () => world.lichSu;
const xong = (id: string, kind: 'done' | 'fail' = 'done') => d.run('team.event', { kind, id });

describe('vai → khu', () => {
  it('vai quen vào đúng khu, vai có tiền tố plugin được chuẩn hoá', () => {
    expect(khuCuaVai('builder')).toBe('ky-thuat');
    expect(khuCuaVai('reviewer')).toBe('phong-hop');
    expect(khuCuaVai('researcher')).toBe('kinh-doanh');
    expect(khuCuaVai('designer')).toBe('thiet-ke');
    expect(chuanVai('feature-dev:code-reviewer')).toBe('code-reviewer');
    expect(khuCuaVai('feature-dev:code-reviewer')).toBe('phong-hop');
    expect(khuCuaVai('Explore')).toBe('kinh-doanh');
    expect(khuCuaVai('vai-la-hoac')).toBe('ky-thuat');
    expect(tenCuaVai('feature-dev:code-reviewer')).toBe('Reviewer');
    expect(tenCuaVai('builder')).toBe('Thợ xây');
  });

  it('id nhân viên an toàn từ tool_use_id dài', () => {
    expect(idNhanVien('toolu_01ABCdef/../x')).toMatch(/^nv-[a-z0-9]{1,8}$/);
  });
});

describe('team.event — lệnh', () => {
  it('bắn sự kiện team.event đã làm sạch, cắt task dài', async () => {
    const thay: Record<string, unknown>[] = [];
    bus.on('team.event', (e) => thay.push(e.data as Record<string, unknown>));
    const r = await d.run('team.event', {
      kind: 'spawn',
      id: 'toolu_1',
      role: 'builder',
      task: 'x'.repeat(300) + '‮',
    });
    expect(r.ok).toBe(true);
    expect(thay[0]).toMatchObject({ kind: 'spawn', id: 'toolu_1', role: 'builder' });
    expect(String(thay[0]!.task).length).toBeLessThanOrEqual(120);
    expect(String(thay[0]!.task)).not.toContain('‮');
  });

  it('id rỗng hoặc kind lạ bị từ chối', async () => {
    expect((await d.run('team.event', { kind: 'spawn', id: '  ' })).ok).toBe(false);
    expect((await d.run('team.event', { kind: 'nhay', id: 'a' })).ok).toBe(false);
  });

  it('não (MCP) KHÔNG được gọi team.event — giả việc thật là nói dối với Sếp', () => {
    expect(LENH_CHI_CHO_BOSS.has('team.event')).toBe(true);
    expect(lyDoCamNao('team.event', { kind: 'spawn', id: 'x' }, new Set(['owner']))).toBeTruthy();
  });
});

describe('vòng đời nhân viên trên sân khấu', () => {
  it('spawn → nhân viên vào từ cửa, ngồi ghế trống khu Kỹ thuật; Nhi nhìn sang', async () => {
    await giao('toolu_aaa111', 'builder', 'Viết test A*');
    await may.xong();
    const st = may.trangThai();
    expect(st.nhanVien).toHaveLength(1);
    const nv = st.nhanVien[0]!;
    expect(nv).toMatchObject({ khu: 'ky-thuat', pha: 'lam', task: 'Viết test A*' });
    expect(nv.cho).toEqual({ seat: 'cho-kt-1' });
    // `ctx.run` trả lời lúc hành động BẮT ĐẦU — chờ cú ngồi xong thật
    for (let i = 0; i < 100 && d.dangBan(nv.actor); i += 1) await new Promise((r) => setTimeout(r, 5));
    const a = world.describe().actors.find((x) => x.id === nv.actor)!;
    expect(a).toBeTruthy();
    expect(a.name).toBe('Thợ xây');
    expect(a.state).toBe('sitting');
    // kỹ sư trưởng nhìn sang người vừa được giao việc
    expect(world.describe().actors.find((x) => x.id === 'gen')!.lookingAt).toBe(nv.actor);
  });

  it('hai builder: người thứ hai lấy ghế trống kế tiếp, không chồng chỗ', async () => {
    await giao('t1', 'builder');
    await giao('t2', 'builder');
    await may.xong();
    const cho = may.trangThai().nhanVien.map((n) => n.cho);
    expect(cho).toEqual([{ seat: 'cho-kt-1' }, { seat: 'cho-kt-2' }]);
  });

  it('reviewer vào Phòng họp, researcher vào Kinh doanh', async () => {
    await giao('r1', 'reviewer');
    await giao('s1', 'researcher');
    await may.xong();
    const theoVai = Object.fromEntries(may.trangThai().nhanVien.map((n) => [n.role, n.khu]));
    expect(theoVai).toEqual({ reviewer: 'phong-hop', researcher: 'kinh-doanh' });
  });

  it('done → nộp kết quả cho Nhi rồi RỜI sân khấu; sự kiện pha đủ vào → làm → nộp → rời', async () => {
    const pha: string[] = [];
    bus.on('team.member', (e) => pha.push(String((e.data as { pha: string }).pha)));
    await giao('t9', 'designer');
    await may.xong();
    const actor = may.trangThai().nhanVien[0]!.actor;
    await xong('t9');
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(0);
    expect(world.describe().actors.some((a) => a.id === actor)).toBe(false);
    expect(pha).toEqual(['vao', 'lam', 'nop', 'roi']);
  });

  it('done tới TRƯỚC khi nhân viên vào chỗ xong → vẫn đúng thứ tự, không sót người trên sân khấu', async () => {
    await giao('nhanh', 'builder');
    await xong('nhanh'); // subagent xong ngay — chuỗi phải xếp sau bước vào
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(0);
    expect(world.describe().actors.map((a) => a.id).sort()).toEqual(['gen', 'owner']);
  });

  it('fail → nhân viên vẫn rời đi (không treo), sự kiện mang ok:false', async () => {
    const ok: unknown[] = [];
    bus.on('team.member', (e) => {
      const x = e.data as { pha: string; ok?: boolean };
      if (x.pha === 'roi') ok.push(x.ok);
    });
    await giao('f1', 'tester');
    await xong('f1', 'fail');
    await may.xong();
    expect(ok).toEqual([false]);
  });

  it(`đủ ${TOI_DA_NHAN_VIEN} người thì không sinh thêm (L-42), đếm vào khongHien`, async () => {
    for (let i = 0; i < TOI_DA_NHAN_VIEN + 2; i += 1) await giao(`n${i}`, 'builder');
    await may.xong();
    const st = may.trangThai();
    expect(st.nhanVien).toHaveLength(TOI_DA_NHAN_VIEN);
    expect(st.khongHien).toBe(2);
  });

  it('sự kiện spawn lặp (cùng id) không sinh hai người', async () => {
    await giao('dup', 'builder');
    await giao('dup', 'builder');
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(1);
  });

  it('done cho id lạ thì bỏ qua, không lỗi', async () => {
    await xong('khong-co');
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(0);
  });
});

describe('phân vai nhìn thấy được (thẻ tên)', () => {
  const the = (id: string) => world.describe().actors.find((a) => a.id === id)?.label ?? null;

  it('bật máy là Nhi mang thẻ "Kỹ sư trưởng", Nam mang thẻ "Sếp"', async () => {
    await may.xong();
    await new Promise((r) => setTimeout(r, 5));
    expect(the('gen')).toBe('Nhi · Kỹ sư trưởng');
    expect(the('owner')).toBe('Nam · Sếp');
  });

  it('nhân viên mang thẻ "vai · việc" (việc dài thì cắt), tone nhân viên', async () => {
    await giao('t1', 'builder', 'Viết bộ test cho thuật toán tìm đường A* trong văn phòng');
    await may.xong();
    const nv = may.trangThai().nhanVien[0]!;
    const t = the(nv.actor)!;
    expect(t.startsWith('Thợ xây · Viết bộ test')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(world.theTen.get(nv.actor)?.tone).toBe('nhan-vien');
  });

  it('có việc giao mà Nhi đang rảnh thì Nhi về ngồi bàn điều phối (ghe-2)', async () => {
    await giao('t2', 'reviewer');
    await may.xong();
    for (let i = 0; i < 100 && d.dangBan('gen'); i += 1) await new Promise((r) => setTimeout(r, 5));
    const nhi = world.describe().actors.find((a) => a.id === 'gen')!;
    expect(nhi.state).toBe('sitting');
    expect(nhi.at).toBe('ghe-2');
  });

  it('Nhi đang bận việc của não thì KHÔNG bị kéo về bàn', async () => {
    await d.run('actor.moveTo', { actor: 'gen', to: 'bep' });
    await giao('t3', 'builder');
    await may.xong();
    expect(nhatKyLenh().some((x) => x.startsWith('sit:gen'))).toBe(false);
  });

  it('stage.reset → thẻ cố định được gắn lại', async () => {
    // sân khấu giả reset ra bộ actor khác bản thật — giả lập đúng cái sân khấu
    // thật làm: dựng lại actor (mất thẻ) rồi bắn `stage.reset`
    await new Promise((r) => setTimeout(r, 5));
    world.theTen.clear();
    bus.emit('stage.reset', {});
    await new Promise((r) => setTimeout(r, 20));
    expect(the('gen')).toBe('Nhi · Kỹ sư trưởng');
  });
});

describe('chỗ làm trên bộ vật cản THẬT của văn phòng', () => {
  it('mọi chỗ đứng ngoài vật cản, mọi ghế là place seat; A* từ cửa tới được', () => {
    datCanhChan({ hop: vatCanVanPhong(), ...SAN_MAC_DINH });
    try {
      const cua = timPlace('cua')!.standAt!;
      for (const [khu, ds] of Object.entries(CHO_LAM)) {
        for (const c of ds) {
          const [x, z] = 'seat' in c ? [timPlace(c.seat)!.pos[0], timPlace(c.seat)!.pos[2]] : [c.x, c.z];
          if ('seat' in c) {
            expect(timPlace(c.seat)?.kind, `${khu}: ${c.seat}`).toBe('seat');
          } else {
            expect(biChan(x, z, 0.3), `${khu}: chỗ đứng (${x}, ${z}) nằm trong vật cản`).toBeNull();
          }
          const dd = timDuong(cua[0], cua[2], x, z, 0.34);
          const [ex, ez] = dd[dd.length - 1]!;
          expect(Math.hypot(ex - x, ez - z), `${khu}: A* dừng xa chỗ làm (${x}, ${z})`).toBeLessThan(0.75);
        }
      }
    } finally {
      datCanhChan(null);
    }
  });
});

