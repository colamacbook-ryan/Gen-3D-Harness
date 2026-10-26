/**
 * do-cong.ts — dò xem bridge / vite đã chạy chưa (STD-10: dò trước, không giả định).
 *
 * Chỉ dùng `node:net` + `node:http`, không import `vscode` → test được bằng
 * server thật trong `node:test`.
 */
import * as net from 'node:net';
import * as http from 'node:http';

/** Có ai đang nghe TCP ở `host:cong` không (hạn `hanMs`). */
export function coNgheTcp(cong: number, host = '127.0.0.1', hanMs = 500): Promise<boolean> {
  return new Promise((xong) => {
    const s = net.connect({ port: cong, host });
    let daXong = false;
    const ket = (kq: boolean): void => {
      if (daXong) return;
      daXong = true;
      s.destroy();
      xong(kq);
    };
    s.setTimeout(hanMs, () => ket(false));
    s.once('connect', () => ket(true));
    s.once('error', () => ket(false));
  });
}

/** Trang có đúng là app Gen-Stage không (để khỏi nhận nhầm một app Vite khác). */
export function laTrangGenStage(html: string): boolean {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return !!m && /Gen-Stage/i.test(m[1] ?? '');
}

export type KetQuaDoSanKhau = 'gen-stage' | 'app-khac' | 'khong-co';

/** `GET http://host:cong/` → 200 + `<title>` chứa "Gen-Stage" mới tính là sân khấu. */
export function doSanKhau(cong: number, host = '127.0.0.1', hanMs = 1500): Promise<KetQuaDoSanKhau> {
  return new Promise((xong) => {
    const req = http.get({ host, port: cong, path: '/', timeout: hanMs }, (res) => {
      let than = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        if (than.length < 64 * 1024) than += c;
      });
      res.on('end', () => {
        xong(res.statusCode === 200 && laTrangGenStage(than) ? 'gen-stage' : 'app-khac');
      });
      res.on('error', () => xong('app-khac'));
    });
    req.on('timeout', () => {
      req.destroy();
      xong('khong-co');
    });
    req.on('error', () => xong('khong-co'));
  });
}

/** Đợi tới khi `kiem()` trả true, tối đa `hanMs`, thử mỗi `nhipMs`. */
export async function doiToi(
  kiem: () => Promise<boolean>,
  hanMs: number,
  nhipMs = 300,
): Promise<boolean> {
  const het = Date.now() + hanMs;
  for (;;) {
    if (await kiem()) return true;
    if (Date.now() >= het) return false;
    await new Promise((r) => setTimeout(r, nhipMs));
  }
}
