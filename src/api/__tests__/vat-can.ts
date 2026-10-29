/**
 * Bộ vật cản THẬT của văn phòng cho test thuần. Hộp chỉ đo được sau khi dựng
 * cảnh bằng three, nên được chụp ra `vat-can-van-phong.json` bằng
 * `scripts/chup-vat-can.mjs` — sửa `van-phong.ts` thì chạy lại script đó.
 */
import { readFileSync } from 'node:fs';
import type { HopChan } from '../../stage/bo-cuc';

export function vatCanVanPhong(): HopChan[] {
  const raw = readFileSync(new URL('./vat-can-van-phong.json', import.meta.url), 'utf8');
  return (JSON.parse(raw) as { hop: HopChan[] }).hop;
}
