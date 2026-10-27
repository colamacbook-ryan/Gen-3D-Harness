// Chụp bộ VẬT CẢN văn phòng (đo lúc dựng bằng three) ra JSON cho test thuần đọc.
// Chạy lại mỗi khi sửa `src/stage/van-phong.ts`: cần `pnpm dev` (mặc định cổng 5173,
// đổi bằng GEN_STAGE_WEB_PORT). Ra `src/api/__tests__/vat-can-van-phong.json`.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const cong = process.env.GEN_STAGE_WEB_PORT ?? '5173';
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await br.newPage({ viewport: { width: 640, height: 480 } });
  await pg.goto(`http://127.0.0.1:${cong}/?bridge=0`);
  await pg.waitForFunction(() => window.stage?.san === true, null, { timeout: 240000 });
  const hop = await pg.evaluate(() =>
    window.stage.vatCan().map((h) => ({
      id: h.id,
      x0: +h.x0.toFixed(3),
      x1: +h.x1.toFixed(3),
      z0: +h.z0.toFixed(3),
      z1: +h.z1.toFixed(3),
    })),
  );
  const ra = new URL('../src/api/__tests__/vat-can-van-phong.json', import.meta.url);
  writeFileSync(ra, JSON.stringify({ ghiChu: 'Sinh bằng scripts/chup-vat-can.mjs — đừng sửa tay', hop }, null, 1) + '\n');
  console.log(`${hop.length} hộp → ${ra.pathname}`);
} finally {
  await br.close();
}
