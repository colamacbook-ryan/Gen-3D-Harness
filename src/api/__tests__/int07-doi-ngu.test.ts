/**
 * INT-07 (Ryan 27/10) — CÔNG TY AGENT theo QUY TRÌNH: Nam là CEO, Nhi là Giám
 * đốc kỹ thuật (kỹ sư trưởng), mỗi subagent là một nhân viên búp bê.
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
  CHO_BAO_CAO_CEO,
  CHO_CHU_TRI_HOP,
  CUA_SO_GIAO_MS,
  THU_TU_PHA,
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

  it('done → nộp kết quả cho Nhi rồi RỜI sân khấu; sự kiện pha đủ vào → chờ giao → làm → nộp → chờ duyệt → về → rời', async () => {
    const pha: string[] = [];
    bus.on('team.member', (e) => pha.push(String((e.data as { pha: string }).pha)));
    await giao('t9', 'designer');
    await may.xong();
    const actor = may.trangThai().nhanVien[0]!.actor;
    await xong('t9');
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(0);
    expect(world.describe().actors.some((a) => a.id === actor)).toBe(false);
    expect(pha).toEqual(['vao', 'cho-giao', 'lam', 'nop', 'cho-duyet', 've', 'roi']);
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

  it('bật máy là Nhi mang thẻ "Giám đốc kỹ thuật", Nam mang thẻ "CEO"', async () => {
    await may.xong();
    await new Promise((r) => setTimeout(r, 5));
    expect(the('gen')).toBe('Nhi · Giám đốc kỹ thuật');
    expect(the('owner')).toBe('Nam · CEO');
    expect(world.theTen.get('owner')?.tone).toBe('ceo');
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

  it('Nhi đang bận việc của não thì KHÔNG bị cắt ngang — giao việc chờ Nhi làm xong rồi mới về bàn', async () => {
    await d.run('actor.moveTo', { actor: 'gen', to: 'bep' });
    await giao('t3', 'builder');
    await may.xong();
    const ls = nhatKyLenh();
    expect(ls.some((x) => x === 'interrupt:gen')).toBe(false);
    expect(ls.indexOf('sit:gen')).toBeGreaterThan(ls.indexOf('moveTo:gen'));
  });

  it('stage.reset → thẻ cố định được gắn lại', async () => {
    // sân khấu giả reset ra bộ actor khác bản thật — giả lập đúng cái sân khấu
    // thật làm: dựng lại actor (mất thẻ) rồi bắn `stage.reset`
    await new Promise((r) => setTimeout(r, 5));
    world.theTen.clear();
    bus.emit('stage.reset', {});
    await new Promise((r) => setTimeout(r, 20));
    expect(the('gen')).toBe('Nhi · Giám đốc kỹ thuật');
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


/* ------------------------------------------------------------------ */
/* QUY TRÌNH (Ryan: "luôn phải theo quy trình, không tự biên tự diễn") */
/* ------------------------------------------------------------------ */

const su = (kind: string, them: Record<string, unknown> = {}) =>
  d.run('team.event', { kind, id: `s-${kind}-${Math.random().toString(36).slice(2, 8)}`, source: 'claude-code', ...them });
const viTri = (id: string) => world.describe().actors.find((a) => a.id === id);
const gan = (id: string, x: number, z: number) => {
  const p = viTri(id)!.pos;
  return Math.hypot(p[0] - x, p[2] - z) < 0.05;
};
const suKien = (ten: string) => {
  const ds: Record<string, unknown>[] = [];
  bus.on(ten, (e) => ds.push(e.data as Record<string, unknown>));
  return ds;
};

