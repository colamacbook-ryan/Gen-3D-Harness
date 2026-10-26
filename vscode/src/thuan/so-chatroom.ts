/**
 * so-chatroom.ts — SỔ trạng thái chatroom, sống ở extension host.
 *
 * WebviewView ẩn đi là bị huỷ document, nên mọi trạng thái (danh sách nhân vật,
 * người đang chọn, log) nằm ở đây; webview chỉ vẽ lại `moHinh()` mỗi lần nhận.
 * Không import `vscode` — lưu lựa chọn qua hàm `luuChon` do host truyền vào.
 */
import {
  canhBaoCho,
  chuNao,
  chuSanKhau,
  chonHopLe,
  rutNhanVat,
  SU_KIEN_LAM_MOI_DS,
  suKienThanhDong,
  taoLenhNoi,
  themDong,
  type DongChat,
  type CheDoNao,
  type CheDoVe,
  type LenhNoi,
  type MoHinhChatroom,
  type NhanVat,
  type TrangThaiDriverNao,
  type TrangThaiPanel,
} from './chatroom-logic';

export class SoChatroom {
  bridgeNoi = false;
  sanKhauNoi = false;
  panel: TrangThaiPanel = 'chua-mo';
  nhanVat: NhanVat[] = [];
  dong: DongChat[] = [];
  /** V1 (INT-06) — chế độ vẽ sân khấu. */
  renderMode: CheDoVe = null;
  /** V1 — có não nối bridge không (`brainConnected` / `bridge.brain`). */
  naoNoi: boolean | null = null;
  naoCheDo: CheDoNao = 'tat';
  naoDriver: TrangThaiDriverNao = 'tat';
  private chon: string | null;

  constructor(
    chonDaLuu: string | null,
    private luuChon: (id: string | null) => void = () => undefined,
    private dongToiDa = 200,
  ) {
    this.chon = chonDaLuu;
  }

  get dangChon(): string | null {
    return this.chon;
  }

  datBridge(noi: boolean): void {
    this.bridgeNoi = noi;
    if (!noi) {
      this.sanKhauNoi = false;
      this.renderMode = null;
      this.naoNoi = null;
    }
  }

  datNao(cheDo: CheDoNao, driver: TrangThaiDriverNao): void {
    this.naoCheDo = cheDo;
    this.naoDriver = driver;
  }

  datPanel(p: TrangThaiPanel): void {
    this.panel = p;
  }

  /** Nhận một sự kiện bridge. Trả `true` nếu nên gọi lại `stage.describe`. */
  nhanSuKien(event: string, data: Record<string, unknown>, t = Date.now()): boolean {
    if (event === 'bridge.hello') this.sanKhauNoi = data.stageOnline === true;
    if (event === 'bridge.stageOnline') this.sanKhauNoi = true;
    if (event === 'bridge.stageOffline') {
      this.sanKhauNoi = false;
      this.renderMode = null;
    }
    if (event === 'stage.renderMode' && (data.mode === 'full' || data.mode === 'nen')) this.renderMode = data.mode;
    if (event === 'bridge.brain' && typeof data.connected === 'boolean') this.naoNoi = data.connected;
    const d = suKienThanhDong(event, data, this.nhanVat, t);
    if (d) this.dong = themDong(this.dong, d, this.dongToiDa);
    return SU_KIEN_LAM_MOI_DS.has(event);
  }

  /** Kết quả `stage.describe` → danh sách nhân vật + kiểm lại người đang chọn. */
  nhanDescribe(ketQua: unknown): void {
    this.nhanVat = rutNhanVat(ketQua);
    const r = ketQua as { renderMode?: unknown; brainConnected?: unknown } | null;
    if (r?.renderMode === 'full' || r?.renderMode === 'nen') this.renderMode = r.renderMode;
    if (typeof r?.brainConnected === 'boolean') this.naoNoi = r.brainConnected;
    // describe trả lời được thì chắc chắn sân khấu đang nối
    this.sanKhauNoi = true;
    const hopLe = chonHopLe(this.nhanVat, this.chon);
    if (hopLe !== this.chon && hopLe !== null) {
      this.chon = hopLe;
      this.luuChon(hopLe);
    }
  }

  chonNhanVat(id: string): boolean {
    if (!this.nhanVat.some((a) => a.id === id)) return false;
    this.chon = id;
    this.luuChon(id);
    return true;
  }

  taoLenh(chu: string): { ok: true; lenh: LenhNoi } | { ok: false; loi: string } {
    return taoLenhNoi(this.nhanVat, this.chon, chu);
  }

  ghiHeThong(text: string, t = Date.now()): void {
    this.dong = themDong(this.dong, { t, loai: 'he-thong', ai: '', text }, this.dongToiDa);
  }

  private daVe: string | null = null;

  /**
   * Mô hình nếu khác lần đã trả gần nhất, không thì null — để host chỉ
   * `postMessage` khi trạng thái thật sự đổi. `quenDaVe()` khi webview dựng lại.
   */
  moHinhNeuDoi(soDong = 50): MoHinhChatroom | null {
    const mh = this.moHinh(soDong);
    const json = JSON.stringify(mh);
    if (json === this.daVe) return null;
    this.daVe = json;
    return mh;
  }

  quenDaVe(): void {
    this.daVe = null;
  }

  moHinh(soDong = 50): MoHinhChatroom {
    return {
      bridgeNoi: this.bridgeNoi,
      sanKhauNoi: this.sanKhauNoi,
      panel: this.panel,
      nhanVat: this.nhanVat,
      dangChon: chonHopLe(this.nhanVat, this.chon),
      dong: this.dong.slice(-soDong),
      canhBao: canhBaoCho(this),
      renderMode: this.renderMode,
      naoNoi: this.naoNoi,
      naoCheDo: this.naoCheDo,
      naoDriver: this.naoDriver,
      trangThaiSanKhau: chuSanKhau(this),
      trangThaiNao: chuNao(this),
    };
  }
}
