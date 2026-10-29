/**
 * ket-noi.ts — trang Bàn duyệt nối bridge bằng VAI CLIENT (như chatroom VS Code,
 * MCP): gửi `{id, cmd, args}`, nhận `{id, ok, result|error}`, và nghe mọi sự
 * kiện sân khấu phát lại. Không phải sân khấu: KHÔNG bao giờ nối `?role=stage`
 * (sẽ đá tab sân khấu thật ra — CNS-002).
 *
 * Nối lại tự động backoff 1 → 10 s (cùng nhịp driver não #37). Token (bridge mở
 * ra ngoài máy) đọc từ `?bridgeToken=` và gửi ở khung đầu.
 */

export type TrangThaiNoi = 'dang-noi' | 'da-noi' | 'mat';

export interface KetNoiBridge {
  goi<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  /** Nghe sự kiện sân khấu (`*` = mọi sự kiện). Trả hàm gỡ. */
  nghe(ten: string, fn: (data: Record<string, unknown>, ten: string) => void): () => void;
  /** Bridge còn nối, và sân khấu có đang nối bridge không. */
  trangThai(): { noi: TrangThaiNoi; sanKhau: boolean };
  tat(): void;
}

const HAN_LENH_MS = 15000;

export function urlBridgeMacDinh(loc: Pick<Location, 'search' | 'protocol' | 'hostname'>): string {
  const q = new URLSearchParams(loc.search);
  const cong = q.get('bridgePort') ?? '8787';
  const may = loc.hostname === 'localhost' || !loc.hostname ? '127.0.0.1' : loc.hostname;
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${may}:${cong}/`;
}

export function noiBridge(url: string, token: string | null, khiDoi: () => void): KetNoiBridge {
  let ws: WebSocket | null = null;
  let noi: TrangThaiNoi = 'dang-noi';
  let sanKhau = false;
  let lan = 0;
  let tat = false;
  let henNoi = 0;
  let soId = 0;
  const cho = new Map<string, { giai: (v: unknown) => void; loi: (e: Error) => void; hen: number }>();
  const tai = new Map<string, Set<(d: Record<string, unknown>, ten: string) => void>>();

  const phat = (ten: string, data: Record<string, unknown>) => {
    for (const k of [ten, '*']) for (const fn of tai.get(k) ?? []) fn(data, ten);
  };

  const huyCho = (lyDo: string) => {
    for (const [id, c] of cho) {
      clearTimeout(c.hen);
      c.loi(new Error(lyDo));
      cho.delete(id);
    }
  };

  function moi(): void {
    if (tat) return;
    noi = 'dang-noi';
    khiDoi();
    const s = new WebSocket(url);
    ws = s;
    s.addEventListener('open', () => {
      if (token) s.send(JSON.stringify({ token }));
      lan = 0;
      noi = 'da-noi';
      khiDoi();
    });
    s.addEventListener('message', (ev) => {
      let g: { id?: unknown; ok?: unknown; result?: unknown; error?: unknown; event?: unknown; data?: unknown };
      try {
        g = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (typeof g.event === 'string') {
        const data = (g.data && typeof g.data === 'object' ? g.data : {}) as Record<string, unknown>;
        if (g.event === 'bridge.hello') sanKhau = data.stageOnline === true;
        if (g.event === 'bridge.stageOnline') sanKhau = true;
        if (g.event === 'bridge.stageOffline') sanKhau = false;
        if (g.event.startsWith('bridge.')) khiDoi();
        phat(g.event, data);
        return;
      }
      if (typeof g.id !== 'string') return;
      const c = cho.get(g.id);
      if (!c) return;
      cho.delete(g.id);
      clearTimeout(c.hen);
      if (g.ok === true) {
        // kết quả lệnh có thể được dispatcher gói thêm một lớp `data`
        const r = g.result as { data?: unknown } | undefined;
        c.giai(r && typeof r === 'object' && 'data' in r && r.data !== undefined ? r.data : r);
      } else c.loi(new Error(typeof g.error === 'string' ? g.error : 'Lệnh lỗi'));
    });
    s.addEventListener('close', () => {
      if (ws !== s) return;
      ws = null;
      noi = 'mat';
      sanKhau = false;
      huyCho('Mất kết nối bridge');
      khiDoi();
      if (tat) return;
      lan += 1;
      henNoi = window.setTimeout(moi, Math.min(10000, 1000 * 2 ** (lan - 1)));
    });
  }

  moi();

  return {
    goi(cmd, args = {}) {
      const s = ws;
      if (!s || s.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Chưa nối bridge'));
      const id = `bd-${++soId}`;
      return new Promise((giai, loi) => {
        const hen = window.setTimeout(() => {
          cho.delete(id);
          loi(new Error(`${cmd}: quá ${HAN_LENH_MS / 1000} s không trả lời`));
        }, HAN_LENH_MS);
        cho.set(id, { giai: giai as (v: unknown) => void, loi, hen });
        try {
          s.send(JSON.stringify({ id, cmd, args }));
        } catch (e) {
          clearTimeout(hen);
          cho.delete(id);
          loi(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    nghe(ten, fn) {
      if (!tai.has(ten)) tai.set(ten, new Set());
      tai.get(ten)!.add(fn);
      return () => tai.get(ten)?.delete(fn);
    },
    trangThai: () => ({ noi, sanKhau }),
    tat() {
      tat = true;
      clearTimeout(henNoi);
      ws?.close();
      huyCho('Đã tắt');
    },
  };
}