describe('quy trình — luật thứ tự bắt buộc', () => {
  it('pha đi đúng thứ tự: nhận việc → lập kế hoạch → giao việc → thực hiện → duyệt → báo cáo → nghỉ', async () => {
    await su('brief');
    await may.xong();
    await giao('q1', 'builder');
    await may.xong();
    await xong('q1');
    await su('report');
    await may.xong();
    expect(may.trangThai().lichSuPha).toEqual([
      'nghi',
      'nhan-viec',
      'lap-ke-hoach',
      'giao-viec',
      'thuc-hien',
      'duyet',
      'bao-cao',
      'nghi',
    ]);
    // mọi bước chuyển (trừ quay về nghỉ / làm tiếp) đều đi TỚI trong THU_TU_PHA
    const ls = may.trangThai().lichSuPha;
    for (let i = 1; i < ls.length; i += 1) {
      if (ls[i] === 'nghi' || ls[i] === 'thuc-hien') continue;
      expect(THU_TU_PHA.indexOf(ls[i]!)).toBeGreaterThan(THU_TU_PHA.indexOf(ls[i - 1]!));
    }
  });

  it('nhận việc: Giám đốc lên bàn CEO đứng nghe, CEO gật, rồi về bàn riêng', async () => {
    await su('brief');
    await may.xong();
    const ls = world.lichSu;
    expect(ls.some((x) => x.startsWith('ngheNgong:owner:true'))).toBe(true);
    expect(ls.some((x) => x.startsWith('ngheNgong:gen:true'))).toBe(true);
    // đã ĐI tới chỗ báo cáo CEO trước khi ngồi lại
    const iDi = ls.findIndex((x) => x.startsWith('moveTo:gen'));
    const iNgoi = ls.findIndex((x, i) => i > iDi && x.startsWith('sit:gen'));
    expect(iDi).toBeGreaterThanOrEqual(0);
    expect(iNgoi).toBeGreaterThan(iDi);
    expect(viTri('gen')!.at).toBe('ghe-2');
  });

  it('thiếu brief (hook chỉ bắt Task) → máy tự đi qua pha nhận việc NGẦM, không nhảy cóc', async () => {
    const pha = suKien('team.phase');
    await giao('ng1', 'builder');
    await may.xong();
    expect(may.trangThai().lichSuPha.slice(0, 4)).toEqual(['nghi', 'nhan-viec', 'lap-ke-hoach', 'giao-viec']);
    expect(pha[0]).toMatchObject({ pha: 'nhan-viec', ngam: true });
    // ngầm = không diễn cảnh lên bàn CEO
    expect(world.lichSu.some((x) => x.startsWith('ngheNgong:owner:true'))).toBe(false);
  });

  it('nhân viên ĐỨNG CHỜ ở cửa tới khi Giám đốc giao việc — không tự về chỗ', async () => {
    let moCua!: () => void;
    const cua = new Promise<void>((r) => (moCua = r));
    may.dung();
    may = batDoiNgu({
      dispatcher: d,
      bus,
      nghi: (ms) => (ms === CUA_SO_GIAO_MS ? cua : new Promise((r) => setTimeout(r, Math.min(ms, 5)))),
    });
    await giao('w1', 'builder');
    await new Promise((r) => setTimeout(r, 40));
    const nv = may.trangThai().nhanVien[0]!;
    expect(nv.pha).toBe('cho-giao');
    expect(world.lichSu.some((x) => x.startsWith(`sit:${nv.actor}`))).toBe(false);
    // done tới ngay lúc còn chờ giao → vẫn KHÔNG được nộp trước khi được giao
    await xong('w1');
    await new Promise((r) => setTimeout(r, 40));
    expect(world.describe().actors.some((a) => a.id === nv.actor)).toBe(true);
    moCua();
    await may.xong();
    const ls = world.lichSu;
    const iNgoi = ls.findIndex((x) => x.startsWith(`sit:${nv.actor}`));
    const iVe = ls.findIndex((x) => x === `remove:${nv.actor}`);
    expect(iNgoi).toBeGreaterThanOrEqual(0);
    expect(iVe).toBeGreaterThan(iNgoi);
  });

  it('giao cùng đợt ≥ 2 người ⇒ HỌP NHÓM ở Phòng họp (Giám đốc chủ trì đầu bàn)', async () => {
    const hop = suKien('team.meeting');
    await su('brief');
    await may.xong();
    await giao('h1', 'builder');
    await giao('h2', 'designer');
    await giao('h3', 'researcher');
    // chờ tới lúc họp bắt đầu, rồi chụp vị trí Giám đốc
    for (let i = 0; i < 200 && !hop.some((h) => h.pha === 'xong'); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(hop[0]).toMatchObject({ pha: 'bat-dau' });
    expect((hop[0]!.nhanVien as string[]).length).toBe(3);
    await may.xong();
    expect(hop.map((h) => h.pha)).toEqual(['bat-dau', 'xong']);
    // trong nhật ký: Giám đốc ra lệnh trong cuộc họp, cả 3 nhân viên gật nghe
    expect(world.lichSu.filter((x) => /^ngheNgong:nv-.*:true/.test(x))).toHaveLength(3);
    expect(may.trangThai().nhanVien.every((n) => n.pha === 'lam')).toBe(true);
  });

  it('giao 1 người ⇒ giao riêng tại bàn Giám đốc (KHÔNG họp)', async () => {
    const hop = suKien('team.meeting');
    await giao('r1', 'builder');
    await may.xong();
    expect(hop).toHaveLength(0);
    expect(viTri('gen')!.at).toBe('ghe-2');
  });

  it('nộp bài → Giám đốc DUYỆT trước, nhân viên về SAU (team.review trước pha "roi")', async () => {
    const thuTu: string[] = [];
    bus.on('team.review', (e) => thuTu.push(`review:${(e.data as { ok: boolean }).ok}`));
    bus.on('team.member', (e) => {
      const x = e.data as { pha: string };
      if (x.pha === 'roi') thuTu.push('roi');
    });
    await giao('d1', 'builder');
    await may.xong();
    await xong('d1', 'fail');
    await may.xong();
    expect(thuTu).toEqual(['review:false', 'roi']);
    // bài lỗi: Giám đốc nghiêng đầu hỏi lại
    expect(world.lichSu.some((x) => x === 'ngheNgong:gen:true:hoi')).toBe(true);
  });

  it('report tới khi còn nhân viên chưa nộp bài ⇒ HOÃN; người cuối về mới báo cáo CEO', async () => {
    const bc = suKien('team.report');
    await giao('b1', 'builder');
    await giao('b2', 'tester');
    await may.xong();
    await su('report');
    await may.xong();
    expect(may.trangThai().baoCaoCho).toBe(true);
    expect(bc).toHaveLength(0);
    await xong('b1');
    await may.xong();
    expect(bc).toHaveLength(0); // còn b2
    await xong('b2');
    await may.xong();
    expect(bc).toHaveLength(1);
    expect(may.trangThai().pha).toBe('nghi');
  });

  it('báo cáo: Giám đốc ĐI tới cạnh CEO, CEO gật nghe, rồi về bàn', async () => {
    await su('report');
    await may.xong();
    const ls = world.lichSu;
    expect(ls.some((x) => x.startsWith('ngheNgong:owner:true'))).toBe(true);
    expect(ls.some((x) => x === 'emote.thanh-cong:gen')).toBe(true);
    expect(viTri('gen')!.at).toBe('ghe-2');
  });

  it('ask (cần CEO duyệt) ⇒ Giám đốc đứng chờ cạnh CEO, thẻ "chờ CEO duyệt"; sự kiện kế tiếp mới cho về', async () => {
    await su('ask');
    await may.xong();
    expect(may.trangThai().choCeoDuyet).toBe(true);
    expect(gan('gen', CHO_BAO_CAO_CEO.x, CHO_BAO_CAO_CEO.z)).toBe(true);
    expect(world.theTen.get('gen')?.text).toContain('chờ CEO duyệt');
    await su('ask'); // hỏi lặp không đi thêm vòng
    await su('work', { tool: 'viet' });
    await may.xong();
    expect(may.trangThai().choCeoDuyet).toBe(false);
    expect(viTri('gen')!.at).toBe('ghe-2');
  });

  it('work: đọc/tìm còn ở LẬP KẾ HOẠCH, viết code chuyển sang THỰC HIỆN; thẻ nói đang làm gì', async () => {
    await su('work', { tool: 'doc' });
    await may.xong();
    expect(may.trangThai().pha).toBe('lap-ke-hoach');
    await new Promise((r) => setTimeout(r, 5));
    await su('work', { tool: 'viet' });
    await may.xong();
    expect(may.trangThai().pha).toBe('thuc-hien');
  });

  it('work-result lỗi ⇒ mặt buồn + thẻ "đang sửa lỗi"; đạt lại ⇒ mặt vui', async () => {
    may.dung();
    let t = 0;
    may = batDoiNgu({ dispatcher: d, bus, bayGio: () => (t += 5000), nghi: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))) });
    await su('work', { tool: 'test' });
    await su('work-result', { tool: 'test', ok: false });
    await may.xong();
    expect(world.describe().actors.find((a) => a.id === 'gen')!.expression).toBe('sad');
    expect(world.theTen.get('gen')?.text).toContain('đang sửa lỗi');
    await su('work-result', { tool: 'test', ok: true });
    await may.xong();
    expect(world.describe().actors.find((a) => a.id === 'gen')!.expression).toBe('happy');
  });

  it('compact ⇒ Giám đốc ra kệ hồ sơ rồi về bàn', async () => {
    await su('compact');
    await may.xong();
    expect(world.lichSu.some((x) => x.startsWith('moveTo:gen'))).toBe(true);
    expect(world.lichSu.some((x) => x === 'play.think:gen')).toBe(true);
    expect(viTri('gen')!.at).toBe('ghe-2');
  });

  it('session-end ⇒ mọi nhân viên về (kể cả đang chờ giao), Giám đốc ra sofa nghỉ', async () => {
    await giao('e1', 'builder');
    await giao('e2', 'designer');
    await su('session-end');
    await may.xong();
    expect(may.trangThai().nhanVien).toHaveLength(0);
    expect(world.describe().actors.map((a) => a.id).sort()).toEqual(['gen', 'owner']);
    expect(viTri('gen')!.at).toBe('sofa');
    expect(may.trangThai().pha).toBe('nghi');
  });

  it('chỗ chủ trì họp + chỗ báo cáo CEO ngoài vật cản THẬT và A* tới được', () => {
    datCanhChan({ hop: vatCanVanPhong(), ...SAN_MAC_DINH });
    try {
      const nhi = timPlace('ghe-2')!.pos;
      for (const c of [CHO_BAO_CAO_CEO, CHO_CHU_TRI_HOP]) {
        expect(biChan(c.x, c.z, 0.3), `(${c.x}, ${c.z})`).toBeNull();
        const dd = timDuong(nhi[0], nhi[2] + 0.9, c.x, c.z, 0.34);
        const [ex, ez] = dd[dd.length - 1]!;
        expect(Math.hypot(ex - c.x, ez - c.z)).toBeLessThan(0.75);
      }
    } finally {
      datCanhChan(null);
    }
  });
});

