// Test hàm thuần của extension (không cần VS Code). Chạy: pnpm -C vscode test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ch = require('../out/thuan/cau-hinh.js');
const html = require('../out/thuan/html.js');
const lg = require('../out/thuan/chatroom-logic.js');
const { SoChatroom } = require('../out/thuan/so-chatroom.js');

const DS = [
  { id: 'owner', name: 'Javis', controlledBy: 'owner' },
  { id: 'gen', name: 'Gen', controlledBy: 'agent' },
  { id: 'lan', name: 'Lan', controlledBy: 'agent' },
];

test('urlSanKhau: mặc định gọn, cổng khác thì thêm tham số app đã đọc sẵn', () => {
  const md = { devPort: 5173, bridgePort: 8787, ttsPort: 8788 };
  assert.equal(ch.urlSanKhau(md), 'http://127.0.0.1:5173/?bridge=1');
  assert.equal(
    ch.urlSanKhau({ devPort: 5180, bridgePort: 8797, ttsPort: 8798 }),
    'http://127.0.0.1:5180/?bridge=1&bridgePort=8797&ttsPort=8798',
  );
  assert.equal(ch.urlBridge({ bridgePort: 8787 }), 'ws://127.0.0.1:8787/');
  assert.ok(!ch.urlBridge({ bridgePort: 8787 }).includes('role='), 'không xưng role=nao');
});

test('chuanCong: cổng sai thì về mặc định', () => {
  assert.equal(ch.chuanCong(8797, 1), 8797);
  assert.equal(ch.chuanCong('8797', 1), 8797);
  for (const x of [0, -1, 70000, 1.5, 'abc', undefined, null]) assert.equal(ch.chuanCong(x, 5173), 5173);
});

test('CSP sân khấu: default none, frame-src ĐÚNG một origin, script chỉ bằng nonce', () => {
  const csp = html.taoCspSanKhau('http://127.0.0.1:5173', 'https://*.vscode-cdn.net', 'N0NCE');
  assert.equal(
    csp,
    "default-src 'none'; frame-src http://127.0.0.1:5173; style-src https://*.vscode-cdn.net 'nonce-N0NCE'; script-src 'nonce-N0NCE'",
  );
  assert.ok(!csp.includes('unsafe'));
  assert.ok(!csp.includes('connect-src'));
});

test('CSP chatroom: không có connect-src (ws ở host), không unsafe-inline', () => {
  const csp = html.taoCspChatroom('vscode-resource:', 'abc');
  assert.ok(csp.startsWith("default-src 'none'"));
  assert.ok(!csp.includes('connect-src') && !csp.includes('frame-src') && !csp.includes('unsafe'));
  assert.ok(csp.includes("script-src 'nonce-abc' vscode-resource:"));
});

test('taoHtmlSanKhau: CSP trong meta, mọi <script>/<style> mang nonce, iframe chưa có src', () => {
  const h = html.taoHtmlSanKhau({
    url: 'http://127.0.0.1:5173/?bridge=1&x="<>',
    origin: 'http://127.0.0.1:5173',
    cspSource: 'vscode-webview:',
    nonce: 'abc123',
  });
  assert.match(h, /http-equiv="Content-Security-Policy"/);
  assert.match(h, /frame-src http:\/\/127\.0\.0\.1:5173/);
  const scripts = h.match(/<script[^>]*>/g) ?? [];
  const styles = h.match(/<style[^>]*>/g) ?? [];
  assert.ok(scripts.length >= 1 && scripts.every((s) => s.includes('nonce="abc123"')));
  assert.ok(styles.every((s) => s.includes('nonce="abc123"')));
  assert.match(h, /<iframe[^>]*allow="autoplay[;"]/);
  assert.match(h, /<iframe[^>]*sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"/);
  assert.ok(!/allow-top-navigation|allow-popups|allow-modals/.test(h), 'iframe không được điều hướng vỏ / mở popup');
  assert.ok(!/<iframe[^>]* src=/.test(h), 'iframe chỉ nạp khi host dò thấy vite');
  assert.ok(h.includes('&quot;&lt;&gt;'), 'url được thoát');
  assert.ok(h.includes('Tải lại'));
});

