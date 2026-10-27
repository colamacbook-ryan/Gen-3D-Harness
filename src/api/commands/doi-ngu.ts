/**
 * INT-07 — `team.event`: báo sân khấu một mốc trong QUY TRÌNH làm việc của đội
 * agent (phiên mở/đóng, CEO giao việc, Giám đốc tự làm, subagent được giao /
 * xong / hỏng, xin CEO duyệt, báo cáo, dọn ngữ cảnh). Sân khấu chỉ bắn sự kiện
 * `team.event`; máy `src/behavior/doi-ngu.ts` ép thứ tự quy trình và diễn qua
 * dispatcher.
 *
 * Nguồn: hook Claude Code (`scripts/bao-doi-ngu.mjs`) và driver não local, qua
 * ws bridge. Não (MCP) KHÔNG được gọi — giả việc thật là nói dối với Sếp
 * (`LENH_CHI_CHO_BOSS` trong `bridge/mcp.ts`, cùng `stage.notice`).
 */
import type { CommandSpec } from '../types';
import { boKyTuLa } from './stage';
import { ngay } from './tien-ich';
import { LOAI_SU_KIEN, LOAI_VIEC } from '../../behavior/doi-ngu';

const TOI_DA_TASK = 120;

export const LENH_DOI_NGU: CommandSpec[] = [
  {
    cmd: 'team.event',
    group: 'stage',
    events: ['team.event'],
    desc:
      'INT-07 — ĐỘI NGŨ AGENT theo quy trình: session-start/brief (CEO giao việc)/work + work-result (Giám đốc tự làm)/' +
      'spawn/done/fail (subagent: chờ giao việc → làm → nộp bài → Giám đốc duyệt → về)/ask (xin CEO duyệt)/' +
      'report (báo cáo CEO, hoãn tới khi mọi nhân viên nộp bài)/compact/session-end. ' +
      'Chỉ dành cho ngoại vi (hook Claude Code, driver não local) qua ws bridge: MCP của não bị chặn lệnh này',
    params: [
      { name: 'kind', type: 'enum', desc: 'Mốc quy trình', values: LOAI_SU_KIEN, required: true },
      { name: 'id', type: 'string', desc: 'Mã sự kiện (vd tool_use_id) — done/fail phải trùng spawn', required: true },
      { name: 'role', type: 'string', desc: 'Vai (subagent_type), vd builder, reviewer, researcher' },
      { name: 'task', type: 'text', desc: `Mô tả việc ngắn (≤ ${TOI_DA_TASK} ký tự, dài hơn thì cắt)` },
      { name: 'source', type: 'string', desc: 'Nguồn: claude-code | nao-local | khac' },
      { name: 'tool', type: 'enum', desc: 'work/work-result: loại việc Giám đốc đang làm', values: LOAI_VIEC },
      { name: 'ok', type: 'boolean', desc: 'work-result: kết quả đạt hay lỗi' },
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
      const ev: Record<string, unknown> = { kind: String(a.kind), id, role, task, source };
      if (a.tool !== undefined) ev.tool = String(a.tool);
      if (a.ok !== undefined) ev.ok = a.ok === true;
      ctx.bus.emit('team.event', ev);
      return ngay({ team: true, kind: ev.kind, id });
    },
  },
];
