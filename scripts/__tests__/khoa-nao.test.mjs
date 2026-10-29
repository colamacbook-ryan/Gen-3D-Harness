/**
 * khoa-nao.test.mjs — khoá driver não dùng chung (nao-agy + nao-local).
 * Pid "sống" = chính tiến trình test (đọc /proc thật); pid "chết" = số không tồn tại.
 */
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { docStartTime, layKhoaNao } from '../khoa-nao.mjs';

const PID_CHET = 2_999_999;
let thu;
let duong;
beforeEach(() => {
  thu = mkdtempSync(join(tmpdir(), 'khoa-nao-'));
  duong = join(thu, 'nao-driver.lock');
});
afterEach(() => rmSync(thu, { recursive: true, force: true }));

describe('layKhoaNao', () => {
  it('docStartTime đọc được tiến trình sống, null với pid không tồn tại', () => {
    expect(docStartTime(process.pid)).toMatch(/^\d+$/);
    expect(docStartTime(PID_CHET)).toBeNull();
  });

  it('lần đầu lấy được, ghi JSON {pid, starttime, ten}', () => {
    const k = layKhoaNao({ ten: 'nao-agy', duong });
    expect(k.ok).toBe(true);
    expect(JSON.parse(readFileSync(duong, 'utf8'))).toEqual({ pid: process.pid, starttime: docStartTime(process.pid), ten: 'nao-agy' });
  });

  it('lần hai khi khoá của driver ĐANG SỐNG → không lấy được, báo đúng tên + pid', () => {
    expect(layKhoaNao({ ten: 'nao-agy', duong }).ok).toBe(true);
    const k2 = layKhoaNao({ ten: 'nao-local', duong, pid: PID_CHET + 1 });
    expect(k2.ok).toBe(false);
    expect(k2.giu).toEqual({ pid: process.pid, ten: 'nao-agy' });
  });

  it('khoá mồ côi (pid đã chết) → chiếm lại', () => {
    writeFileSync(duong, JSON.stringify({ pid: PID_CHET, starttime: '123', ten: 'nao-agy' }));
    const k = layKhoaNao({ ten: 'nao-local', duong });
    expect(k.ok).toBe(true);
    expect(JSON.parse(readFileSync(duong, 'utf8')).ten).toBe('nao-local');
  });

  it('pid được hệ điều hành cấp lại (starttime khác) → coi là mồ côi', () => {
    writeFileSync(duong, JSON.stringify({ pid: process.pid, starttime: '1', ten: 'nao-agy' }));
    expect(layKhoaNao({ ten: 'nao-local', duong }).ok).toBe(true);
  });

  it('file khoá hỏng (không phải JSON) → chiếm lại', () => {
    writeFileSync(duong, 'rác');
    expect(layKhoaNao({ ten: 'nao-local', duong }).ok).toBe(true);
  });

  it('huy() xoá khoá của mình, và KHÔNG xoá khoá đã thuộc tiến trình khác', () => {
    const k = layKhoaNao({ ten: 'nao-agy', duong });
    k.huy();
    expect(existsSync(duong)).toBe(false);
    const k2 = layKhoaNao({ ten: 'nao-agy', duong });
    writeFileSync(duong, JSON.stringify({ pid: PID_CHET, starttime: '9', ten: 'khac' }));
    k2.huy();
    expect(existsSync(duong)).toBe(true);
  });

  it('sau khi huy, driver khác lấy được ngay', () => {
    layKhoaNao({ ten: 'nao-agy', duong }).huy();
    expect(layKhoaNao({ ten: 'nao-local', duong }).ok).toBe(true);
  });
});
