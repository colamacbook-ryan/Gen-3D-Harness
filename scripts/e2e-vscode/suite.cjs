/**
 * suite.cjs — chạy BÊN TRONG extension host của VS Code thật (nạp bởi @vscode/test-electron,
 * xem scripts/kiem-vscode-that.mjs). Không mocha: một hàm `run()` tự ghi kết quả ra JSON.
 *
 * Kiểm: extension nạp + activate · lệnh genStage.* đăng ký · view chatroom (secondary sidebar)
 * mở được · genStage.moSanKhau tạo panel webview · extension tự bật bridge + vite (cổng E2E) ·
 * sân khấu trong webview nối bridge (stage.describe qua ws) · node/WebSocket của extension host ·
 * V3 giác quan IDE trên VS Code thật: lưu file · lỗi biên dịch 0⇄>0 · task test/build ·
 * git commit → `ide.event` tới bridge (nghe bằng một client ws) · genStage.tatDichVu giải phóng cổng.
 */
const vscode = require('vscode');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

/** Client ws chỉ để NGHE: gom mọi sự kiện bridge phát (ide.event, actor.emote…). */
function ngheBridge() {
  const thay = [];
  const w = new WebSocket(`ws://127.0.0.1:${C.bridge}/`);
  w.onmessage = (m) => {
    try {
      const g = JSON.parse(String(m.data));
      if (typeof g.event === 'string') thay.push({ t: Date.now(), event: g.event, data: g.data });
    } catch {
      /* bỏ */
    }
  };
  return { thay, dong: () => w.close() };
}

/** Lệnh VS Code có thể mở hộp thoại rồi chờ người bấm — không bao giờ chờ quá `ms`. */
const coHan = (p, ms, ten) => Promise.race([p, ngu(ms).then(() => { throw new Error(`${ten}: quá ${ms} ms`); })]);

async function choSuKien(nghe, dk, ms) {
  const han = Date.now() + ms;
  while (Date.now() < han) {
    const e = nghe.thay.find(dk);
    if (e) return e;
    await ngu(250);
  }
  return null;
}

