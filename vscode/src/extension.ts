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
import { chuanCong, chuanNao, MAC_DINH, urlBridge, type CauHinh } from './thuan/cau-hinh';
import { CauNoi, chonNhaMayWs } from './thuan/cau-noi';
import { SoChatroom } from './thuan/so-chatroom';
import { QuanLyTienTrinh } from './thuan/tien-trinh';

const KHOA_CHON = 'genStage.dangChon';
/** Root TỰ DÒ mà Sếp đã cho phép chạy tiến trình trong đó (theo workspace). */
const KHOA_ROOT_DUYET = 'genStage.rootDaDuyet';
const NUT_CHO_PHEP = 'Cho phép';

let tienTrinh: QuanLyTienTrinh | undefined;
let cauNoi: CauNoi | undefined;

function laRepoGenStage(thuMuc: string): boolean {
  return fs.existsSync(path.join(thuMuc, 'bridge', 'server.ts'));
}

/**
 * genStage.root (scope machine — chỉ Sếp đặt được) → workspace folder có
 * bridge/server.ts → thư mục cha của extension (chạy F5 từ repo).
 * `tuDo = true` khi root KHÔNG do Sếp đặt: phải hỏi xác nhận trước khi chạy gì trong đó.
 */
function timRoot(cauHinhRoot: string, extensionPath: string): { root: string; tuDo: boolean } {
  if (cauHinhRoot) return { root: path.resolve(cauHinhRoot), tuDo: false };
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    if (laRepoGenStage(f.uri.fsPath)) return { root: f.uri.fsPath, tuDo: true };
  }
  const cha = path.resolve(extensionPath, '..');
  return { root: laRepoGenStage(cha) ? cha : '', tuDo: true };
}

let rootTuDo = true;

function docCauHinh(extensionPath: string): CauHinh {
  const c = vscode.workspace.getConfiguration('genStage');
  const r = timRoot(String(c.get<string>('root') ?? '').trim(), extensionPath);
  rootTuDo = r.tuDo;
  return {
    root: r.root,
    bridgePort: chuanCong(c.get('bridgePort'), MAC_DINH.bridgePort),
    ttsPort: chuanCong(c.get('ttsPort'), MAC_DINH.ttsPort),
    devPort: chuanCong(c.get('devPort'), MAC_DINH.devPort),
    tuBat: c.get<boolean>('tuBat') ?? MAC_DINH.tuBat,
    pnpm: String(c.get<string>('pnpm') ?? MAC_DINH.pnpm).trim() || MAC_DINH.pnpm,
    nao: chuanNao(c.get('nao') ?? MAC_DINH.nao),
  };
}

