/**
 * v3-giac-quan.test.ts — V3 GIÁC QUAN IDE: lệnh `stage.notice` → sự kiện
 * `ide.event`, và phản xạ của Gen (emote, ưu tiên thấp nhất, giới hạn tần suất).
 *
 * Chạy trên sân khấu giả, đồng hồ tiêm được — không sleep theo số giây thật.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { boKyTuLa } from '../commands/stage';
import { Dispatcher } from '../dispatcher';
import { taoRegistry } from '../commands/index';
import { TOI_DA_SUMMARY } from '../commands/stage';
import { EventBus } from '../../events';
import { SanKhauGia, NHIP_MS } from './san-khau-gia';
import { batPhanXa, EMOTE_IDE, MAC_DINH, MS_GIUA_PHAN_XA_IDE, NGUON_PHAN_XA } from '../../behavior/phan-xa';
import { datSoNao, xoaSoNao } from '../../behavior/so-nao';
import { EMOTES } from '../../stage/noi-dung';
import type { StageEvent } from '../types';

const nhipMicro = () => new Promise<void>((r) => setTimeout(r, 0));

function dung() {
  const world = new SanKhauGia(['owner', 'gen']);
  const bus = new EventBus();
  const dispatcher = new Dispatcher({ registry: taoRegistry(), world, bus });
  const ide: StageEvent[] = [];
  bus.on('ide.event', (e) => void ide.push(e));
  return { world, bus, dispatcher, ide };
}

describe('stage.notice → ide.event', () => {
  it('bắn đúng một ide.event {kind, level, summary, data}, không chiếm actor', async () => {
    const t = dung();
    const kq = await t.dispatcher.run('stage.notice', {
      kind: 'test',
      level: 'bad',
      summary: '  Test "unit"   fail (mã 1) ',
      data: { exitCode: 1, name: 'unit' },
    });
    if (!kq.ok) throw new Error(kq.error);
    expect(kq.result).toMatchObject({ noticed: true, kind: 'test', level: 'bad' });
    expect(t.ide).toHaveLength(1);
    expect(t.ide[0]!.data).toEqual({
      kind: 'test',
      level: 'bad',
      summary: 'Test "unit" fail (mã 1)',
      data: { exitCode: 1, name: 'unit' },
    });
    expect(t.dispatcher.dangBan('gen')).toBe(false);
  });

  it('level mặc định info, data mặc định {}, data dạng chuỗi JSON cũng nhận', async () => {
    const t = dung();
    expect((await t.dispatcher.run('stage.notice', { kind: 'save', summary: 'Lưu 1 file: a.ts' })).ok).toBe(true);
    expect(t.ide[0]!.data).toMatchObject({ level: 'info', data: {} });
    const kq = await t.dispatcher.run('stage.notice', {
      kind: 'save',
      summary: 'Lưu 2 file',
      data: '{"count":2,"files":["a.ts","b.ts"]}',
    });
    expect(kq.ok).toBe(true);
    expect(t.ide[1]!.data.data).toEqual({ count: 2, files: ['a.ts', 'b.ts'] });
  });

  it('từ chối: kind lạ, level lạ, summary rỗng/quá dài, data lồng nhau/chuỗi dài — không bắn sự kiện', async () => {
    const t = dung();
    const sai: Record<string, unknown>[] = [
      { kind: 'deploy', summary: 'x' },
      { kind: 'test', level: 'meh', summary: 'x' },
      { kind: 'test', summary: '   ' },
      { kind: 'test', summary: 'a'.repeat(TOI_DA_SUMMARY + 1) },
      { kind: 'save', summary: 'x', data: { noiDung: { dong: 'const a = 1' } } },
      { kind: 'save', summary: 'x', data: { noiDung: 'x'.repeat(500) } },
      { kind: 'save', summary: 'x', data: [1, 2] },
    ];
    for (const a of sai) {
      const kq = await t.dispatcher.run('stage.notice', a);
      expect(kq.ok, JSON.stringify(a).slice(0, 80)).toBe(false);
    }
    expect(t.ide).toHaveLength(0);
    expect((await t.dispatcher.run('stage.notice', { kind: 'test', summary: 'a'.repeat(TOI_DA_SUMMARY) })).ok).toBe(true);
  });

  it('bootstrap liệt kê stage.notice và sự kiện ide.event', async () => {
    const t = dung();
    const kq = await t.dispatcher.run('stage.bootstrap');
    if (!kq.ok) throw new Error(kq.error);
    const r = kq.result as { commands: { cmd: string }[]; events: string[] };
    expect(r.commands.map((c) => c.cmd)).toContain('stage.notice');
    expect(r.events).toContain('ide.event');
  });
});

describe('phản xạ giác quan IDE', () => {
  beforeEach(() => {
    xoaSoNao();
    datSoNao(1); // có não → không có câu "chưa có não" chen vào
  });

  function batMay(t: ReturnType<typeof dung>) {
    let dongHo = 5_000_000;
    const may = batPhanXa({
      dispatcher: t.dispatcher,
      bus: t.bus,
      bayGio: () => dongHo,
      chonCauDem: (ds) => ds[0]!,
      so: { nhipMs: 1_000_000 },
    });
    return {
      may,
      tien: (ms: number) => {
        dongHo += ms;
      },
    };
  }
  const emoteCua = (w: SanKhauGia) => w.lichSu.filter((x) => x.startsWith('emote:'));

  it('bảng EMOTE_IDE chỉ dùng emote có thật; mặc định cách nhau 20 s', () => {
    for (const m of Object.values(EMOTE_IDE)) {
      for (const e of [m.good, m.bad]) if (e) expect(EMOTES as readonly string[]).toContain(e);
    }
    expect(MAC_DINH.ideCachMs).toBe(MS_GIUA_PHAN_XA_IDE);
    expect(MS_GIUA_PHAN_XA_IDE).toBeGreaterThanOrEqual(20_000);
  });

  it('test good → emote vui; test bad → bối rối; git good → thành công — qua dispatcher nguồn phan-xa', async () => {
    const t = dung();
    const nguon: string[] = [];
    t.bus.on('cmd.done', (e) => void nguon.push(String(e.data.source ?? e.data.nguon ?? '')));
    const m = batMay(t);
    t.world.lichSu.length = 0;
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'good', summary: 'Test pass' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual(['emote:vui:0.7']);

    await new Promise((r) => setTimeout(r, NHIP_MS + 10)); // emote giả chạy xong → Gen rảnh
    m.tien(MS_GIUA_PHAN_XA_IDE);
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'bad', summary: 'Test fail' });
    await nhipMicro();
    expect(emoteCua(t.world).at(-1)).toBe('emote:boi-roi:0.7');

    await new Promise((r) => setTimeout(r, NHIP_MS + 10));
    m.tien(MS_GIUA_PHAN_XA_IDE);
    await t.dispatcher.run('stage.notice', { kind: 'git', level: 'good', summary: 'Commit abc1234: sửa' });
    await nhipMicro();
    expect(emoteCua(t.world).at(-1)).toBe('emote:thanh-cong:0.7');
    m.may.dung();
  });

  it('nguồn ghi vào nhật ký là phan-xa', async () => {
    const t = dung();
    const ghi: { cmd: string; nguon: string }[] = [];
    const goc = t.dispatcher.run.bind(t.dispatcher);
    t.dispatcher.run = ((cmd: string, args?: Record<string, unknown>, nguon?: string) => {
      ghi.push({ cmd, nguon: nguon ?? 'ui' });
      return goc(cmd, args, nguon);
    }) as typeof t.dispatcher.run;
    const m = batMay(t);
    await goc('stage.notice', { kind: 'task', level: 'bad', summary: 'Task build lỗi' });
    await nhipMicro();
    expect(ghi).toEqual([{ cmd: 'actor.emote', nguon: NGUON_PHAN_XA }]);
    expect(emoteCua(t.world).at(-1)).toBe('emote:suy-nghi:0.7');
    m.may.dung();
  });

  it('save và mọi info → không làm gì', async () => {
    const t = dung();
    const m = batMay(t);
    t.world.lichSu.length = 0;
    await t.dispatcher.run('stage.notice', { kind: 'save', level: 'good', summary: 'Lưu 1 file' });
    await t.dispatcher.run('stage.notice', { kind: 'save', summary: 'Lưu 1 file' });
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'info', summary: 'Test bắt đầu' });
    await t.dispatcher.run('stage.notice', { kind: 'diag', level: 'info', summary: 'x' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual([]);
    m.may.dung();
  });

  it('giới hạn tần suất: lần hai trong 20 s bị bỏ, sau 20 s lại phản xạ', async () => {
    const t = dung();
    const m = batMay(t);
    t.world.lichSu.length = 0;
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'good', summary: 'pass' });
    await new Promise((r) => setTimeout(r, NHIP_MS + 10));
    m.tien(MS_GIUA_PHAN_XA_IDE - 1);
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'bad', summary: 'fail' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual(['emote:vui:0.7']);
    m.tien(1);
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'bad', summary: 'fail' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual(['emote:vui:0.7', 'emote:boi-roi:0.7']);
    m.may.dung();
  });

  it('ưu tiên thấp nhất: Gen đang bận → không phản xạ, KHÔNG tính lượt (lần sau vẫn được)', async () => {
    const t = dung();
    const m = batMay(t);
    void t.dispatcher.run('actor.moveTo', { actor: 'gen', to: 'cua' });
    await nhipMicro();
    expect(t.dispatcher.dangBan('gen')).toBe(true);
    t.world.lichSu.length = 0;
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'good', summary: 'pass' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual([]);
    expect(t.world.lichSu.some((x) => x.startsWith('stop') || x.includes('interrupt'))).toBe(false);
    await new Promise((r) => setTimeout(r, NHIP_MS + 10));
    expect(t.dispatcher.dangBan('gen')).toBe(false);
    await t.dispatcher.run('stage.notice', { kind: 'test', level: 'good', summary: 'pass' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual(['emote:vui:0.7']);
    m.may.dung();
  });

  it('giữa cuộc nói chuyện (Sếp vừa gõ, đang chờ não) → không chen emote IDE', async () => {
    const t = dung();
    const m = batMay(t);
    t.bus.emit('user.text', { actor: 'owner', text: 'Gen ơi', to: 'camera' });
    await new Promise((r) => setTimeout(r, NHIP_MS + 10)); // emote chu-y giả chạy xong
    t.world.lichSu.length = 0;
    await t.dispatcher.run('stage.notice', { kind: 'git', level: 'good', summary: 'Commit x' });
    await nhipMicro();
    expect(emoteCua(t.world)).toEqual([]);
    m.may.dung();
  });
});

describe('review bảo mật 26/10 — chữ từ IDE', () => {
  it('boKyTuLa bỏ ký tự điều khiển + bidi', () => {
    expect(boKyTuLa('a\u0007b\u202Ec\u2066d\u0085e')).toBe('a b c d e');
  });
});