/** V3 — bấm thật từng giác quan, chờ `ide.event` tương ứng tới bridge. */
async function kiemV3(ghi, kq) {
  const goc = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const thu = path.join(goc, '.cache', 'e2e-v3');
  fs.rmSync(thu, { recursive: true, force: true });
  fs.mkdirSync(thu, { recursive: true });
  const nghe = ngheBridge();
  await ngu(800);
  const ide = (kind, level) => (e) => e.event === 'ide.event' && e.data && e.data.kind === kind && (!level || e.data.level === level);
  const tom = (e) => e && { ms: e.t - kq._t, level: e.data.level, summary: e.data.summary, data: e.data.data };
  try {
    // 1. lưu file (gộp 5 s từ lần lưu đầu)
    const f = vscode.Uri.file(path.join(thu, 'luu.txt'));
    fs.writeFileSync(f.fsPath, 'a\n');
    const doc = await vscode.workspace.openTextDocument(f);
    const ed = await vscode.window.showTextDocument(doc);
    kq._t = Date.now();
    await ed.edit((e) => e.insert(new vscode.Position(1, 0), 'b\n'));
    await coHan(doc.save(), 10000, 'save');
    const eLuu = await choSuKien(nghe, ide('save'), 15000);
    ghi('V3 lưu file → ide.event save (gộp 5 s)', !!eLuu, tom(eLuu));

    // 2. lỗi biên dịch: file .ts sạch → thêm lỗi kiểu → sửa lại (debounce 3 s, chỉ khi 0⇄>0)
    const ts = vscode.Uri.file(path.join(thu, 'loi.ts'));
    fs.writeFileSync(ts.fsPath, 'export const so: number = 1;\n');
    const docTs = await vscode.workspace.openTextDocument(ts);
    const edTs = await vscode.window.showTextDocument(docTs);
    await ngu(8000); // TS server khởi động + mốc 0 lỗi
    kq._t = Date.now();
    await edTs.edit((e) => e.replace(new vscode.Range(0, 0, 1, 0), 'export const so: number = "chu";\n'));
    const eLoi = await choSuKien(nghe, ide('diag', 'bad'), 60000);
    ghi('V3 lỗi biên dịch 0 → >0 → ide.event diag bad', !!eLoi, tom(eLoi) || { soLoiVsCode: vscode.languages.getDiagnostics(ts).length });
    kq._t = Date.now();
    await edTs.edit((e) => e.replace(new vscode.Range(0, 0, 1, 0), 'export const so: number = 2;\n'));
    const eHet = await choSuKien(nghe, ide('diag', 'good'), 60000);
    ghi('V3 hết lỗi >0 → 0 → ide.event diag good', !!eHet, tom(eHet));
    await coHan(docTs.save(), 10000, 'save ts');

    // 3. task: tên có "test" + exit 3 → test bad; build exit 0 → task good
    const chayTask = async (ten, lenh) => {
      const t = new vscode.Task({ type: 'shell' }, vscode.TaskScope.Workspace, ten, 'e2e', new vscode.ShellExecution(lenh));
      kq._t = Date.now();
      await coHan(vscode.tasks.executeTask(t), 15000, 'executeTask');
    };
    await chayTask('test e2e', 'exit 3');
    const eTest = await choSuKien(nghe, ide('test'), 30000);
    ghi('V3 task "test e2e" exit 3 → ide.event test bad (mã thoát 3)', !!eTest && eTest.data.level === 'bad' && eTest.data.data && eTest.data.data.exitCode === 3, tom(eTest));
    await chayTask('build e2e', 'exit 0');
    const eTask = await choSuKien(nghe, ide('task'), 30000);
    ghi('V3 task "build e2e" exit 0 → ide.event task good', !!eTask && eTask.data.level === 'good', tom(eTask));

    // 4. git: repo tạm (KHÔNG đụng repo thật) mở bằng git.openRepository, commit bằng CLI
    const rg = path.join(thu, 'repo');
    fs.mkdirSync(rg);
    const g = (...a) => execFileSync('git', ['-C', rg, '-c', 'user.name=E2E', '-c', 'user.email=e2e@example.invalid', '-c', 'commit.gpgsign=false', ...a]);
    g('init', '-q');
    fs.writeFileSync(path.join(rg, 'a.txt'), '1\n');
    g('add', '.');
    g('commit', '-qm', 'mốc đầu');
    await coHan(vscode.commands.executeCommand('git.openRepository', rg), 15000, 'git.openRepository');
    await ngu(5000); // extension git ghi mốc HEAD
    fs.writeFileSync(path.join(rg, 'a.txt'), '2\n');
    g('commit', '-qam', 'thêm dòng hai');
    kq._t = Date.now();
    try {
      await coHan(vscode.commands.executeCommand('git.refresh'), 10000, 'git.refresh');
    } catch {
      /* không có thì thôi — watcher .git tự bắt */
    }
    const eGit = await choSuKien(nghe, ide('git'), 30000);
    ghi('V3 git commit (cha = HEAD cũ) → ide.event git good', !!eGit && eGit.data.level === 'good', tom(eGit));

    // sân khấu có phản ứng (phản xạ C0 — emote) sau các ide.event không
    kq.suKienSauV3 = nghe.thay.filter((e) => /^(actor\.(emote|say)|ide\.event)/.test(e.event)).map((e) => ({ event: e.event, actor: e.data && e.data.actor, emote: e.data && e.data.emote, kind: e.data && e.data.kind }));
  } finally {
    nghe.dong();
    delete kq._t;
  }
}

exports.run = async function run() {
  const kq = { buoc: [], loi: [] };
  const ghi = (ten, ok, chiTiet) => {
    kq.buoc.push({ ten, ok: !!ok, ...(chiTiet === undefined ? {} : { chiTiet }) });
    // ghi dở sau từng bước: treo giữa chừng vẫn biết đã tới đâu
    fs.writeFileSync(RA, JSON.stringify(kq, null, 2));
    console.log(`[e2e] ${ok ? 'OK  ' : 'FAIL'} ${ten}`);
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
      try {
        await kiemV3(ghi, kq);
      } catch (e) {
        ghi('V3 chạy hết các bước không ném lỗi', false, String(e));
      }
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