/* ------------------------------------------------------------------ */
/* GIẤY TỜ (Ryan: "cấp trên đóng dấu kiểm nhận, họp hành có biên bản") */
/* ------------------------------------------------------------------ */

describe('sổ quy trình — biên bản, phiếu giao, dấu kiểm nhận, dấu CEO', () => {
  const soLoai = () => may.trangThai().soQuyTrinh.map((b) => b.loai);

  it('trọn một vòng việc để lại đủ giấy tờ ĐÚNG THỨ TỰ, số thứ tự tăng dần', async () => {
    await su('brief');
    await may.xong();
    await giao('g1', 'builder', 'Viết test A*');
    await giao('g2', 'reviewer', 'Soát PR');
    await may.xong();
    await xong('g1');
    await xong('g2', 'fail');
    await su('report');
    await may.xong();
    expect(soLoai()).toEqual(['nhan-viec', 'bien-ban-hop', 'kiem-nhan', 'tra-lai', 'bao-cao', 'ceo-duyet']);
    const so = may.trangThai().soQuyTrinh.map((b) => b.so);
    expect(so).toEqual([...so].sort((a, b) => a - b));
    expect(new Set(so).size).toBe(so.length);
  });

  it('biên bản họp ghi chủ trì, địa điểm, thành phần, phân công từng người', async () => {
    await giao('m1', 'builder', 'Viết test A*');
    await giao('m2', 'designer', 'Vẽ màn hình');
    await may.xong();
    const bb = may.trangThai().soQuyTrinh.find((b) => b.loai === 'bien-ban-hop')!;
    expect(bb.ky).toBe('Nhi');
    expect(bb.chiTiet).toMatchObject({ chuTri: 'Nhi', diaDiem: 'Phòng họp' });
    expect(bb.chiTiet!.phanCong).toEqual([
      expect.objectContaining({ vai: 'Thợ xây', viec: 'Viết test A*' }),
      expect.objectContaining({ vai: 'Thiết kế', viec: 'Vẽ màn hình' }),
    ]);
    expect(bb.chiTiet!.thanhPhan).toEqual(['Nhi', 'Thợ xây', 'Thiết kế']);
  });

  it('giao riêng một người ⇒ PHIẾU GIAO VIỆC (không phải biên bản họp)', async () => {
    await giao('p1', 'tester', 'Chạy lại bộ test');
    await may.xong();
    expect(soLoai()).toContain('phieu-giao');
    expect(soLoai()).not.toContain('bien-ban-hop');
  });

  it('nộp bài ⇒ dấu kiểm nhận hiện ngay trên thẻ người nộp, Giám đốc ký', async () => {
    await giao('k1', 'builder', 'Viết test');
    await may.xong();
    const nv = may.trangThai().nhanVien[0]!;
    const theThay: string[] = [];
    bus.on('team.review', () => theThay.push(world.theTen.get(nv.actor)?.text ?? ''));
    await xong('k1');
    await may.xong();
    expect(theThay[0]).toContain('✔ ĐÃ KIỂM NHẬN');
    const b = may.trangThai().soQuyTrinh.find((x) => x.loai === 'kiem-nhan')!;
    expect(b).toMatchObject({ ky: 'Nhi', chiTiet: expect.objectContaining({ dau: 'ĐÃ KIỂM NHẬN' }) });
  });

  it('rework ⇒ dấu TRẢ LẠI, nhân viên QUAY VỀ chỗ làm (chưa được về); lần nộp sau mới kiểm nhận', async () => {
    await giao('r9', 'builder', 'Viết test');
    await may.xong();
    const actor = may.trangThai().nhanVien[0]!.actor;
    await d.run('team.event', { kind: 'rework', id: 'r9' });
    await may.xong();
    expect(may.trangThai().nhanVien[0]).toMatchObject({ actor, pha: 'lam' });
    expect(world.describe().actors.some((a) => a.id === actor)).toBe(true);
    await xong('r9');
    await may.xong();
    expect(soLoai().filter((l) => l === 'tra-lai' || l === 'kiem-nhan')).toEqual(['tra-lai', 'kiem-nhan']);
    expect(may.trangThai().soQuyTrinh.find((b) => b.loai === 'tra-lai')!.chiTiet).toMatchObject({ lamLai: true });
    expect(world.describe().actors.some((a) => a.id === actor)).toBe(false);
  });

  it('báo cáo mang số bài kiểm nhận / trả lại; CEO đóng dấu duyệt NGAY SAU báo cáo', async () => {
    const bc = suKien('team.report');
    await giao('c1', 'builder');
    await may.xong();
    await xong('c1');
    await su('report');
    await may.xong();
    expect(bc[0]).toMatchObject({ dat: 1, traLai: 0 });
    const ds = may.trangThai().soQuyTrinh;
    const i = ds.findIndex((b) => b.loai === 'bao-cao');
    expect(ds[i + 1]).toMatchObject({ loai: 'ceo-duyet', ky: 'Nam' });
  });

  it('sai quy trình không bị nuốt lặng: nộp bài cho việc chưa giao ⇒ ghi VI PHẠM; thiếu lệnh CEO ⇒ ghi nhận việc NGẦM', async () => {
    await xong('chua-giao');
    await giao('x1', 'builder');
    await may.xong();
    const ds = may.trangThai().soQuyTrinh;
    expect(ds[0]).toMatchObject({ loai: 'vi-pham' });
    expect(ds[1]).toMatchObject({ loai: 'nhan-viec', chiTiet: { ngam: true } });
  });

  it('mỗi bản ghi bắn team.record (chatroom / extension nghe được)', async () => {
    const rec = suKien('team.record');
    await su('brief');
    await may.xong();
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ so: 1, loai: 'nhan-viec', ky: 'Nam' });
  });
});
