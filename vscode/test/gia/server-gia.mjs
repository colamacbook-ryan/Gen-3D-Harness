// Server giả: `tcp <cổng>` (giống bridge) hoặc `http <cổng> [tiêu đề]` (giống vite).
import * as net from 'node:net';
import * as http from 'node:http';
const [kieu, cong, tieuDe = 'Gen-Stage · Sân khấu 3D điều khiển bằng lệnh'] = process.argv.slice(2);
const sv =
  kieu === 'http'
    ? http.createServer((_q, r) => {
        r.writeHead(200, { 'content-type': 'text/html' });
        r.end(`<!doctype html><html><head><title>${tieuDe}</title></head><body></body></html>`);
      })
    : net.createServer((s) => s.end());
sv.listen(Number(cong), '127.0.0.1', () => console.log(`nghe ${kieu} ${cong} pid ${process.pid}`));