test('taoHtmlChatroom: script module có nonce + nguồn từ asWebviewUri', () => {
  const h = html.taoHtmlChatroom({ cspSource: 'vscode-webview:', nonce: 'n1', scriptUri: 'https://x/c.js', cssUri: 'https://x/c.css' });
  assert.match(h, /<script nonce="n1" type="module" src="https:\/\/x\/c.js">/);
  assert.match(h, /<link rel="stylesheet" href="https:\/\/x\/c.css">/);
});

test('taoNonce: 128 bit CSPRNG, base64url 22 ký tự (hợp lệ cho CSP nonce)', () => {
  const n = html.taoNonce();
  assert.match(n, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(Buffer.from(n, 'base64url').length, 16);
  assert.notEqual(n, html.taoNonce());
});

test('vỏ panel: chỉ nhận tin host (window.parent hoặc cùng origin webview); iframe sân khấu/lồng/null bị bỏ', () => {
  const h = html.taoHtmlSanKhau({ url: 'http://127.0.0.1:5173/?bridge=1', origin: 'http://127.0.0.1:5173', cspSource: 'c', nonce: 'n' });
  const js = h.split('<script nonce="n">')[1].split('</script>')[0];
  // chạy script vỏ trong DOM giả tối thiểu
  const nghe = [];
  const guiXuong = [];
  const ngheKhung = {};
  const khung = {
    contentWindow: { postMessage: (m, o) => guiXuong.push([m, o]) },
    dataset: { url: 'u0' },
    src: '',
    addEventListener: (t, f) => (ngheKhung[t] = f),
  };
  const el = () => ({ textContent: '', classList: { toggle: () => undefined }, addEventListener: () => undefined });
  const phan = { 'san-khau': khung, 'trang-thai': el(), che: el(), 'tai-lai': el() };
  const win = { addEventListener: (_t, f) => nghe.push(f), parent: { ten: 'host' }, location: { origin: 'vscode-webview://abc' } };
  const doc = { getElementById: (id) => phan[id] };
  new Function('window', 'document', 'acquireVsCodeApi', js)(win, doc, () => ({ postMessage: () => undefined }));
  assert.equal(nghe.length, 1);
  nghe[0]({ source: khung.contentWindow, data: { lenh: 'napLai', url: 'http://evil/' } });
  assert.equal(khung.src, '', 'tin từ iframe không được đổi src');
  nghe[0]({ source: null, data: { lenh: 'napLai', url: 'http://evil/' } });
  nghe[0]({ source: { iframeLong: true }, data: { lenh: 'napLai', url: 'http://evil/' } });
  assert.equal(khung.src, '', 'tin từ nguồn khác window.parent (null, iframe lồng) bị bỏ');
  nghe[0]({ source: { khac: true }, origin: 'http://127.0.0.1:5173', data: { lenh: 'napLai', url: 'http://evil/' } });
  nghe[0]({ source: khung.contentWindow, origin: 'vscode-webview://abc', data: { lenh: 'napLai', url: 'http://evil/' } });
  assert.equal(khung.src, '', 'origin lạ, hoặc chính iframe sân khấu, đều bị bỏ');
  nghe[0]({ source: win.parent, data: { lenh: 'napLai', url: 'http://127.0.0.1:5173/?bridge=1' } });
  assert.equal(khung.src, 'http://127.0.0.1:5173/?bridge=1', 'tin từ host (window.parent) vẫn chạy');
  // VS Code thật 1.143 (E2E 26/10, B1): source không phải window.parent nhưng cùng origin webview → nhận
  nghe[0]({ source: { vsCodeHost: true }, origin: 'vscode-webview://abc', data: { lenh: 'napLai', url: 'http://127.0.0.1:5173/?b=2' } });
  assert.equal(khung.src, 'http://127.0.0.1:5173/?b=2', 'tin host VS Code thật (cùng origin webview) được nhận');
  // V1 (INT-06) — hienAn trước khi iframe nạp xong: chưa gửi; 'load' → gửi tin cuối đúng khoá + origin
  nghe[0]({ source: win.parent, data: { lenh: 'hienAn', visible: true, active: false } });
  assert.equal(guiXuong.length, 0, 'iframe chưa nạp xong thì chưa gửi');
  ngheKhung.load();
  assert.deepEqual(guiXuong.at(-1), [{ nguon: 'gen-stage-vscode', loai: 'nen', visible: true, active: false }, 'http://127.0.0.1:5173']);
  nghe[0]({ source: win.parent, data: { lenh: 'hienAn', visible: true, active: true } });
  assert.deepEqual(guiXuong.at(-1)[0], { nguon: 'gen-stage-vscode', loai: 'nen', visible: true, active: true });
  // tải lại: chờ load mới gửi lại tin cuối
  const truoc = guiXuong.length;
  nghe[0]({ source: win.parent, data: { lenh: 'napLai' } });
  nghe[0]({ source: win.parent, data: { lenh: 'hienAn', visible: false, active: false } });
  assert.equal(guiXuong.length, truoc);
  ngheKhung.load();
  assert.deepEqual(guiXuong.at(-1)[0], { nguon: 'gen-stage-vscode', loai: 'nen', visible: false, active: false });
});

test('SoChatroom.moHinhNeuDoi: chỉ trả khi mô hình đổi; quenDaVe thì gửi lại', () => {
  const so = new SoChatroom(null);
  assert.ok(so.moHinhNeuDoi());
  assert.equal(so.moHinhNeuDoi(), null);
  so.datBridge(false); // không đổi gì
  assert.equal(so.moHinhNeuDoi(), null);
  so.datBridge(true);
  assert.equal(so.moHinhNeuDoi().bridgeNoi, true);
  so.quenDaVe();
  assert.ok(so.moHinhNeuDoi());
});

test('docGoiBridge: phân loại sự kiện / kết quả / pong / lạ', () => {
  assert.deepEqual(lg.docGoiBridge('{"event":"user.text","data":{"text":"a"}}'), { kieu: 'su-kien', event: 'user.text', data: { text: 'a' } });
  assert.deepEqual(lg.docGoiBridge('{"pong":1}'), { kieu: 'pong' });
  const kq = lg.docGoiBridge('{"id":"vscode-1","ok":false,"error":"x"}');
  assert.equal(kq.kieu, 'ket-qua');
  assert.equal(kq.id, 'vscode-1');
  assert.equal(kq.ok, false);
  assert.equal(kq.error, 'x');
  assert.equal(lg.docGoiBridge('khong json').kieu, 'la');
  assert.equal(lg.docGoiBridge('42').kieu, 'la');
});

test('rutNhanVat: lấy id/name/controlledBy từ stage.describe, name trống thì dùng id', () => {
  const ds = lg.rutNhanVat({ actors: [{ id: 'owner', name: 'Javis', controlledBy: 'owner', pos: [0, 0, 0] }, { id: 'gen', name: '' }, { name: 'thiếu id' }] });
  assert.deepEqual(ds, [
    { id: 'owner', name: 'Javis', controlledBy: 'owner' },
    { id: 'gen', name: 'gen', controlledBy: 'agent' },
  ]);
  assert.deepEqual(lg.rutNhanVat(null), []);
  assert.deepEqual(lg.rutNhanVat({ actors: 'x' }), []);
});

test('chonHopLe: giữ lựa chọn còn sống; mất thì về agent đầu tiên', () => {
  assert.equal(lg.chonHopLe(DS, 'lan'), 'lan');
  assert.equal(lg.chonHopLe(DS, 'owner'), 'owner');
  assert.equal(lg.chonHopLe(DS, 'da-bi-xoa'), 'gen');
  assert.equal(lg.chonHopLe(DS, null), 'gen');
  assert.equal(lg.chonHopLe([DS[0]], null), 'owner');
  assert.equal(lg.chonHopLe([], 'gen'), null);
});

test('taoLenhNoi: actor.say lên owner, to = nhân vật đang chọn, interrupt như ô chat', () => {
  assert.deepEqual(lg.taoLenhNoi(DS, 'lan', '  đi tới bàn  '), {
    ok: true,
    lenh: { cmd: 'actor.say', args: { actor: 'owner', text: 'đi tới bàn', to: 'lan', interrupt: true } },
  });
  // chưa chọn ai → agent đầu tiên (Gen)
  assert.equal(lg.taoLenhNoi(DS, null, 'chào').lenh.args.to, 'gen');
  assert.equal(lg.taoLenhNoi(DS, 'gen', '   ').ok, false);
  const khongOwner = lg.taoLenhNoi(DS.slice(1), 'gen', 'chào');
  assert.equal(khongOwner.ok, false);
  assert.match(khongOwner.loi, /owner/);
});

test('suKienThanhDong: team.record (INT-07 sổ quy trình) → một dòng hệ thống có số + người ký', () => {
  assert.deepEqual(lg.suKienThanhDong('team.record', { so: 7, loai: 'kiem-nhan', ky: 'Nhi', tomTat: 'ĐÃ KIỂM NHẬN: Thợ xây — Viết test' }, DS, 5), {
    t: 5,
    loai: 'he-thong',
    ai: '',
    text: '📋 #7 ĐÃ KIỂM NHẬN: Thợ xây — Viết test — ký: Nhi',
  });
  assert.equal(lg.suKienThanhDong('team.record', { tomTat: 'thiếu số' }, DS, 5), null);
});

test('suKienThanhDong: user.text/user.speech/sayStart/user.command', () => {
  assert.deepEqual(lg.suKienThanhDong('user.text', { actor: 'owner', text: 'chào', to: 'gen' }, DS, 5), { t: 5, loai: 'sep', ai: 'owner', text: 'chào', toi: 'gen' });
  assert.equal(lg.suKienThanhDong('user.speech', { actor: 'owner', text: 'chào' }, DS, 5).giong, true);
  assert.deepEqual(lg.suKienThanhDong('actor.sayStart', { actor: 'gen', text: 'Dạ' }, DS, 6), { t: 6, loai: 'nhan-vat', ai: 'gen', text: 'Dạ' });
  assert.equal(lg.suKienThanhDong('actor.sayStart', { actor: 'owner', text: 'chào' }, DS, 6), null, 'owner nói = câu của Sếp, không lặp');
  assert.match(lg.suKienThanhDong('user.command', { matched: true, cmd: 'actor.moveTo', actors: ['owner'] }, DS, 7).text, /actor\.moveTo → owner/);
  assert.equal(lg.suKienThanhDong('user.command', { matched: false }, DS, 7), null);
  assert.equal(lg.suKienThanhDong('actor.arrived', {}, DS, 7), null);
  assert.equal(lg.suKienThanhDong('user.text', { actor: 'owner' }, DS, 7), null);
});

test('themDong: user.text rồi user.speech cùng câu → MỘT dòng đánh dấu giọng', () => {
  let ds = [];
  ds = lg.themDong(ds, { t: 1000, loai: 'sep', ai: 'owner', text: 'Gen ơi', toi: 'gen' });
  ds = lg.themDong(ds, { t: 1200, loai: 'sep', ai: 'owner', text: 'Gen ơi', giong: true });
  assert.equal(ds.length, 1);
  assert.equal(ds[0].giong, true);
  assert.equal(ds[0].toi, 'gen');
  // gõ lại đúng câu đó sau cửa sổ gộp → dòng mới
  ds = lg.themDong(ds, { t: 9000, loai: 'sep', ai: 'owner', text: 'Gen ơi' });
  assert.equal(ds.length, 2);
  // hai lần gõ cùng câu (không có giọng) → không gộp
  ds = lg.themDong(ds, { t: 9100, loai: 'sep', ai: 'owner', text: 'Gen ơi' });
  assert.equal(ds.length, 3);
});

test('themDong: giữ tối đa N dòng cuối', () => {
  let ds = [];
  for (let i = 0; i < 10; i++) ds = lg.themDong(ds, { t: i, loai: 'nhan-vat', ai: 'gen', text: String(i) }, 4);
  assert.deepEqual(ds.map((d) => d.text), ['6', '7', '8', '9']);
});

test('SoChatroom: hello → describe → chọn → gửi; chọn bị xoá thì về Gen và lưu lại', () => {
  const luu = [];
  const so = new SoChatroom('lan', (id) => luu.push(id));
  so.datBridge(true);
  assert.equal(so.nhanSuKien('bridge.hello', { stageOnline: true }), true, 'hello → làm mới danh sách');
  assert.equal(so.sanKhauNoi, true);
  so.nhanDescribe({ actors: DS.slice(0, 2) }); // lan không còn
  assert.equal(so.dangChon, 'gen');
  assert.deepEqual(luu, ['gen']);
  assert.equal(so.chonNhanVat('khong-co'), false);
  assert.equal(so.chonNhanVat('owner'), true);
  assert.equal(so.taoLenh('đi tới bàn').lenh.args.to, 'owner');
  assert.equal(so.nhanSuKien('user.text', { actor: 'owner', text: 'đi tới bàn', to: 'owner' }, 1), false);
  assert.equal(so.nhanSuKien('actor.spawned', { actor: 'lan' }), true);
  const m = so.moHinh();
  assert.equal(m.dong.length, 1);
  assert.equal(m.canhBao, '');
  so.datPanel('an');
  assert.match(so.moHinh().canhBao, /ẩn/);
  so.nhanSuKien('bridge.stageOffline', {});
  assert.match(so.moHinh().canhBao, /chưa thấy sân khấu/);
  so.datBridge(false);
  assert.match(so.moHinh().canhBao, /Chưa nối được bridge/);
});

test('script vỏ panel là JS hợp lệ (bắt lỗi thoát chuỗi trong template)', () => {
  const h = html.taoHtmlSanKhau({ url: 'http://127.0.0.1:5173/?bridge=1', origin: 'http://127.0.0.1:5173', cspSource: 'c', nonce: 'n' });
  const js = h.split('<script nonce="n">')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(js));
});

