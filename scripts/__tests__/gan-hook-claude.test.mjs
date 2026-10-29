/**
 * Gắn hook INT-07 vào ~/.claude/settings.json: chỉ thêm/gỡ đúng mục của mình,
 * không đụng hook khác, chạy lại không nhân đôi, file hỏng thì không ghi đè.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ganHook, lenhHook, MOC_HOOK } from '../gan-hook-claude.mjs';

const SCRIPT = fileURLToPath(new URL('../gan-hook-claude.mjs', import.meta.url));
const LENH = lenhHook('/home/r/Games 3d/Gen-3D-Harness');

describe('ganHook — thuần', () => {
  it('settings rỗng → đủ 8 mốc, tool event có matcher "*", đường dẫn có khoảng trắng được bọc ngoặc kép', () => {
    const s = ganHook({}, { lenh: LENH });
    expect(Object.keys(s.hooks).sort()).toEqual(Object.keys(MOC_HOOK).sort());
    expect(s.hooks.PreToolUse).toEqual([{ matcher: '*', hooks: [{ type: 'command', command: LENH }] }]);
    expect(s.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: LENH }] }]);
    expect(LENH).toBe('node "/home/r/Games 3d/Gen-3D-Harness/scripts/bao-doi-ngu.mjs"');
  });

  it('giữ nguyên setting + hook KHÁC của Sếp; chạy lại không nhân đôi', () => {
    const cu = {
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo khac' }] }] },
    };
    const lan1 = ganHook(cu, { lenh: LENH });
    const lan2 = ganHook(lan1, { lenh: LENH });
    expect(lan2).toEqual(lan1);
    expect(lan2.model).toBe('opus');
    expect(lan2.hooks.PreToolUse).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo khac' }] },
      { matcher: '*', hooks: [{ type: 'command', command: LENH }] },
    ]);
    expect(cu.hooks.PreToolUse).toHaveLength(1); // không sửa bản vào
  });

  it('đổi chỗ repo → lệnh cũ được thay, không còn hai bản', () => {
    const cu = ganHook({}, { lenh: lenhHook('/cu') });
    const moi = ganHook(cu, { lenh: LENH });
    expect(JSON.stringify(moi)).not.toContain('/cu/');
    expect(moi.hooks.SessionEnd).toHaveLength(1);
  });

  it('--go: gỡ đúng mục của mình, giữ hook khác; không còn gì thì bỏ hẳn khoá hooks', () => {
    const coKhac = ganHook({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo khac' }] }] } }, { lenh: LENH });
    const go = ganHook(coKhac, { go: true });
    expect(go.hooks).toEqual({ Stop: [{ hooks: [{ type: 'command', command: 'echo khac' }] }] });
    expect(ganHook(ganHook({}, { lenh: LENH }), { go: true })).toEqual({});
  });
});

describe('tiến trình thật', () => {
  it('sao lưu file cũ rồi gắn; file JSON hỏng → mã 2, KHÔNG ghi đè', () => {
    const d = mkdtempSync(join(tmpdir(), 'hook-'));
    const f = join(d, 'settings.json');
    writeFileSync(f, JSON.stringify({ theme: 'dark' }));
    const r = spawnSync(process.execPath, [SCRIPT, '--file', f], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const moi = JSON.parse(readFileSync(f, 'utf8'));
    expect(moi.theme).toBe('dark');
    expect(Object.keys(moi.hooks)).toHaveLength(8);
    expect(readdirSync(d).some((x) => x.startsWith('settings.json.bak-'))).toBe(true);

    writeFileSync(f, '{ hỏng');
    const r2 = spawnSync(process.execPath, [SCRIPT, '--file', f], { encoding: 'utf8' });
    expect(r2.status).toBe(2);
    expect(readFileSync(f, 'utf8')).toBe('{ hỏng');
  });
});
