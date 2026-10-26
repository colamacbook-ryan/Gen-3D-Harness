/**
 * stage.ts — nhóm lệnh meta (spec mục 3.1).
 *
 * `stage.bootstrap` là **sách hướng dẫn tự sinh**: nó đọc registry, không có
 * danh sách viết tay nào, nên thêm lệnh mới là bootstrap tự biết.
 */
import type { CommandSpec } from '../types';
import { moTaLenh } from '../registry';
import { ngay, pSo } from './tien-ich';
// C2 (#32) — câu giọng gần nhất + lệnh đã hiểu (spec mục 3.6).
import { lenhCuoi } from '../../behavior/hieu-lenh';
// CNS-005 — phiếu giọng + cách tính `goiGen` y hệt đường mic (bridge/stt.ts)
import { boPhieuGiong, datPhieuGiong } from '../../audio/so-giong';
import { chuanHoaCauNoi } from '../../audio/so-tu';

export const PHIEN_BAN_API = '0.1';

export const LENH_STAGE: CommandSpec[] = [
  {
    cmd: 'stage.bootstrap',
    group: 'stage',
    desc: 'Toàn bộ sách hướng dẫn: version, mọi lệnh + mô tả + ví dụ, danh sách actor/place/prop/clip/biểu cảm. Agent gọi đầu tiên.',
    params: [],
    example: { cmd: 'stage.bootstrap' },
    handler(_a, ctx) {
      const w = ctx.world;
      const lenh = ctx.registry.all().map((sp) => moTaLenh(sp, w));
      return ngay({
        version: PHIEN_BAN_API,
        huongDan:
          'Gọi stage.describe để đọc trạng thái bằng số (mét, facing độ, distances tính sẵn), ' +
          'rồi chọn lệnh trong danh sách dưới. Lệnh có "chuaLam" là của đợt A2/A3, gọi sẽ trả ok:false.',
        quyUocDo: {
          donVi: 'mét',
          goc: 'giữa phòng',
          facing: 'độ, 0 = hướng camera mặc định (+Z)',
          trangThaiActor: [
            'idle',
            'walking',
            'sitting',
            'playing',
            'speaking',
            'emoting',
            'building',
          ],
          hangDoi:
            'busy=true thì lệnh mới vào hàng đợi; thêm interrupt:true để cắt ngang',
        },
        groups: ctx.registry.groups(),
        commands: lenh,
        actors: w.actorIds(),
        places: w.describe().places,
        props: w.propIds(),
        screens: w.screenIds(),
        clips: w.clips(),
        expressions: w.expressions(),
        emotes: w.emotes(),
        voices: dsGiong(),
        // sinh từ registry (mỗi lệnh tự khai `events`) + sự kiện hệ thống —
        // không còn bảng viết tay nào để quên cập nhật
        events: ctx.registry.suKien(),
      });
    },
  },

  {
    cmd: 'stage.describe',
    group: 'stage',
    desc: 'Trạng thái sân khấu bằng số: actor ở đâu, làm gì, khoảng cách tới mọi place',
    params: [],
    example: { cmd: 'stage.describe' },
    handler(_a, ctx) {
      const st = ctx.world.describe();
      const hd = ctx.hangDoi();
      // ghép thông tin hàng đợi của dispatcher vào snapshot: `busy` phải phản
      // ánh cả hành động trong sân khấu lẫn lệnh đang chờ ở dispatcher
      st.actors = st.actors.map((a) => {
        const q = hd[a.id];
        return q ? { ...a, busy: a.busy || q.busy, queued: q.queued } : a;
      });
      const cuoi = lenhCuoi();
      return ngay({
        ...(st as unknown as Record<string, unknown>),
        ...(cuoi ? { lastCommand: cuoi } : {}),
      });
    },
  },

  {
    cmd: 'stage.hear',
    group: 'stage',
    events: ['user.text', 'user.speech', 'actor.sayStart', 'actor.sayDone', 'cmd.queued'],
    desc:
      'Đánh dấu một câu là Boss NÓI (không phải gõ) từ nguồn ngoài trình duyệt (extension, ' +
      'sidecar STT, agent): bắn đúng một user.text + một user.speech (confidence, goiGen). ' +
      'Chữ đi qua sổ từ nhà như đường mic ("ghen ơi" → "Gen ơi"). ' +
      'Chạy actor.say (interrupt) lên nhân vật controlledBy "owner" nên user.text vẫn chỉ có một nguồn. ' +
      'Chỉ dành cho Boss/ngoại vi (ws bridge): MCP của não bị chặn lệnh này',
    params: [
      { name: 'text', type: 'text', desc: 'Câu đã nhận dạng', required: true },
      {
        name: 'to',
        type: 'target',
        desc: 'Nói VỚI AI (như actor.say): "camera" (mặc định) hoặc id một actor',
        goiY: 'targets',
        tuDo: true,
      },
      pSo('confidence', 'Độ tin cậy nhận dạng 0..1', { default: 1, min: 0, max: 1 }),
      pSo('durationMs', 'Thời gian nhận dạng (ms)', { default: 0, min: 0 }),
    ],
    example: { cmd: 'stage.hear', args: { text: 'Gen ơi, dựng connector Baserow', confidence: 0.9 } },
    async handler(a, ctx) {
      const owner = ctx.world.describe().actors.find((x) => x.controlledBy === 'owner');
      if (!owner) throw new Error('Không có actor controlledBy "owner" để nghe câu này');
      // cùng chuẩn hoá với đường mic (sổ từ nhà): "ghen ơi" → "Gen ơi"; text gửi đi và goiGen dùng CÙNG chữ đã sửa
      const chuan = chuanHoaCauNoi(String(a.text));
      const text = chuan.text;
      const conf = a.confidence === undefined ? 1 : Number(a.confidence);
      const dur = a.durationMs === undefined ? 0 : Number(a.durationMs);
      datPhieuGiong({
        text,
        confidence: Math.min(1, Math.max(0, conf)),
        durationMs: Math.max(0, dur),
        goiGen: chuan.goiGen,
      });
      let kq;
      try {
        // qua dispatcher: `user.text` giữ đúng MỘT nguồn (actor.say lên owner)
        kq = await ctx.run('actor.say', {
          actor: owner.id,
          text,
          // như ô chat: Boss nói khi nhân vật đang bận (moveTo/đang nói) thì câu tới NGAY, không xếp hàng
          interrupt: true,
          ...(a.to === undefined ? {} : { to: String(a.to) }),
        });
      } catch (e) {
        boPhieuGiong(text);
        throw e;
      }
      if (!kq.ok) {
        // actor.say từ chối → không để phiếu treo sang câu gõ tay sau
        boPhieuGiong(text);
        throw new Error(kq.error);
      }
      return ngay({ heard: true, actor: owner.id, text });
    },
  },

  {
    cmd: 'stage.reset',
    group: 'stage',
    events: ['stage.reset', 'stage.resetting'],
    desc: 'Về trạng thái ban đầu: xoá actor/prop thêm vào, dọn hàng đợi, đèn và camera mặc định',
    params: [],
    example: { cmd: 'stage.reset' },
    async handler(_a, ctx) {
      for (const id of ctx.world.actorIds()) ctx.catNgang(id);
      await ctx.world.reset();
      ctx.bus.emit('stage.reset', {});
      return ngay({ reset: true, actors: ctx.world.actorIds() });
    },
  },
];

/** Danh sách giọng Web Speech có trên máy (rỗng khi chạy ngoài trình duyệt). */
function dsGiong(): string[] {
  const g = globalThis as { speechSynthesis?: { getVoices(): { name: string; lang: string }[] } };
  if (!g.speechSynthesis) return [];
  try {
    return g.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.startsWith('vi') || v.lang.startsWith('en'))
      .map((v) => `${v.name} (${v.lang})`);
  } catch {
    return [];
  }
}
