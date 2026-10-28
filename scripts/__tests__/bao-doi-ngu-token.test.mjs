/**
 * Bàn duyệt — token đội agent (28/10). Hook chỉ gửi CON SỐ:
 *  1. subagent: `totalTokens` từ kết quả tool (không có thì cộng `usage`);
 *  2. phiên chính (Stop): đọc PHẦN MỚI của transcript, khử trùng theo message.id
 *     (Claude Code ghi mỗi khối nội dung một dòng, cùng usage), bỏ sidechain,
 *     không đếm dòng ghi dở; lỗi ⇒ 0, không ném.
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suKienTuHook, tokenPhienMoi, tokenTuKetQua, tongUsage } from '../bao-doi-ngu.mjs';

const u = (i, o) => ({ input_tokens: i, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: o });
const tin = (id, usage, them = {}) => `${JSON.stringify({ type: 'assistant', message: { id, usage, content: [{ type: 'text', text: 'BÍ MẬT' }] }, ...them })}\n`;

describe('token đội agent', () => {
  it('tongUsage cộng 4 trường, thiếu/lạ coi là 0', () => {
    expect(tongUsage(u(1, 2))).toBe(113);
    expect(tongUsage({ output_tokens: 'x', input_tokens: -5 })).toBe(0);
    expect(tongUsage(null)).toBe(0);
  });

  it('subagent: totalTokens trước, usage sau; done mang tokens', () => {
    expect(tokenTuKetQua({ totalTokens: 1234.4, content: 'kết quả' })).toBe(1234);
    expect(tokenTuKetQua({ usage: u(5, 5) })).toBe(120);
    expect(tokenTuKetQua('chuỗi')).toBe(0);
    const ev = suKienTuHook({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Task', tool_use_id: 't1', tool_input: { description: 'x' }, tool_response: { totalTokens: 500, content: [{ type: 'text', text: 'BÍ MẬT' }] } });
    expect(ev).toMatchObject({ kind: 'done', tokens: 500 });
    expect(JSON.stringify(ev)).not.toContain('BÍ MẬT');
  });

  it('phiên chính: đọc nối tiếp, khử trùng message.id, bỏ sidechain, chờ dòng dở', () => {
    const d = mkdtempSync(join(tmpdir(), 'tok-'));
    const f = join(d, 'phien.jsonl');
    const tt = join(d, 'tt');
    writeFileSync(f, tin('m1', u(1, 1)) + tin('m1', u(1, 1)) + tin('m2', u(2, 2)) + tin('sc', u(9, 9), { isSidechain: true }) + '{"type":"user"}\n');
    expect(tokenPhienMoi(f, 'p', tt)).toBe(112 + 114);
    expect(tokenPhienMoi(f, 'p', tt)).toBe(0); // không đếm lại
    // dòng m2 lặp sang lượt sau (khối nội dung kế) + dòng ghi dở chưa xuống dòng
    appendFileSync(f, tin('m2', u(2, 2)) + tin('m3', u(3, 3)) + '{"type":"assistant","message":{"id":"m4","usa');
    expect(tokenPhienMoi(f, 'p', tt)).toBe(116);
    appendFileSync(f, 'ge":{"input_tokens":4,"output_tokens":4}}}\n');
    expect(tokenPhienMoi(f, 'p', tt)).toBe(8);
    // phiên khác: sổ riêng
    expect(tokenPhienMoi(f, 'khac', tt)).toBe(112 + 114 + 116 + 8);
  });

  it('đường lạ / không tồn tại / không phải jsonl ⇒ 0, không ném', () => {
    const tt = mkdtempSync(join(tmpdir(), 'tok-'));
    expect(tokenPhienMoi('/khong/co.jsonl', 'p', tt)).toBe(0);
    expect(tokenPhienMoi('/etc/passwd', 'p', tt)).toBe(0);
    expect(tokenPhienMoi(undefined, 'p', tt)).toBe(0);
    expect(tokenPhienMoi('/khong/co.jsonl', '', tt)).toBe(0);
  });
});
