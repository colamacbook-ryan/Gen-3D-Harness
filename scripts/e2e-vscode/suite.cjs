/**
 * suite.cjs — chạy BÊN TRONG extension host của VS Code thật (nạp bởi @vscode/test-electron,
 * xem scripts/kiem-vscode-that.mjs). Không mocha: một hàm `run()` tự ghi kết quả ra JSON.
 *
 * Kiểm: extension nạp + activate · lệnh genStage.* đăng ký · view chatroom (secondary sidebar)
 * mở được · genStage.moSanKhau tạo panel webview · extension tự bật bridge + vite (cổng E2E) ·
 * sân khấu trong webview nối bridge (stage.describe qua ws) · node/WebSocket của extension host ·
 * genStage.tatDichVu giải phóng cổng.
 */
const vscode = require('vscode');
const fs = require('node:fs');
const net = require('node:net');

const RA = process.env.E2E_VSC_RA;
const C = JSON.parse(process.env.E2E_VSC_CONG);
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const coNghe = (port) =>
  new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => (s.destroy(), res(true)));
    s.on('error', () => res(false));
    s.setTimeout(1000, () => (s.destroy(), res(false)));
  });

function hoiBridge(cmd, args = {}) {
  return new Promise((res) => {
    let w;
    try {
      w = new WebSocket(`ws://127.0.0.1:${C.bridge}/`);
    } catch (e) {
      return res({ ok: false, error: String(e) });
    }
    const t = setTimeout(() => (w.close(), res({ ok: false, error: 'hết hạn 8 s' })), 8000);
    w.onopen = () => w.send(JSON.stringify({ id: 'vsc-1', cmd, args }));
    w.onmessage = (m) => {
      const g = JSON.parse(String(m.data));
      if (g.id === 'vsc-1') {
        clearTimeout(t);
        w.close();
        res(g);
      }
    };
    w.onerror = () => (clearTimeout(t), res({ ok: false, error: 'ws lỗi' }));
  });
}

exports.run = async function run() {
  const kq = { buoc: [], loi: [] };
  const ghi = (ten, ok, chiTiet) => {
    kq.buoc.push({ ten, ok: !!ok, ...(chiTiet === undefined ? {} : { chiTiet }) });
  };
  try {
    kq.vscodeVersion = vscode.version;
    kq.extHost = { node: process.versions.node, electron: process.versions.electron, websocketToanCuc: typeof globalThis.WebSocket };
    ghi('extension host có WebSocket toàn cục (V0-5)', typeof globalThis.WebSocket === 'function', kq.extHost);
    ghi('workspace tin cậy', vscode.workspace.isTrusted);

    const ext = vscode.extensions.getExtension('gen-labs.gen-stage-vscode');
    ghi('extension được nạp (getExtension)', !!ext, ext && { id: ext.id, path: ext.extensionPath });
    const t0 = Date.now();
    await ext.activate();
    ghi('activate() không ném lỗi', ext.isActive, { ms: Date.now() - t0 });

    const lenh = (await vscode.commands.getCommands(true)).filter((c) => c.startsWith('genStage.'));
    kq.lenhGenStage = lenh;
    const can = ['genStage.moSanKhau', 'genStage.batDichVu', 'genStage.tatDichVu', 'genStage.xemLog', 'genStage.noi'];
    ghi('5 lệnh genStage.* đăng ký', can.every((c) => lenh.includes(c)), { thieu: can.filter((c) => !lenh.includes(c)) });

    // view chatroom ở secondary sidebar: container genStage → lệnh focus do VS Code sinh
    try {
      await vscode.commands.executeCommand('workbench.view.extension.genStage');
      await vscode.commands.executeCommand('genStage.chatroom.focus');
      ghi('mở được view chatroom (workbench.view.extension.genStage + genStage.chatroom.focus)', true);
    } catch (e) {
      ghi('mở được view chatroom', false, String(e));
    }

    kq.congTruoc = { bridge: await coNghe(C.bridge), vite: await coNghe(C.dev) };
    const tMo = Date.now();
    await vscode.commands.executeCommand('genStage.moSanKhau');
    await ngu(1500);
    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const tabSanKhau = tabs.find((t) => t.input instanceof vscode.TabInputWebview && /genStage\.sanKhau/.test(t.input.viewType));
    ghi('genStage.moSanKhau mở panel webview "Sân khấu"', !!tabSanKhau, { tabs: tabs.map((t) => t.label), viewColumn: tabSanKhau && tabSanKhau.group.viewColumn });

    // extension tự bật bridge + vite (tuBat, workspace tin cậy, genStage.root đặt sẵn)
    let lenCong = false;
    for (let i = 0; i < 180 && !lenCong; i++) {
      lenCong = (await coNghe(C.bridge)) && (await coNghe(C.dev));
      if (!lenCong) await ngu(500);
    }
    ghi('extension tự bật bridge + vite trên cổng cấu hình', lenCong, { ms: Date.now() - tMo, ...C });

    // sân khấu trong iframe của webview nối bridge → stage.describe có actor
    let dsc = null;
    for (let i = 0; i < 120 && !dsc; i++) {
      const r = await hoiBridge('stage.describe');
      if (r.ok && r.result && Array.isArray(r.result.actors) && r.result.actors.length) dsc = r.result;
      else {
        kq.describeCuoiLoi = r.error;
        await ngu(1000);
      }
    }
    ghi('sân khấu trong webview nối bridge (stage.describe có actor)', !!dsc, dsc && {
      ms: Date.now() - tMo,
      actors: dsc.actors.map((a) => a.id),
      renderMode: dsc.renderMode,
    });
    if (dsc) {
      const say = await hoiBridge('actor.say', { actor: 'gen', text: 'Chào từ VS Code thật' });
      ghi('lệnh actor.say qua bridge tới sân khấu trong webview', say.ok, say.ok ? { durationMs: say.result && say.result.durationMs } : say.error);
    }

    // gọi lại moSanKhau → reveal, không mở panel thứ hai
    await vscode.commands.executeCommand('genStage.moSanKhau');
    await ngu(800);
    const soPanel = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputWebview && /genStage\.sanKhau/.test(t.input.viewType)).length;
    ghi('gọi moSanKhau lần hai không mở panel thứ hai', soPanel === 1, { soPanel });

    await vscode.commands.executeCommand('genStage.xemLog');
    ghi('genStage.xemLog chạy không lỗi', true);

    await vscode.commands.executeCommand('genStage.tatDichVu');
    let tat = false;
    for (let i = 0; i < 40 && !tat; i++) {
      tat = !(await coNghe(C.bridge)) && !(await coNghe(C.dev));
      if (!tat) await ngu(500);
    }
    ghi('genStage.tatDichVu giải phóng cổng bridge + vite do VS Code bật (V0-8)', tat);
  } catch (e) {
    kq.loi.push(String((e && e.stack) || e));
  }
  fs.writeFileSync(RA, JSON.stringify(kq, null, 2));
};