test('V1 — SoChatroom: renderMode + não từ describe và sự kiện; mất bridge = chưa biết', () => {
  const so = new SoChatroom(null);
  so.datBridge(true);
  so.nhanSuKien('bridge.hello', { stageOnline: true });
  so.datPanel('hien');
  let m = so.moHinh();
  assert.equal(m.renderMode, null);
  assert.equal(m.naoNoi, null);
  assert.equal(m.trangThaiNao.chu, 'Não: ?');
  so.nhanDescribe({ actors: DS.slice(0, 2), renderMode: 'nen', brainConnected: false });
  m = so.moHinh();
  assert.equal(m.renderMode, 'nen');
  assert.deepEqual(m.trangThaiSanKhau, { chu: 'Sân khấu: chế độ nền (≤15 fps)', den: 'vang' });
  assert.deepEqual(m.trangThaiNao, { chu: 'Não: chưa nối (genStage.nao = tat)', den: 'vang' });
  so.nhanSuKien('stage.renderMode', { mode: 'full' });
  so.nhanSuKien('stage.renderMode', { mode: 'la' }); // giá trị lạ bị bỏ
  assert.deepEqual(so.moHinh().trangThaiSanKhau, { chu: 'Sân khấu: đã nối', den: 'xanh' });
  so.datNao('local', 'dang-chay');
  so.nhanSuKien('bridge.brain', { count: 1, connected: true });
  assert.deepEqual(so.moHinh().trangThaiNao, { chu: 'Não: đã nối · local', den: 'xanh' });
  so.nhanSuKien('bridge.brain', { count: 0, connected: false });
  assert.deepEqual(so.moHinh().trangThaiNao, { chu: 'Não: chưa nối · local', den: 'do' });
  so.datNao('agy', 'cua-ngoai');
  assert.match(so.moHinh().trangThaiNao.chu, /agy \(driver ngoài\)/);
  // tab ẩn thắng chế độ nền (CNS-003: ẩn = tạm dừng hẳn)
  so.nhanSuKien('stage.renderMode', { mode: 'nen' });
  so.datPanel('an');
  assert.match(so.moHinh().trangThaiSanKhau.chu, /đang ẩn/);
  so.nhanSuKien('bridge.stageOffline', {});
  assert.equal(so.moHinh().renderMode, null);
  so.datBridge(false);
  assert.equal(so.moHinh().naoNoi, null);
  assert.equal(so.moHinh().trangThaiSanKhau.den, 'do');
});

test('V1 — vỏ panel: nhớ tin nền cuối, gửi lại khi iframe nạp xong, đúng khoá + targetOrigin', () => {
  const h = html.taoHtmlSanKhau({ url: 'http://127.0.0.1:5173/?bridge=1', origin: 'http://127.0.0.1:5173', cspSource: 'c', nonce: 'n' });
  assert.match(h, /nguon: 'gen-stage-vscode', loai: 'nen'/);
  assert.match(h, /addEventListener\('load'/);
  assert.match(h, /postMessage\(\s*\{ nguon: 'gen-stage-vscode'[^)]*\}, ORIGIN\)/);
  assert.doesNotMatch(h, /TODO\(V1\)/);
  assert.match(html.taoHtmlChatroom({ cspSource: 'c', nonce: 'n', scriptUri: 's', cssUri: 'c' }), /id="chu-nao"/);
});
