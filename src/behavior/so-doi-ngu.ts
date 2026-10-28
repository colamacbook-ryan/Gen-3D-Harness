/**
 * so-doi-ngu.ts — sổ nối máy đội ngũ (INT-07) ↔ lệnh `team.state` / `team.sign`
 * (Bàn duyệt, phương án 1). Cùng mẫu `so-nao.ts`: máy sống trong `main.ts`,
 * lệnh không được import `main.ts`, nên `main.ts` ghi máy vào đây và lệnh đọc ra.
 * Không có máy (test, chưa bật) → lệnh trả lỗi rõ ràng.
 */
import type { MayDoiNgu } from './doi-ngu';

let may: MayDoiNgu | null = null;

export function datMayDoiNgu(m: MayDoiNgu | null): void {
  may = m;
}

export function layMayDoiNgu(): MayDoiNgu | null {
  return may;
}
