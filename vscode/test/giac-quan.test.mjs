// V3 — giác quan IDE (hàm thuần + máy GiacQuan với đồng hồ giả). Chạy: pnpm -C vscode test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gq = require('../out/thuan/giac-quan.js');
const { SoChatroom } = require('../out/thuan/so-chatroom.js');

/** Hẹn giờ giả: `chay(ms)` tiến đồng hồ và chạy mọi hẹn đã tới hạn. */
function dongHoGia() {
  let t = 0;
  let id = 0;
  const hen = new Map();
  return {
    hen: (f, ms) => {
      hen.set(++id, { f, den: t + ms });
      return id;
    },
    huy: (h) => hen.delete(h),
    chay(ms) {
      t += ms;
      for (const [k, v] of [...hen].sort((a, b) => a[1].den - b[1].den)) {
        if (v.den <= t) {
          hen.delete(k);
          v.f();
        }
      }
    },
    dangCho: () => hen.size,
  };
}

function dung({ cfg = {}, tinCay = true, guiOk = true } = {}) {
  const dh = dongHoGia();
  const gui = [];
  const hien = [];
  const log = [];
  const c = { ...gq.GIAC_QUAN_MAC_DINH, ...cfg };
  const tc = { v: tinCay };
  const may = new gq.GiacQuan({
    gui: async (tb) => {
      gui.push(tb);
      return guiOk ? { ok: true } : { ok: false, error: 'bridge chưa nối' };
    },
    layCfg: () => c,
    tinCay: () => tc.v,
    daGui: (tb) => hien.push(tb.summary),
    ghi: (d) => log.push(d),
    hen: dh.hen,
    huy: dh.huy,
  });
  return { may, dh, gui, hien, log, c, tc };
}
const nhip = () => new Promise((r) => setImmediate(r));

test('locDuong: chỉ đường tương đối trong workspace; bỏ tuyệt đối, .., .git/, node_modules/', () => {
  assert.equal(gq.locDuong('src/a.ts'), 'src/a.ts');
  assert.equal(gq.locDuong('src\\win\\b.ts'), 'src/win/b.ts');
  for (const x of [
    '/home/ryan/du-an/src/a.ts',
    'C:\\Users\\ryan\\a.ts',
    'c:/x.ts',
    '\\\\server\\share\\a.ts',
    'untitled:Untitled-1',
    '../ngoai.ts',
    'a/../../b.ts',
    '.git/COMMIT_EDITMSG',
    'pkg/node_modules/x/index.js',
    'node_modules/y.js',
    '',
    '   ',
    null,
    undefined,
    'a\nb.ts',
  ]) {
    assert.equal(gq.locDuong(x), null, String(x));
  }
  assert.equal(gq.locDuong('.github/workflows/ci.yml'), '.github/workflows/ci.yml');
});

test('lưu file: gộp 5 s thành MỘT notice "Lưu N file: …", chỉ tên tương đối, không trùng', async () => {
  const x = dung();
  x.may.luuFile('src/a.ts');
  x.dh.chay(1000);
  x.may.luuFile('src/b.ts');
  x.may.luuFile('src/a.ts');
  x.may.luuFile('/etc/passwd');
  x.may.luuFile('.git/index');
  x.may.luuFile(null); // ngoài workspace
  x.dh.chay(3999);
  assert.equal(x.gui.length, 0);
  x.dh.chay(1);
  await nhip();
  assert.equal(x.gui.length, 1);
  assert.deepEqual(x.gui[0], {
    kind: 'save',
    level: 'info',
    summary: 'Lưu 2 file: src/a.ts, src/b.ts',
    data: { count: 2, files: ['src/a.ts', 'src/b.ts'] },
  });
  assert.deepEqual(x.hien, ['Lưu 2 file: src/a.ts, src/b.ts']);
  // cửa sổ cố định từ lần lưu đầu: autosave liên tục không đẩy lùi mãi
  x.may.luuFile('c.ts');
  for (let i = 0; i < 5; i++) {
    x.dh.chay(1000);
    x.may.luuFile('c.ts');
  }
  await nhip();
  assert.equal(x.gui.length, 2);
});

test('lưu nhiều file: tối đa 5 tên + "(+N)", summary ≤ 200 ký tự, không có đường tuyệt đối', () => {
  const ten = Array.from({ length: 12 }, (_, i) => `thu-muc-rat-dai-${i}/`.repeat(4) + `file-${i}.ts`);
  const tb = gq.tomTatLuu(ten);
  assert.ok(tb.summary.length <= gq.TOI_DA_SUMMARY);
  assert.match(tb.summary, /^Lưu 12 file: /);
  assert.equal(tb.data.files.length, 5);
  assert.equal(tb.data.count, 12);
  assert.ok(!tb.summary.includes('/home'));
});

