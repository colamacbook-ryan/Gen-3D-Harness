/**
 * san-khau.ts — tab "Sân khấu": WebviewPanel đặt cạnh code (ViewColumn.Beside),
 * vỏ HTML chứa iframe tới vite `http://127.0.0.1:<devPort>/?bridge=1`.
 *
 * Chỉ giữ MỘT panel: gọi lại lệnh thì `reveal()`. `retainContextWhenHidden`
 * bắt buộc (thiếu nó mỗi lần đổi tab là nạp lại WebGL + VRM = sai INT-01).
 */
import * as vscode from 'vscode';
import { originSanKhau, urlSanKhau, type CauHinh } from './thuan/cau-hinh';
import { taoHtmlSanKhau, taoNonce } from './thuan/html';
import type { TrangThaiPanel } from './thuan/chatroom-logic';
import type { QuanLyTienTrinh } from './thuan/tien-trinh';

interface TinTuVo {
  loai?: unknown;
}

export class SanKhauPanel {
  private panel: vscode.WebviewPanel | undefined;
  private dangDo = false;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly layCfg: () => CauHinh,
    private readonly tienTrinh: QuanLyTienTrinh,
    private readonly ghi: (dong: string) => void,
    private readonly khiDoiHienAn: (p: TrangThaiPanel) => void,
  ) {}

  mo(): void {
    if (this.panel) {
      this.panel.reveal(undefined, false);
      return;
    }
    const cfg = this.layCfg();
    const panel = vscode.window.createWebviewPanel(
      'genStage.sanKhau',
      'Sân khấu',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
        // cùng cổng hai đầu — cách d.ts khuyên; chạy local thì là ánh xạ đồng nhất
        portMapping: [{ webviewPort: cfg.devPort, extensionHostPort: cfg.devPort }],
      },
    );
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'icon.svg');
    panel.webview.html = taoHtmlSanKhau({
      url: urlSanKhau(cfg),
      origin: originSanKhau(cfg),
      cspSource: panel.webview.cspSource,
      nonce: taoNonce(),
    });

    panel.webview.onDidReceiveMessage(
      (m: TinTuVo) => {
        if (m?.loai === 'sanSang' || m?.loai === 'taiLai') void this.kiemVaNap();
      },
      undefined,
      this.ctx.subscriptions,
    );

    // INT-06 / CNS-003 — báo ẩn/hiện + có focus hay không.
    // Lưu ý: VS Code KHÔNG giao được tin cho webview đang ẩn (script bị tạm dừng),
    // nên tin "ẩn" thực tế chỉ tới khi hiện lại; tin hữu ích là `active` lúc vẫn hiện.
    panel.onDidChangeViewState(
      (e) => {
        const p = e.webviewPanel;
        this.khiDoiHienAn(p.visible ? 'hien' : 'an');
        void p.webview.postMessage({ lenh: 'hienAn', visible: p.visible, active: p.active });
        this.ghi(`[sân khấu] visible=${p.visible} active=${p.active}`);
      },
      undefined,
      this.ctx.subscriptions,
    );

    panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.khiDoiHienAn('chua-mo');
      },
      undefined,
      this.ctx.subscriptions,
    );
    this.khiDoiHienAn('hien');
  }

  /** Dò (và tự bật nếu được phép) rồi nạp iframe, hoặc nói rõ vì sao chưa nạp. */
  async kiemVaNap(): Promise<void> {
    const panel = this.panel;
    if (!panel || this.dangDo) return;
    this.dangDo = true;
    try {
      const cfg = this.layCfg();
      void panel.webview.postMessage({ lenh: 'trangThai', chu: 'Đang dò bridge + vite…', loi: false });
      const { tt, canhBao } = await this.tienTrinh.batNeuCan();
      if (tt.sanKhau === 'gen-stage') {
        void panel.webview.postMessage({ lenh: 'napLai', url: urlSanKhau(cfg) });
        if (!tt.bridge) {
          void panel.webview.postMessage({
            lenh: 'trangThai',
            chu: `Sân khấu chạy nhưng bridge ${cfg.bridgePort} chưa có — chatroom sẽ chưa nối được.`,
            loi: false,
          });
        }
        return;
      }
      const chu =
        tt.sanKhau === 'app-khac'
          ? `Cổng ${cfg.devPort} đang chạy một app KHÁC (không phải Gen-Stage).\nĐổi cài đặt genStage.devPort hoặc tắt app đó.`
          : `Vite chưa chạy ở http://127.0.0.1:${cfg.devPort}.\n\n` +
            'Cách bật:\n' +
            '  • Lệnh "Gen-Stage: Bật bridge + sân khấu" (cần genStage.tuBat + genStage.root), hoặc\n' +
            `  • Trong repo Gen-Stage: pnpm bridge  và  pnpm dev --host 127.0.0.1 --port ${cfg.devPort}\n\n` +
            (canhBao.length ? 'Ghi chú:\n  • ' + canhBao.join('\n  • ') + '\n\n' : '') +
            'Xong thì bấm "Tải lại". Nhật ký: lệnh "Gen-Stage: Xem nhật ký".';
      void panel.webview.postMessage({ lenh: 'trangThai', chu, loi: true });
    } finally {
      this.dangDo = false;
    }
  }

  dong(): void {
    this.panel?.dispose();
  }
}
