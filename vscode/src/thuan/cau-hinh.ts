/**
 * cau-hinh.ts — cấu hình của extension, dạng dữ liệu thuần (không import
 * `vscode`) để test được bằng `node:test` trên máy không có VS Code.
 */

export interface CauHinh {
  /** Thư mục gốc repo Gen-Stage (có `bridge/server.ts`). Rỗng = chưa tìm thấy. */
  root: string;
  bridgePort: number;
  ttsPort: number;
  devPort: number;
  /** Cổng chưa có ai nghe thì extension tự bật `pnpm bridge` / vite. */
  tuBat: boolean;
  /** Lệnh pnpm (PATH của extension host có thể không thấy nvm/corepack). */
  pnpm: string;
  /**
   * V1 — driver não extension tự bật: `local` = `pnpm nao-local` (Ollama),
   * `agy` = `pnpm nao` (agy CLI), `tat` = không bật gì. Scope machine.
   */
  nao: CheDoNao;
  /** V2 — cổng `POST /stt` của bridge (`tai-nghe --stt-port`). Scope machine. */
  sttPort: number;
  /** V2 — nguồn thu của tai-nghe (`--nguon`); rỗng = để tai-nghe tự dò. Scope machine. */
  taiNgheNguon: string;
}

export type CheDoNao = 'local' | 'agy' | 'tat';

/** Đọc setting `genStage.nao`; giá trị lạ = `tat` (không bao giờ đoán bật). */
export function chuanNao(x: unknown): CheDoNao {
  return x === 'local' || x === 'agy' ? x : 'tat';
}

export const MAC_DINH: Omit<CauHinh, 'root'> = {
  bridgePort: 8787,
  ttsPort: 8788,
  devPort: 5173,
  tuBat: true,
  pnpm: 'pnpm',
  nao: 'tat',
  sttPort: 8790,
  taiNgheNguon: '',
};

/**
 * V2 — `genStage.taiNghe.nguon` đi thẳng vào argv của tai-nghe (spawn không qua
 * shell nên không có chuyện chèn lệnh), nhưng giá trị bắt đầu bằng `-` sẽ bị
 * tai-nghe đọc thành một cờ khác, và ký tự điều khiển/xuống dòng không phải tên
 * thiết bị nào → bỏ (dùng tự dò), kèm lý do để ghi log.
 */
export function chuanNguonTaiNghe(x: unknown): { nguon: string; loi: string } {
  const s = typeof x === 'string' ? x.trim() : '';
  if (!s) return { nguon: '', loi: '' };
  if (s.startsWith('-') || /[\u0000-\u001f\u007f]/.test(s) || s.length > 200) {
    return { nguon: '', loi: `genStage.taiNghe.nguon "${s.slice(0, 40)}" không hợp lệ (bắt đầu bằng "-", có ký tự điều khiển hoặc quá 200 ký tự) — dùng tự dò` };
  }
  return { nguon: s, loi: '' };
}

/** Chỉ nói chuyện với máy này — bridge và vite đều bị ép nghe 127.0.0.1. */
export const MAY = '127.0.0.1';

/** Cổng hợp lệ hay không; sai thì lấy mặc định thay vì đi nối một cổng vô nghĩa. */
export function chuanCong(x: unknown, macDinh: number): number {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : macDinh;
}

/** Origin của app sân khấu (dùng cho CSP `frame-src` và `postMessage`). */
export function originSanKhau(c: Pick<CauHinh, 'devPort'>): string {
  return `http://${MAY}:${c.devPort}`;
}

/**
 * URL iframe: `?bridge=1` cộng tham số cổng **chỉ khi khác mặc định** — app đã
 * tự đọc `bridgePort`/`ttsPort` (`src/bridge-client.ts`), giữ URL gọn khi
 * không cần.
 */
export function urlSanKhau(
  c: Pick<CauHinh, 'devPort' | 'bridgePort' | 'ttsPort'> & Partial<Pick<CauHinh, 'sttPort'>>,
): string {
  const q = new URLSearchParams({ bridge: '1' });
  if (c.bridgePort !== MAC_DINH.bridgePort) q.set('bridgePort', String(c.bridgePort));
  if (c.ttsPort !== MAC_DINH.ttsPort) q.set('ttsPort', String(c.ttsPort));
  if (c.sttPort !== undefined && c.sttPort !== MAC_DINH.sttPort) q.set('sttPort', String(c.sttPort));
  return `${originSanKhau(c)}/?${q.toString()}`;
}

/** URL ws extension host dùng để nối bridge, vai client (KHÔNG xưng `role=nao`). */
export function urlBridge(c: Pick<CauHinh, 'bridgePort'>): string {
  return `ws://${MAY}:${c.bridgePort}/`;
}
