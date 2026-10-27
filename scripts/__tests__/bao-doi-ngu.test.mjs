/**
 * INT-07 — hook Claude Code → `team.event`. Hai giao kèo:
 *  1. dịch đúng JSON hook (Pre → spawn, Post → done/fail, tool khác → bỏ qua),
 *     và KHÔNG mang prompt/kết quả của subagent lên sân khấu;
 *  2. tiến trình hook KHÔNG BAO GIỜ làm chậm/chặn Claude Code: thoát 0, stdout
 *     rỗng, kể cả khi bridge tắt.
 * Cổng bridge giả: 8996 (đổi gốc bằng GEN_STAGE_TEST_CONG_DOI_NGU).
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { suKienTuHook } from '../bao-doi-ngu.mjs';

const SCRIPT = fileURLToPath(new URL('../bao-doi-ngu.mjs', import.meta.url));
const CONG = Number(process.env.GEN_STAGE_TEST_CONG_DOI_NGU ?? 8996);

const pre = {
  session_id: 's1',
  hook_event_name: 'PreToolUse',
  tool_name: 'Task',
  tool_use_id: 'toolu_01XYZ',
  tool_input: { subagent_type: 'builder', description: 'Viết test A*', prompt: 'BÍ MẬT: nội dung prompt dài' },
};

function chayHook(payload, env = {}) {
  return new Promise((xong) => {
    const p = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    const t0 = Date.now();
    p.on('exit', (code) => xong({ code, out, ms: Date.now() - t0 }));
    p.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}

describe('suKienTuHook — dịch JSON hook', () => {
  it('PreToolUse Task → spawn với vai + mô tả, KHÔNG mang prompt', () => {
    const a = suKienTuHook(pre);
    expect(a).toEqual({ kind: 'spawn', id: 'toolu_01XYZ', role: 'builder', task: 'Viết test A*', source: 'claude-code' });
    expect(JSON.stringify(a)).not.toContain('BÍ MẬT');
  });

  it('tool tên mới `Agent` cũng nhận', () => {
    expect(suKienTuHook({ ...pre, tool_name: 'Agent' })?.kind).toBe('spawn');
  });

  it('PostToolUse → done; tool_response lỗi → fail; không mang kết quả', () => {
    const post = { ...pre, hook_event_name: 'PostToolUse', tool_response: { content: 'KẾT QUẢ RIÊNG' } };
    expect(suKienTuHook(post)).toEqual({ kind: 'done', id: 'toolu_01XYZ', source: 'claude-code' });
    expect(suKienTuHook({ ...post, tool_response: { is_error: true } })?.kind).toBe('fail');
  });

  it('tool khác (Bash, Edit…) → null, không làm phiền sân khấu', () => {
    expect(suKienTuHook({ ...pre, tool_name: 'Bash' })).toBeNull();
    expect(suKienTuHook(null)).toBeNull();
  });

  it('không có tool_use_id → Pre và Post vẫn ghép cặp bằng băm (phiên + mô tả + prompt)', () => {
    const { tool_use_id: _, ...khongId } = pre;
    const a = suKienTuHook(khongId);
    const b = suKienTuHook({ ...khongId, hook_event_name: 'PostToolUse' });
    expect(a.id).toMatch(/^h[0-9a-f]{16}$/);
    expect(b.id).toBe(a.id);
  });
});

describe('tiến trình hook thật', () => {
  it('bridge giả nhận đúng team.event; hook thoát 0, stdout rỗng', async () => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: CONG });
    const nhan = [];
    wss.on('connection', (ws) => {
      ws.on('message', (tho) => {
        const g = JSON.parse(String(tho));
        if (g.cmd) {
          nhan.push(g);
          ws.send(JSON.stringify({ id: g.id, ok: true, result: { data: {} } }));
        }
      });
    });
    try {
      const r = await chayHook(pre, { GEN_STAGE_PORT: String(CONG) });
      expect(r.code).toBe(0);
      expect(r.out).toBe('');
      expect(nhan).toHaveLength(1);
      expect(nhan[0]).toMatchObject({ cmd: 'team.event', args: { kind: 'spawn', role: 'builder' } });
    } finally {
      await new Promise((x) => wss.close(x));
    }
  });

  it('bridge TẮT → vẫn thoát 0 nhanh, stdout rỗng (không chặn Claude Code)', async () => {
    const r = await chayHook(pre, { GEN_STAGE_PORT: String(CONG + 1) });
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(3000);
  });

  it('stdin rác → thoát 0', async () => {
    const r = await chayHook('{không phải json', { GEN_STAGE_PORT: String(CONG + 1) });
    expect(r.code).toBe(0);
  });
});
