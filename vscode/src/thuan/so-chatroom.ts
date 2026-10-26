/**
 * so-chatroom.ts — SỔ trạng thái chatroom, sống ở extension host.
 *
 * WebviewView ẩn đi là bị huỷ document, nên mọi trạng thái (danh sách nhân vật,
 * người đang chọn, log) nằm ở đây; webview chỉ vẽ lại `moHinh()` mỗi lần nhận.
 * Không import `vscode` — lưu lựa chọn qua hàm `luuChon` do host truyền vào.
 */
import {
  canhBaoCho,
  chonHopLe,
  rutNhanVat,
  SU_KIEN_LAM_MOI_DS,
  suKienThanhDong,
  taoLenhNoi,
  themDong,
  type DongChat,
  type LenhNoi,
  type MoHinhChatroom,
  type NhanVat,
  type TrangThaiPanel,
} from './chatroom-logic';

export class SoChatroom {
  bridgeNoi = false;
  sanKhauNoi = false;
  panel: TrangThaiPanel = 'chua-mo';
  nhanVat: NhanVat[] = [];
  dong: DongChat[] = [];
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
    if (!noi) this.sanKhauNoi = false;
  }

  datPanel(p: TrangThaiPanel): void {
    this.panel = p;
  }

  /** Nhận một sự kiện bridge. Trả `true` nếu nên gọi lại `stage.describe`. */
  nhanSuKien(event: string, data: Record<string, unknown>, t = Date.now()): boolean {
    if (event === 'bridge.hello') this.sanKhauNoi = data.stageOnline === true;
    if (event === 'bridge.stageOnline') this.sanKhauNoi = true;
    if (event === 'bridge.stageOffline') this.sanKhauNoi = false;
    const d = suKienThanhDong(event, data, this.nhanVat, t);
    if (d) this.dong = themDong(this.dong, d, this.dongToiDa);
    return SU_KIEN_LAM_MOI_DS.has(event);
  }

  /** Kết quả `stage.describe` → danh sách nhân vật + kiểm lại người đang chọn. */
  nhanDescribe(ketQua: unknown): void {
    this.nhanVat = rutNhanVat(ketQua);
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

  moHinh(soDong = 50): MoHinhChatroom {
    return {
      bridgeNoi: this.bridgeNoi,
      sanKhauNoi: this.sanKhauNoi,
      panel: this.panel,
      nhanVat: this.nhanVat,
      dangChon: chonHopLe(this.nhanVat, this.chon),
      dong: this.dong.slice(-soDong),
      canhBao: canhBaoCho(this),
    };
  }
}
