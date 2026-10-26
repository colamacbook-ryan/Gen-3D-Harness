/**
 * cau-noi.ts — MỘT kết nối ws client từ extension host tới bridge.
 *
 * - Vai client mặc định: KHÔNG xưng `?role=nao` (để `brainConnected` khỏi nói dối).
 * - `WebSocket` toàn cục của Node ≥ 22 nếu có; không có thì rơi về gói `ws`
 *   (MIT, đã có trong repo nền) — runtime-check, không giả định.
 * - Tự nối lại với backoff 1 s → 10 s, reset khi mở lại được (giống nao-agy #37).
 * - Nhịp tim ứng dụng `{ping}` mỗi 15 s; quá 35 s không thấy `pong` thì tự đóng
 *   để `close` chắc chắn bắn, khỏi treo ở OPEN giả.
 *
 * Không import `vscode` → test với một bridge giả bằng `ws` trong `node:test`.
 */
import { docGoiBridge } from './chatroom-logic';

/** Phần chung tối thiểu của WebSocket WHATWG và gói `ws`. */
export interface WsToiThieu {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

const MO = 1;

export type NhaMayWs = (url: string) => WsToiThieu;

/** Chọn bản WebSocket có sẵn. Trả cả tên nguồn để ghi log (bằng chứng V0). */
export function chonNhaMayWs(): { nguon: 'toan-cuc' | 'ws'; tao: NhaMayWs } {
  const g = globalThis as { WebSocket?: new (url: string) => WsToiThieu };
  if (typeof g.WebSocket === 'function') {
    const WS = g.WebSocket;
    return { nguon: 'toan-cuc', tao: (url) => new WS(url) };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WS = require('ws') as new (url: string) => WsToiThieu;
  return { nguon: 'ws', tao: (url) => new WS(url) };
}

export function tinhBackoff(lanThu: number, dauMs = 1000, toiDaMs = 10000): number {
  return Math.min(toiDaMs, dauMs * 2 ** Math.max(0, lanThu - 1));
}

export interface KetQuaLenh {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface TuyChonCauNoi {
  url: string;
  taoWs?: NhaMayWs;
  khiSuKien?: (event: string, data: Record<string, unknown>) => void;
  khiTrangThai?: (noi: boolean) => void;
  ghi?: (dong: string) => void;
  nhipTimMs?: number;
  quaHanTimMs?: number;
  hanLenhMs?: number;
}

export class CauNoi {
  private ws: WsToiThieu | null = null;
  private dung = true;
  private lanThu = 0;
  private henNoiLai: ReturnType<typeof setTimeout> | null = null;
  private henTim: ReturnType<typeof setInterval> | null = null;
  private lanPongCuoi = 0;
  private dem = 0;
  private dangCho = new Map<string, { xong: (k: KetQuaLenh) => void; hen: ReturnType<typeof setTimeout> }>();
  private readonly tao: NhaMayWs;

  constructor(private o: TuyChonCauNoi) {
    this.tao = o.taoWs ?? chonNhaMayWs().tao;
  }

  get noi(): boolean {
    return this.ws?.readyState === MO;
  }

  bat(): void {
    this.dung = false;
    if (!this.ws && !this.henNoiLai) this.moi();
  }

  tat(): void {
    this.dung = true;
    if (this.henNoiLai) clearTimeout(this.henNoiLai);
    this.henNoiLai = null;
    this.dungTim();
    const ws = this.ws;
    const dangNoi = ws?.readyState === MO;
    this.ws = null;
    try {
      ws?.close(1000, 'vscode-tat');
    } catch {
      /* đã đóng */
    }
    this.huyDangCho('Đã tắt kết nối bridge');
    if (dangNoi) this.o.khiTrangThai?.(false);
  }

  /** Đổi URL (đổi cổng trong cấu hình) rồi nối lại. */
  doiUrl(url: string): void {
    this.o.url = url;
    const dangBat = !this.dung;
    this.tat();
    if (dangBat) this.bat();
  }

  /** Gửi một lệnh có id; luôn resolve (lỗi trả `{ok:false,error}`), không ném. */
  goi(cmd: string, args: Record<string, unknown> = {}): Promise<KetQuaLenh> {
    const ws = this.ws;
    if (!ws || ws.readyState !== MO) {
      return Promise.resolve({ ok: false, error: 'Chưa nối bridge' });
    }
    const id = `vscode-${++this.dem}`;
    return new Promise((xong) => {
      const hen = setTimeout(() => {
        this.dangCho.delete(id);
        xong({ ok: false, error: `Bridge không trả lời trong ${this.o.hanLenhMs ?? 35000} ms` });
      }, this.o.hanLenhMs ?? 35000);
      this.dangCho.set(id, { xong, hen });
      try {
        ws.send(JSON.stringify({ id, cmd, args }));
      } catch (e) {
        clearTimeout(hen);
        this.dangCho.delete(id);
        xong({ ok: false, error: `Gửi thất bại: ${(e as Error).message}` });
      }
    });
  }

  private moi(): void {
    let ws: WsToiThieu;
    try {
      ws = this.tao(this.o.url);
    } catch (e) {
      this.o.ghi?.(`[cầu nối] không tạo được ws: ${(e as Error).message}`);
      this.henLai();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.lanThu = 0;
      this.lanPongCuoi = Date.now();
      this.o.ghi?.(`[cầu nối] đã nối ${this.o.url}`);
      this.batTim(ws);
      this.o.khiTrangThai?.(true);
    };
    ws.onmessage = (ev) => this.nhan(String(ev.data));
    ws.onerror = () => undefined; // `close` sẽ bắn ngay sau, xử lý ở đó
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.dungTim();
      this.huyDangCho('Mất kết nối bridge');
      this.o.khiTrangThai?.(false);
      if (!this.dung) {
        this.o.ghi?.(`[cầu nối] đóng (mã ${ev.code ?? '-'}${ev.reason ? ' · ' + ev.reason : ''})`);
        this.henLai();
      }
    };
  }

  private henLai(): void {
    if (this.dung) return;
    const cho = tinhBackoff(++this.lanThu);
    this.henNoiLai = setTimeout(() => {
      this.henNoiLai = null;
      if (!this.dung) this.moi();
    }, cho);
  }

  private batTim(ws: WsToiThieu): void {
    this.dungTim();
    const nhip = this.o.nhipTimMs ?? 15000;
    const quaHan = this.o.quaHanTimMs ?? 35000;
    this.henTim = setInterval(() => {
      if (Date.now() - this.lanPongCuoi > quaHan) {
        this.o.ghi?.('[cầu nối] quá hạn nhịp tim — đóng để nối lại');
        try {
          ws.close(4000, 'qua-han-nhip-tim');
        } catch {
          /* bỏ qua */
        }
        return;
      }
      try {
        ws.send(JSON.stringify({ ping: Date.now() }));
      } catch {
        /* close sẽ bắn */
      }
    }, nhip);
  }

  private dungTim(): void {
    if (this.henTim) clearInterval(this.henTim);
    this.henTim = null;
  }

  private huyDangCho(lyDo: string): void {
    for (const [, c] of this.dangCho) {
      clearTimeout(c.hen);
      c.xong({ ok: false, error: lyDo });
    }
    this.dangCho.clear();
  }

  private nhan(tho: string): void {
    const g = docGoiBridge(tho);
    if (g.kieu === 'pong') {
      this.lanPongCuoi = Date.now();
      return;
    }
    // gói bất kỳ cũng là dấu hiệu còn sống
    this.lanPongCuoi = Date.now();
    if (g.kieu === 'su-kien') {
      this.o.khiSuKien?.(g.event, g.data);
      return;
    }
    if (g.kieu === 'ket-qua' && g.id) {
      const c = this.dangCho.get(g.id);
      if (!c) return;
      this.dangCho.delete(g.id);
      clearTimeout(c.hen);
      c.xong(g.ok ? { ok: true, result: g.result } : { ok: false, error: g.error ?? 'Lỗi không rõ' });
    }
  }
}
