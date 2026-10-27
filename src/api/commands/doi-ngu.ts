/**
 * INT-07 — `team.event`: báo sân khấu một subagent vừa được GIAO việc / XONG /
 * HỎNG. Sân khấu chỉ bắn sự kiện `team.event`; máy `src/behavior/doi-ngu.ts`
 * dựng nhân viên và diễn vòng đời của họ qua dispatcher.
 *
 * Nguồn: hook Claude Code (`scripts/bao-doi-ngu.mjs`) và driver não local, qua
 * ws bridge. Não (MCP) KHÔNG được gọi — giả việc thật là nói dối với Sếp
 * (`LENH_CHI_CHO_BOSS` trong `bridge/mcp.ts`, cùng `stage.notice`).
 */
import type { CommandSpec } from '../types';
import { boKyTuLa } from './stage';
import { ngay } from './tien-ich';

const LOAI = ['spawn', 'done', 'fail'] as const;
const TOI_DA_TASK = 120;

export const LENH_DOI_NGU: CommandSpec[] = [
  {
    cmd: 'team.event',
    group: 'stage',
    events: ['team.event'],
    desc:
      'INT-07 — ĐỘI NGŨ AGENT: báo một subagent vừa được giao việc (spawn) / xong (done) / hỏng (fail) → ' +
      'một nhân viên búp bê vào văn phòng, tới khu theo vai, làm việc, nộp kết quả cho Nhi (kỹ sư trưởng) rồi về. ' +
      'Chỉ dành cho ngoại vi (hook Claude Code, driver não local) qua ws bridge: MCP của não bị chặn lệnh này',
    params: [
      { name: 'kind', type: 'enum', desc: 'Giai đoạn', values: LOAI, required: true },
      { name: 'id', type: 'string', desc: 'Mã subagent (vd tool_use_id) — done/fail phải trùng spawn', required: true },
      { name: 'role', type: 'string', desc: 'Vai (subagent_type), vd builder, reviewer, researcher' },
      { name: 'task', type: 'text', desc: `Mô tả việc ngắn (≤ ${TOI_DA_TASK} ký tự, dài hơn thì cắt)` },
      { name: 'source', type: 'string', desc: 'Nguồn: claude-code | nao-local | khac' },
    ],
    example: { cmd: 'team.event', args: { kind: 'spawn', id: 'toolu_01abc', role: 'builder', task: 'Viết test A*' } },
    handler(a, ctx) {
      const id = boKyTuLa(String(a.id)).trim();
      if (!id) throw new Error('id rỗng');
      if (id.length > 80) throw new Error('id dài quá 80 ký tự');
      const role = boKyTuLa(String(a.role ?? 'general-purpose')).trim().slice(0, 40) || 'general-purpose';
      // task là chữ tự do từ ngoài: chỉ để HIỆN, đã bỏ ký tự điều khiển + cắt ngắn
      const task = boKyTuLa(String(a.task ?? '')).replace(/\s+/g, ' ').trim().slice(0, TOI_DA_TASK);
      const source = String(a.source ?? 'khac').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'khac';
      const ev = { kind: String(a.kind), id, role, task, source };
      ctx.bus.emit('team.event', ev);
      return ngay({ team: true, kind: ev.kind, id });
    },
  },
];
