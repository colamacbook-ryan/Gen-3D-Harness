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
};

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
export function urlSanKhau(c: Pick<CauHinh, 'devPort' | 'bridgePort' | 'ttsPort'>): string {
  const q = new URLSearchParams({ bridge: '1' });
  if (c.bridgePort !== MAC_DINH.bridgePort) q.set('bridgePort', String(c.bridgePort));
  if (c.ttsPort !== MAC_DINH.ttsPort) q.set('ttsPort', String(c.ttsPort));
  return `${originSanKhau(c)}/?${q.toString()}`;
}

/** URL ws extension host dùng để nối bridge, vai client (KHÔNG xưng `role=nao`). */
export function urlBridge(c: Pick<CauHinh, 'bridgePort'>): string {
  return `ws://${MAY}:${c.bridgePort}/`;
}
