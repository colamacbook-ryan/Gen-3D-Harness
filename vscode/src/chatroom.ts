/**
 * chatroom.ts — WebviewView "Chatroom" ở cột PHẢI (Secondary Side Bar, STD-08 §0).
 *
 * Webview chỉ là mặt hiển thị: trạng thái nằm trong `SoChatroom` ở host, ws
 * nằm trong `CauNoi` ở host. View ẩn/hiện lại thì host gửi lại mô hình đầy đủ.
 */
import * as vscode from 'vscode';
import { taoHtmlChatroom, taoNonce } from './thuan/html';
import type { CauNoi } from './thuan/cau-noi';
import type { SoChatroom } from './thuan/so-chatroom';
import { xuLyTinChatroom, type TinTuChatroom } from './thuan/xu-ly-chatroom';
import type { DieuKhienGiong } from './thuan/giong';

/** Vạch mức âm: tối đa ~16 tin/giây xuống webview (tai-nghe có thể đẩy dày hơn). */
const NHIP_MUC_MS = 60;

export class ChatroomProvider implements vscode.WebviewViewProvider {
  static readonly ID = 'genStage.chatroom';
  private view: vscode.WebviewView | undefined;
  private lanMucCuoi = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly so: SoChatroom,
    private readonly cauNoi: CauNoi,
    private readonly ghi: (dong: string) => void,
    private readonly giong?: DieuKhienGiong,
  ) {}

  /** Chatroom đang mở và hiện trên màn hình. */
  get dangHien(): boolean {
    return this.view?.visible === true;
  }

  /** Mở/hiện chatroom (lệnh `<viewId>.focus` VS Code tự sinh cho mỗi view). */
  hienRa(): void {
    void vscode.commands.executeCommand(`${ChatroomProvider.ID}.focus`).then(undefined, (e: Error) =>
      this.ghi(`[chatroom] không mở được view: ${e.message}`),
    );
  }

  /** V2 — mức âm 0..1 lúc đang nghe: tin nhẹ riêng, không gửi lại cả mô hình. */
  guiMuc(rms: number): void {
    if (!this.view?.visible) return;
    const t = Date.now();
    if (t - this.lanMucCuoi < NHIP_MUC_MS) return;
    this.lanMucCuoi = t;
    void this.view.webview.postMessage({ lenh: 'muc', rms });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const outWeb = vscode.Uri.joinPath(this.extensionUri, 'out-web');
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [outWeb, media] };
    view.webview.html = taoHtmlChatroom({
      cspSource: view.webview.cspSource,
      nonce: taoNonce(),
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(outWeb, 'web', 'chatroom.js')).toString(),
      cssUri: view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'chatroom.css')).toString(),
    });
    view.webview.onDidReceiveMessage((m: TinTuChatroom) => void this.nhan(m));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.ve(true);
      // document bị huỷ khi ẩn → pointerup của nút giữ-để-nói không bao giờ tới
      else this.giong?.huyNeuGiu('chatroom bị ẩn giữa lúc giữ nút');
    });
    // document mới chưa có gì — lần vẽ đầu phải gửi đủ dù mô hình không đổi
    this.so.quenDaVe();
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
      void this.giong?.huy('đóng chatroom');
    });
  }

  /** Gửi mô hình xuống webview (nếu đang mở) — chỉ khi nó đổi, trừ khi `epBuoc`. */
  ve(epBuoc = false): void {
    if (!this.view) return;
    if (epBuoc) this.so.quenDaVe();
    const mh = this.so.moHinhNeuDoi();
    if (mh) void this.view.webview.postMessage({ lenh: 'moHinh', moHinh: mh });
  }

  private async nhan(m: TinTuChatroom): Promise<void> {
    // sanSang = document vừa nạp xong script: luôn gửi đủ
    if (await xuLyTinChatroom(m, this.so, this.cauNoi, this.ghi, this.giong)) this.ve(m?.loai === 'sanSang');
  }
}
