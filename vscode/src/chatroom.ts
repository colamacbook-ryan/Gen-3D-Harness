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

export class ChatroomProvider implements vscode.WebviewViewProvider {
  static readonly ID = 'genStage.chatroom';
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly so: SoChatroom,
    private readonly cauNoi: CauNoi,
    private readonly ghi: (dong: string) => void,
  ) {}

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
    });
    // document mới chưa có gì — lần vẽ đầu phải gửi đủ dù mô hình không đổi
    this.so.quenDaVe();
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
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
    if (await xuLyTinChatroom(m, this.so, this.cauNoi, this.ghi)) this.ve(m?.loai === 'sanSang');
  }
}
