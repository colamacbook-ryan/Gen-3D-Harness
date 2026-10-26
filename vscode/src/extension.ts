/**
 * extension.ts — điểm vào extension "Gen-Stage for VS Code" (spike V0).
 *
 * Extension chỉ là MỘT mặt client của bridge (INT-04): không có bộ lệnh riêng,
 * không gọi thẳng vào sân khấu; mọi lệnh đi qua ws → bridge → dispatcher.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChatroomProvider } from './chatroom';
import { SanKhauPanel } from './san-khau';
import { chuanCong, MAC_DINH, urlBridge, type CauHinh } from './thuan/cau-hinh';
import { CauNoi, chonNhaMayWs } from './thuan/cau-noi';
import { SoChatroom } from './thuan/so-chatroom';
import { QuanLyTienTrinh } from './thuan/tien-trinh';

const KHOA_CHON = 'genStage.dangChon';

let tienTrinh: QuanLyTienTrinh | undefined;
let cauNoi: CauNoi | undefined;

function laRepoGenStage(thuMuc: string): boolean {
  return fs.existsSync(path.join(thuMuc, 'bridge', 'server.ts'));
}

/** genStage.root → workspace folder có bridge/server.ts → thư mục cha của extension (chạy F5 từ repo). */
function timRoot(cauHinhRoot: string, extensionPath: string): string {
  if (cauHinhRoot) return cauHinhRoot;
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (laRepoGenStage(f.uri.fsPath)) return f.uri.fsPath;
  }
  const cha = path.resolve(extensionPath, '..');
  return laRepoGenStage(cha) ? cha : '';
}

function docCauHinh(extensionPath: string): CauHinh {
  const c = vscode.workspace.getConfiguration('genStage');
  return {
    root: timRoot(String(c.get<string>('root') ?? '').trim(), extensionPath),
    bridgePort: chuanCong(c.get('bridgePort'), MAC_DINH.bridgePort),
    ttsPort: chuanCong(c.get('ttsPort'), MAC_DINH.ttsPort),
    devPort: chuanCong(c.get('devPort'), MAC_DINH.devPort),
    tuBat: c.get<boolean>('tuBat') ?? MAC_DINH.tuBat,
    pnpm: String(c.get<string>('pnpm') ?? MAC_DINH.pnpm).trim() || MAC_DINH.pnpm,
  };
}

export function activate(ctx: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel('Gen-Stage');
  ctx.subscriptions.push(out);
  const ghi = (dong: string): void => out.appendLine(`${new Date().toLocaleTimeString('vi-VN', { hour12: false })} ${dong}`);

  let cfg = docCauHinh(ctx.extensionPath);
  // V0 — bằng chứng runtime cho nhận định "extension host có WebSocket toàn cục"
  ghi(`[khởi động] node ${process.versions.node} · WebSocket: ${chonNhaMayWs().nguon} · root: ${cfg.root || '(chưa thấy)'}`);

  tienTrinh = new QuanLyTienTrinh(cfg, ghi);
  tienTrinh.nhanLai();

  const so = new SoChatroom(ctx.workspaceState.get<string>(KHOA_CHON) ?? null, (id) => {
    void ctx.workspaceState.update(KHOA_CHON, id ?? undefined);
  });

  let chatroom: ChatroomProvider | undefined;
  let henLamMoi: ReturnType<typeof setTimeout> | null = null;
  const lamMoiDanhSach = (): void => {
    if (henLamMoi) clearTimeout(henLamMoi);
    henLamMoi = setTimeout(() => {
      henLamMoi = null;
      void cauNoi?.goi('stage.describe').then((kq) => {
        if (kq.ok) so.nhanDescribe(kq.result);
        else ghi(`[chatroom] stage.describe lỗi: ${kq.error ?? ''}`);
        chatroom?.ve();
      });
    }, 150);
  };

  cauNoi = new CauNoi({
    url: urlBridge(cfg),
    ghi,
    khiTrangThai: (noi) => {
      so.datBridge(noi);
      chatroom?.ve();
    },
    khiSuKien: (event, data) => {
      if (so.nhanSuKien(event, data)) lamMoiDanhSach();
      chatroom?.ve();
    },
  });

  chatroom = new ChatroomProvider(ctx.extensionUri, so, cauNoi, ghi);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatroomProvider.ID, chatroom, {
      webviewOptions: { retainContextWhenHidden: false },
    }),
  );

  const sanKhau = new SanKhauPanel(ctx, () => cfg, tienTrinh, ghi, (p) => {
    so.datPanel(p);
    chatroom?.ve();
  });

  ctx.subscriptions.push(
    vscode.commands.registerCommand('genStage.moSanKhau', () => sanKhau.mo()),
    vscode.commands.registerCommand('genStage.batDichVu', async () => {
      const kq = await tienTrinh!.batNeuCan();
      const chu = `Bridge ${cfg.bridgePort}: ${kq.tt.bridge ? 'đang chạy' : 'CHƯA chạy'} · Sân khấu ${cfg.devPort}: ${kq.tt.sanKhau}`;
      ghi(`[lệnh] ${chu}`);
      if (kq.tt.bridge && kq.tt.sanKhau === 'gen-stage') void vscode.window.showInformationMessage(`Gen-Stage — ${chu}`);
      else void vscode.window.showWarningMessage(`Gen-Stage — ${chu}. Xem "Gen-Stage: Xem nhật ký".`);
      void sanKhau.kiemVaNap();
    }),
    vscode.commands.registerCommand('genStage.tatDichVu', () => {
      const da = tienTrinh!.tatCuaMinh();
      void vscode.window.showInformationMessage(
        da.length ? `Gen-Stage — đã tắt: ${da.join(', ')}` : 'Gen-Stage — không có dịch vụ nào do VS Code bật.',
      );
    }),
    vscode.commands.registerCommand('genStage.xemLog', () => out.show(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('genStage')) return;
      const cu = cfg;
      cfg = docCauHinh(ctx.extensionPath);
      tienTrinh?.datCauHinh(cfg);
      ghi('[cấu hình] đã đổi — cổng sân khấu mới áp dụng khi mở lại tab Sân khấu');
      if (cu.bridgePort !== cfg.bridgePort) cauNoi?.doiUrl(urlBridge(cfg));
    }),
  );

  cauNoi.bat();
}

export function deactivate(): void {
  cauNoi?.tat();
  // CHỈ tắt cái mình bật; bridge/vite Sếp bật sẵn thì sống tiếp
  tienTrinh?.tatCuaMinh();
}