test('diagnostics: mốc đầu không gửi; 0→>0 = bad, >0→>0 không gửi, >0→0 = good; debounce 3 s, đếm một lần', async () => {
  const x = dung();
  let n = 2;
  let soLanDem = 0;
  const dem = () => (soLanDem++, n);
  x.may.doiLoi(dem); // lúc mở: đã có 2 lỗi → chỉ ghi mốc
  x.dh.chay(3000);
  await nhip();
  assert.equal(x.gui.length, 0);
  n = 0;
  for (let i = 0; i < 5; i++) {
    x.may.doiLoi(dem);
    x.dh.chay(500); // nhảy liên tục khi gõ → chưa tính
  }
  assert.equal(x.gui.length, 0);
  x.dh.chay(3000);
  await nhip();
  assert.deepEqual(x.gui.at(-1), { kind: 'diag', level: 'good', summary: 'Hết lỗi biên dịch', data: { errors: 0, before: 2 } });
  assert.equal(soLanDem, 2, 'chỉ đếm khi đã đứng yên');
  n = 3;
  x.may.doiLoi(dem);
  x.dh.chay(3000);
  await nhip();
  assert.deepEqual(x.gui.at(-1), { kind: 'diag', level: 'bad', summary: 'Có 3 lỗi biên dịch', data: { errors: 3 } });
  n = 5;
  x.may.doiLoi(dem);
  x.dh.chay(3000);
  await nhip();
  assert.equal(x.gui.length, 2, '3 → 5 lỗi: không gửi');
  // không có nội dung message nào trong notice
  assert.ok(x.gui.every((g) => Object.keys(g.data).every((k) => ['errors', 'before'].includes(k))));
});

test('task: exit 0 → good, ≠0 → bad, undefined → không gửi; nhóm test / tên "test" → kind test', async () => {
  const x = dung();
  x.may.ketThucTask('build', 0, 'build');
  x.may.ketThucTask('build', 2, 'build');
  x.may.ketThucTask('chạy test đơn vị', 1);
  x.may.ketThucTask('unit', 0, 'test');
  x.may.ketThucTask('watch', undefined);
  await nhip();
  assert.deepEqual(
    x.gui.map((g) => [g.kind, g.level, g.summary]),
    [
      ['task', 'good', 'Task "build" xong'],
      ['task', 'bad', 'Task "build" lỗi (mã 2)'],
      ['test', 'bad', 'Test "chạy test đơn vị" fail (mã 1)'],
      ['test', 'good', 'Test "unit" pass'],
    ],
  );
  assert.deepEqual(x.gui[1].data, { exitCode: 2, name: 'build' });
});

test('git: mốc đầu không gửi; commit mới (cha = HEAD cũ) → "Commit abc1234: dòng đầu"; checkout/reset → không', async () => {
  const x = dung();
  const commits = {
    bbbbbbb1111: { message: 'V3: giác quan IDE\n\nchi tiết dài', parents: ['aaaaaaa0000'] },
    ccccccc2222: { message: 'nhánh khác', parents: ['zzzz'] },
  };
  const lay = async (h) => commits[h];
  await x.may.doiHead('/repo', 'aaaaaaa0000', lay);
  assert.equal(x.gui.length, 0);
  await x.may.doiHead('/repo', 'aaaaaaa0000', lay); // trạng thái khác đổi, HEAD giữ nguyên
  await x.may.doiHead('/repo', 'bbbbbbb1111', lay);
  assert.deepEqual(x.gui, [{ kind: 'git', level: 'good', summary: 'Commit bbbbbbb: V3: giác quan IDE', data: { commit: 'bbbbbbb' } }]);
  await x.may.doiHead('/repo', 'ccccccc2222', lay); // checkout: cha không phải HEAD cũ
  assert.equal(x.gui.length, 1);
  assert.ok(!JSON.stringify(x.gui).includes('/repo'), 'khoá repo (đường tuyệt đối) không bao giờ gửi đi');
  // message dài → cắt 80
  const tb = gq.tomTatCommit('d'.repeat(40), 'x'.repeat(200));
  assert.equal(tb.summary, `Commit ddddddd: ${'x'.repeat(79)}…`);
  // đọc commit lỗi → không gửi, ghi log
  await x.may.doiHead('/repo', 'eeee', async () => {
    throw new Error('git chết');
  });
  assert.equal(x.gui.length, 1);
  assert.ok(x.log.some((l) => /git chết/.test(l)));
});

