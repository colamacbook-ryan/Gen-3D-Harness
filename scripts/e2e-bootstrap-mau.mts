/**
 * e2e-bootstrap-mau.mts — sinh `docs/e2e/bootstrap-mau.json`: kết quả `stage.bootstrap` dựng từ ĐÚNG
 * registry + dữ liệu cảnh (place/clip/biểu cảm/emote/màn hình mặc định của căn nhà D1), không cần WebGL.
 * Sân khấu GIẢ của `kiem-e2e-nao-local-that.mjs` trả bản này cho `stage.bootstrap`, để đo não local
 * với schema đã điền giá trị (boSungGiaTri) mà không chạy sân khấu thật ăn CPU của LLM.
 * Chạy: npx tsx scripts/e2e-bootstrap-mau.mts
 */
import { writeFileSync } from 'node:fs';
import { taoRegistry } from '../src/api/commands/index';
import { moTaLenh } from '../src/api/registry';
import { BIEU_CAM, CLIPS, EMOTES, PLACES } from '../src/stage/noi-dung';
import { MAC_DINH_MAN_HINH } from '../src/stage/man-hinh';

const world = {
  actorIds: () => ['owner', 'gen'],
  placeIds: () => PLACES.map((p) => p.id),
  propIds: () => [],
  screenIds: () => Object.keys(MAC_DINH_MAN_HINH),
  clips: () => [...CLIPS],
  expressions: () => [...BIEU_CAM],
  emotes: () => EMOTES.map((e) => (typeof e === 'string' ? e : (e as { id: string }).id)),
} as never;
const registry = taoRegistry();
const ra = { commands: registry.all().map((s) => moTaLenh(s, world)) };
writeFileSync(new URL('../docs/e2e/bootstrap-mau.json', import.meta.url), JSON.stringify(ra, null, 1) + '\n');
console.log(`bootstrap-mau: ${ra.commands.length} lệnh · places ${PLACES.length} · screens ${Object.keys(MAC_DINH_MAN_HINH).join(',')}`);
