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
import { chuanCong, chuanNao, chuanNguonTaiNghe, MAC_DINH, urlBridge, type CauHinh } from './thuan/cau-hinh';
import { CauNoi, chonNhaMayWs } from './thuan/cau-noi';
import { chuanGiacQuan, GiacQuan, noiGit } from './thuan/giac-quan';
import { DieuKhienGiong } from './thuan/giong';
import { SoChatroom } from './thuan/so-chatroom';
import { QuanLyTienTrinh } from './thuan/tien-trinh';

const KHOA_CHON = 'genStage.dangChon';
/** Root TỰ DÒ mà Sếp đã cho phép chạy tiến trình trong đó (theo workspace). */
const KHOA_ROOT_DUYET = 'genStage.rootDaDuyet';
const NUT_CHO_PHEP = 'Cho phép';

let tienTrinh: QuanLyTienTrinh | undefined;
let cauNoi: CauNoi | undefined;
let giong: DieuKhienGiong | undefined;
let giacQuan: GiacQuan | undefined;

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
/** Lỗi setting `genStage.taiNghe.nguon` lần đọc gần nhất (rỗng = không lỗi) — ghi log một lần mỗi lần đổi. */
let loiNguon = '';

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
    sttPort: chuanCong(c.get('sttPort'), MAC_DINH.sttPort),
    taiNgheNguon: (() => {
      const n = chuanNguonTaiNghe(c.get('taiNghe.nguon'));
      loiNguon = n.loi;
      return n.nguon;
    })(),
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
  const choPhepBat = async (boiCanh?: 'giong'): Promise<string | null> => {
    if (!vscode.workspace.isTrusted) {
      return 'Workspace chưa được tin cậy (Restricted Mode) — Gen-Stage không tự bật tiến trình. Tin cậy workspace, hoặc tự chạy `pnpm bridge` + `pnpm dev`.';
    }
    if (!rootTuDo) return null; // genStage.root do chính Sếp đặt (scope machine)
    if (ctx.workspaceState.get<string>(KHOA_ROOT_DUYET) === cfg.root) return null;
    const tuChoi = `Chưa được phép chạy tiến trình trong ${cfg.root} — chạy lệnh "Gen-Stage: Bật bridge + sân khấu" để được hỏi lại, hoặc đặt genStage.root.`;
    if (tuChoiPhien === cfg.root) return tuChoi;
    const chon = await vscode.window.showWarningMessage(
      boiCanh === 'giong'
        ? 'Gen-Stage muốn chạy tai-nghe (thu micro, để nghe giọng nói) và `pnpm bridge` + vite trong thư mục tự dò được.'
        : 'Gen-Stage muốn tự chạy `pnpm bridge` và vite trong thư mục tự dò được.',
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
  if (loiNguon) ghi(`[cấu hình] ${loiNguon}`);
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

  /**
   * V2 — giọng nói: tai-nghe (tiến trình ngắn ngoài webview, vì webview không có mic).
   * Cùng cổng an toàn `choPhepBat` với bridge/vite/não.
   */
  giong = new DieuKhienGiong({
    so,
    layCfg: () => cfg,
    choPhep: choPhepBat,
    ve: () => {
      chatroom?.ve();
      // phím bật/tắt khi chatroom đang đóng: câu chờ xác nhận / lỗi phải được thấy
      const p = so.giong.pha;
      if ((p === 'cho-xac-nhan' || p === 'loi') && chatroom && !chatroom.dangHien) chatroom.hienRa();
    },
    guiMuc: (rms) => chatroom?.guiMuc(rms),
    ghi,
  });

  chatroom = new ChatroomProvider(ctx.extensionUri, so, cauNoi, ghi, giong);

  /**
   * V3 — GIÁC QUAN IDE: lưu file / lỗi biên dịch 0⇄>0 / task-test xong / git commit
   * → `stage.notice` qua cùng ws client của chatroom. Chỉ gửi khi workspace tin cậy;
   * không bao giờ gửi nội dung file, đường dẫn tuyệt đối hay message diagnostics.
   */
  giacQuan = new GiacQuan({
    gui: (tb) => cauNoi!.goi('stage.notice', { ...tb }),
    layCfg: () => {
      const c = vscode.workspace.getConfiguration('genStage');
      return chuanGiacQuan((k) => c.get(`giacQuan.${k}`));
    },
    tinCay: () => vscode.workspace.isTrusted,
    daGui: (tb) => {
      so.ghiGiacQuan(tb.summary);
      chatroom?.ve();
    },
    ghi,
  });
  /** File thật nằm trong một workspace folder → đường tương đối; còn lại → null (bị bỏ). */
  const duongTuongDoi = (uri: vscode.Uri): string | null =>
    uri.scheme === 'file' && vscode.workspace.getWorkspaceFolder(uri) ? vscode.workspace.asRelativePath(uri, false) : null;
  const demLoi = (): number => {
    let n = 0;
    for (const [uri, ds] of vscode.languages.getDiagnostics()) {
      if (duongTuongDoi(uri) === null) continue;
      for (const d of ds) if (d.severity === vscode.DiagnosticSeverity.Error) n++;
    }
    return n;
  };
  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => giacQuan?.luuFile(duongTuongDoi(doc.uri))),
    vscode.languages.onDidChangeDiagnostics(() => giacQuan?.doiLoi(demLoi)),
    vscode.tasks.onDidEndTaskProcess((e) => giacQuan?.ketThucTask(e.execution.task.name, e.exitCode, e.execution.task.group?.id)),
    { dispose: () => giacQuan?.dung() },
  );
  giacQuan.doiLoi(demLoi); // mốc số lỗi lúc mở — không gửi
  // git: extension có sẵn `vscode.git` (API v1); không có / bị tắt thì bỏ qua êm
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt) {
    void Promise.resolve(gitExt.isActive ? gitExt.exports : gitExt.activate()).then(
      (exp) => {
        const huy = noiGit(exp, giacQuan!, ghi);
        ctx.subscriptions.push(...huy);
        ghi(`[giác quan] git: ${huy.length ? 'đang theo dõi commit' : 'API không dùng được — bỏ qua'}`);
      },
      (e: unknown) => ghi(`[giác quan] không bật được extension git: ${(e as Error)?.message ?? e}`),
    );
  } else {
    ghi('[giác quan] không có extension vscode.git — bỏ qua commit');
  }
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
    // đóng tab sân khấu giữa lúc thu → câu sẽ không tới đâu: huỷ
    if (p === 'chua-mo') void giong?.huy('đóng tab sân khấu');
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
    // V2 — "Gen-Stage: Nói (bật/tắt)": lần 1 thu có VAD, lần 2 dừng (không có keyup → không "giữ phím")
    vscode.commands.registerCommand('genStage.noi', () => giong?.batTat()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('genStage')) return;
      const cu = cfg;
      cfg = docCauHinh(ctx.extensionPath);
      tienTrinh?.datCauHinh(cfg);
      ghi('[cấu hình] đã đổi');
      if (loiNguon) ghi(`[cấu hình] ${loiNguon}`);
      // lần thu đang chạy mang tham số cũ (cổng, nguồn) → huỷ, lần sau dùng cấu hình mới
      if (cu.bridgePort !== cfg.bridgePort || cu.sttPort !== cfg.sttPort || cu.taiNgheNguon !== cfg.taiNgheNguon || cu.root !== cfg.root || cu.pnpm !== cfg.pnpm) {
        void giong?.huy('đổi cấu hình');
      }
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

export function deactivate(): Promise<void> {
  // tai-nghe: `huy` vào stdin, quá 2 s thì SIGKILL cả nhóm (ffmpeg giữ mic chết theo).
  // VS Code chờ Promise của deactivate một lúc ngắn; trần 2,5 s rồi ép SIGKILL —
  // không để mồ côi kể cả khi host tắt trước khi hẹn giờ trong tai-nghe.ts kịp chạy.
  const choTaiNghe = giong?.huy('extension tắt') ?? Promise.resolve();
  giacQuan?.dung();
  cauNoi?.tat();
  // CHỈ tắt cái mình bật; bridge/vite Sếp bật sẵn thì sống tiếp
  tienTrinh?.tatCuaMinh();
  return Promise.race([choTaiNghe, new Promise<void>((r) => setTimeout(r, 2500))]).then(() => giong?.epTat());
}
