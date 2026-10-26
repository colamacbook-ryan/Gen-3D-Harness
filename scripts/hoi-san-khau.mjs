#!/usr/bin/env node
// Hỏi bridge: "đã có sân khấu (tab trình duyệt / panel VS Code) nối chưa?"
// Nối ws vai client, đọc lời chào `bridge.hello` (data.stageOnline) rồi thoát.
// Dùng bởi scripts/chay.sh để KHÔNG mở thêm Firefox khi đã có sân khấu (CNS-002 e).
//
// Mã thoát: 0 = có sân khấu · 1 = chưa có · 2 = không hỏi được (không nối được / hết hạn)
// Cổng: GEN_STAGE_PORT (mặc định 8787). Token: env GEN_STAGE_TOKEN (không đi qua argv).
// Hạn: GEN_STAGE_HOI_HAN_MS (mặc định 3000).
import { WebSocket } from 'ws';

const cong = Number(process.env.GEN_STAGE_PORT ?? 8787);
const token = process.env.GEN_STAGE_TOKEN ?? '';
const han = Number(process.env.GEN_STAGE_HOI_HAN_MS ?? 3000);

const ws = new WebSocket(`ws://127.0.0.1:${cong}/?role=client`);
const hetHan = setTimeout(() => {
  console.error(`hoi-san-khau: hết ${han} ms chưa nhận bridge.hello`);
  process.exit(2);
}, han);

ws.on('open', () => {
  if (token) ws.send(JSON.stringify({ token }));
});
ws.on('message', (tho) => {
  let g;
  try { g = JSON.parse(String(tho)); } catch { return; }
  if (g?.event !== 'bridge.hello') return;
  clearTimeout(hetHan);
  const co = g.data?.stageOnline === true;
  console.log(co ? 'co-san-khau' : 'chua-co-san-khau');
  ws.close();
  process.exit(co ? 0 : 1);
});
ws.on('error', (e) => {
  console.error(`hoi-san-khau: ${e.message}`);
  process.exit(2);
});