test('noiGit: theo dõi repo có sẵn + repo mở sau; exports lạ / git tắt → bỏ qua êm', async () => {
  const x = dung();
  const nghe = [];
  const repo = {
    rootUri: { fsPath: '/r' },
    state: { HEAD: { commit: 'a1' }, onDidChange: (cb) => (nghe.push(cb), { dispose() {} }) },
    getCommit: async (h) => ({ message: `msg ${h}`, parents: ['a1'] }),
  };
  let moSau;
  const api = { repositories: [repo], onDidOpenRepository: (cb) => ((moSau = cb), { dispose() {} }) };
  const huy = gq.noiGit({ enabled: true, getAPI: () => api }, x.may);
  assert.equal(huy.length, 2);
  repo.state.HEAD = { commit: 'b2' };
  nghe[0]();
  await nhip();
  await nhip();
  assert.equal(x.gui.at(-1)?.summary, 'Commit b2: msg b2');
  assert.equal(typeof moSau, 'function');
  for (const la of [undefined, null, {}, { getAPI: 1 }, { enabled: false, getAPI: () => api }]) {
    assert.deepEqual(gq.noiGit(la, x.may), []);
  }
  const log = [];
  assert.deepEqual(gq.noiGit({ getAPI: () => { throw new Error('chưa sẵn sàng'); } }, x.may, (d) => log.push(d)), []);
  assert.match(log[0], /chưa sẵn sàng/);
});

test('tắt setting: batTat=false không gửi gì; tắt riêng từng loại; task theo setting test', async () => {
  const x = dung({ cfg: { batTat: false } });
  x.may.luuFile('a.ts');
  x.dh.chay(5000);
  x.may.ketThucTask('build', 1);
  x.may.doiLoi(0);
  x.dh.chay(3000);
  x.may.doiLoi(4);
  x.dh.chay(3000);
  await nhip();
  assert.equal(x.gui.length, 0);

  const y = dung({ cfg: { save: false, test: false } });
  y.may.luuFile('a.ts');
  y.dh.chay(5000);
  y.may.ketThucTask('build', 1);
  y.may.ketThucTask('unit test', 1);
  await y.may.doiHead('/r', 'a', async () => ({}));
  await y.may.doiHead('/r', 'b', async () => ({ message: 'm', parents: ['a'] }));
  await nhip();
  assert.deepEqual(y.gui.map((g) => g.kind), ['git']);
  assert.equal(y.dh.dangCho(), 0, 'save tắt thì không hẹn gộp');

  // tắt giữa lúc đang gộp → không gửi mẻ đó
  const z = dung();
  z.may.luuFile('a.ts');
  z.c.save = false;
  z.dh.chay(5000);
  await nhip();
  assert.equal(z.gui.length, 0);

  assert.deepEqual(gq.chuanGiacQuan((k) => ({ batTat: 'có', save: false })[k]), { ...gq.GIAC_QUAN_MAC_DINH, save: false });
});

test('workspace chưa tin cậy → không gửi gì; tin cậy rồi thì gửi', async () => {
  const x = dung({ tinCay: false });
  x.may.luuFile('a.ts');
  x.dh.chay(5000);
  x.may.ketThucTask('build', 0);
  await x.may.doiHead('/r', 'a', async () => ({}));
  await x.may.doiHead('/r', 'b', async () => ({ message: 'm', parents: ['a'] }));
  await nhip();
  assert.equal(x.gui.length, 0);
  x.tc.v = true;
  x.may.ketThucTask('build', 0);
  await nhip();
  assert.equal(x.gui.length, 1);
});

test('gửi lỗi (bridge chưa nối) → ghi log, KHÔNG hiện dòng 👁', async () => {
  const x = dung({ guiOk: false });
  x.may.ketThucTask('build', 0);
  await nhip();
  assert.equal(x.gui.length, 1);
  assert.deepEqual(x.hien, []);
  assert.match(x.log[0], /bridge chưa nối/);
});

test('chatroom: ghiGiacQuan thêm dòng nhỏ "👁 …" loại giac-quan', () => {
  const so = new SoChatroom(null);
  so.ghiGiacQuan('Test "unit" pass', 1000);
  const d = so.moHinh().dong.at(-1);
  assert.deepEqual(d, { t: 1000, loai: 'giac-quan', ai: '', text: '👁 Test "unit" pass' });
});

test('dung(): huỷ hẹn gộp + debounce, không gửi sau khi tắt', async () => {
  const x = dung();
  x.may.luuFile('a.ts');
  x.may.doiLoi(1);
  x.may.dung();
  x.dh.chay(10_000);
  await nhip();
  assert.equal(x.gui.length, 0);
});