export function activate(ctx: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel('Gen-Stage');
  ctx.subscriptions.push(out);
  const ghi = (dong: string): void => out.appendLine(`${new Date().toLocaleTimeString('vi-VN', { hour12: false })} ${dong}`);

  let cfg = docCauHinh(ctx.extensionPath);
  // V0 — bằng chứng runtime cho nhận định "extension host có WebSocket toàn cục"
  ghi(
    `[khởi động] node ${process.versions.node} · WebSocket: ${chonNhaMayWs().nguon} · root: ${cfg.root || '(chưa thấy)'}` +
      `${rootTuDo ? ' (tự dò)' : ''} · workspace tin cậy: ${vscode.workspace.isTrusted ? 'có' : 'KHÔNG'}`,
  );

  // Root tự dò mà Sếp bấm "không" trong phiên này → không hỏi lại mỗi lần mở tab
  // (lệnh "Bật bridge + sân khấu" thì hỏi lại).
  let tuChoiPhien: string | null = null;
  const choPhepBat = async (): Promise<string | null> => {
    if (!vscode.workspace.isTrusted) {
      return 'Workspace chưa được tin cậy (Restricted Mode) — Gen-Stage không tự bật tiến trình. Tin cậy workspace, hoặc tự chạy `pnpm bridge` + `pnpm dev`.';
    }
    if (!rootTuDo) return null; // genStage.root do chính Sếp đặt (scope machine)
    if (ctx.workspaceState.get<string>(KHOA_ROOT_DUYET) === cfg.root) return null;
    const tuChoi = `Chưa được phép chạy tiến trình trong ${cfg.root} — chạy lệnh "Gen-Stage: Bật bridge + sân khấu" để được hỏi lại, hoặc đặt genStage.root.`;
    if (tuChoiPhien === cfg.root) return tuChoi;
    const chon = await vscode.window.showWarningMessage(
      'Gen-Stage muốn tự chạy `pnpm bridge` và vite trong thư mục tự dò được.',
      {
        modal: true,
        detail: `${cfg.root}\n\nChỉ cho phép nếu đây đúng là repo Gen-Stage Sếp tin. Lựa chọn được nhớ cho workspace này.`,
      },
      NUT_CHO_PHEP,
    );
    if (chon === NUT_CHO_PHEP) {
      await ctx.workspaceState.update(KHOA_ROOT_DUYET, cfg.root);
      ghi(`[tiến trình] Sếp cho phép chạy trong ${cfg.root}`);
      return null;
    }
    tuChoiPhien = cfg.root;
    return tuChoi;
  };

  // Sổ PID + log tiến trình con nằm trong globalStorage (dùng chung mọi cửa sổ,
  // để biết cửa sổ nào là chủ) — không ghi gì vào repo.
  tienTrinh = new QuanLyTienTrinh(cfg, ghi, {
    thuMuc: ctx.globalStorageUri.fsPath,
    choPhepBat,
    // driver não thoát bất cứ lúc nào → không để chatroom nói "đang chạy" cho driver đã chết
    khiNaoThoat: (kq) => {
      so.datNao(kq.cheDo, kq.trangThai);
      chatroom?.ve();
    },
  });
  ghi(`[khởi động] sổ tiến trình: ${tienTrinh.fileSo()}`);
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

  /**
   * V1 — đưa driver não về đúng `genStage.nao` (tắt/giữ/đổi/bật). Chỉ khi
   * setting khác `tat` mới có thể bật gì; `dongBoNao` tự hỏi `choPhepBat`
   * (workspace trust + root) như bridge/vite, và nhường driver ngoài.
   */
  const dongBoNao = async (): Promise<void> => {
    if (!tienTrinh) return;
    const kq = await tienTrinh.dongBoNao();
    so.datNao(kq.cheDo, kq.trangThai);
    chatroom?.ve();
    if (kq.trangThai === 'loi' && kq.cheDo !== 'tat') {
      void vscode.window.showWarningMessage(`Gen-Stage — không bật được driver não (${kq.cheDo}): ${kq.lyDo}`);
    }
  };
  so.datNao(cfg.nao, 'tat');

  const sanKhau = new SanKhauPanel(ctx, () => cfg, tienTrinh, ghi, (p) => {
    so.datPanel(p);
    chatroom?.ve();
  }, () => void dongBoNao());

  ctx.subscriptions.push(
    vscode.commands.registerCommand('genStage.moSanKhau', () => sanKhau.mo()),
    vscode.commands.registerCommand('genStage.batDichVu', async () => {
      tuChoiPhien = null;
      const kq = await tienTrinh!.batNeuCan();
      const chu = `Bridge ${cfg.bridgePort}: ${kq.tt.bridge ? 'đang chạy' : 'CHƯA chạy'} · Sân khấu ${cfg.devPort}: ${kq.tt.sanKhau}`;
      ghi(`[lệnh] ${chu}`);
      if (kq.tt.bridge && kq.tt.sanKhau === 'gen-stage') void vscode.window.showInformationMessage(`Gen-Stage — ${chu}`);
      else void vscode.window.showWarningMessage(`Gen-Stage — ${chu}. Xem "Gen-Stage: Xem nhật ký".`);
      void sanKhau.kiemVaNap();
      void dongBoNao();
    }),
    vscode.commands.registerCommand('genStage.tatDichVu', () => {
      const da = tienTrinh!.tatCuaMinh();
      so.datNao(cfg.nao, 'tat');
      chatroom?.ve();
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
      ghi('[cấu hình] đã đổi');
      if (cu.bridgePort !== cfg.bridgePort) cauNoi?.doiUrl(urlBridge(cfg));
      sanKhau.doiCauHinh(cu, cfg);
      // đổi chế độ não (hoặc cổng bridge mà driver nối tới) → tắt cái cũ của mình, bật cái mới
      if (cu.nao !== cfg.nao || cu.bridgePort !== cfg.bridgePort || cu.root !== cfg.root) {
        ghi(`[não] genStage.nao: ${cu.nao} → ${cfg.nao}`);
        void dongBoNao();
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      ghi('[khởi động] workspace vừa được tin cậy — được phép tự bật tiến trình');
      void sanKhau.kiemVaNap();
      void dongBoNao();
    }),
  );

  cauNoi.bat();
}

export function deactivate(): void {
  cauNoi?.tat();
  // CHỈ tắt cái mình bật; bridge/vite Sếp bật sẵn thì sống tiếp
  tienTrinh?.tatCuaMinh();
}
