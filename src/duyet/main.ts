/**
 * Bàn duyệt (phương án 1, Ryan 28/10) — trang web để CEO thật xem và KÝ công
 * việc của đội agent. Mở: `http://127.0.0.1:5173/duyet.html` (hoặc lệnh VS Code
 * "Gen-Stage: Mở Bàn duyệt"). Đặc tả: `docs/doi-ngu/BAN-DUYET.md`.
 *
 * Dữ liệu đi qua bridge như mọi đường khác: đọc `team.state`, ký `team.sign`.
 * Mọi chữ từ ngoài (việc, góp ý, tóm tắt) gắn bằng `textContent` — không HTML.
 */
import type { BanGhi, LoaiBanGhi, TrangThaiDoiNgu } from '../behavior/doi-ngu';
import { TEN_PHA, tenCuaVai } from '../behavior/doi-ngu';
import { daCho, gioNgan, hangCanQuyet, locSo, soDoHomNay, TEN_LOAI, TEN_PHA_NV, type ViecCanQuyet } from './hang-duyet';
import { noiBridge, urlBridgeMacDinh } from './ket-noi';

type Trang = 'hom-nay' | 'so' | 'doi-ngu';
const TEN_TRANG: Record<Trang, string> = { 'hom-nay': 'Hôm nay', so: 'Sổ quy trình', 'doi-ngu': 'Đội ngũ' };

/* ------------------------------------------------------------ DOM nhỏ */

type Con = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  thuoc: Record<string, string> = {},
  ...con: Con[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(thuoc)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of con) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}
const $ = (id: string) => document.getElementById(id)!;

let henToast = 0;
function toast(chu: string, loai: 'ok' | 'loi' = 'ok'): void {
  const t = $('toast');
  t.textContent = chu;
  t.className = `toast hien ${loai}`;
  clearTimeout(henToast);
  henToast = window.setTimeout(() => (t.className = 'toast'), 3200);
}

/* ------------------------------------------------------------ trạng thái */

const q = new URLSearchParams(location.search);
// khiDoi có thể chạy ngay trong noiBridge (trước khi `bridge` gán xong) — dời sang microtask
const bridge = noiBridge(urlBridgeMacDinh(location), q.get('bridgeToken'), () =>
  queueMicrotask(() => {
    veTrangThaiNoi();
    if (bridge.trangThai().noi === 'da-noi') void taiLai();
  }),
);
let tt: TrangThaiDoiNgu | null = null;
let loiTai = '';
let trang: Trang = 'hom-nay';
const dangKy = new Set<number>();
/** Góp ý đang gõ dở theo số báo cáo — vẽ lại không làm mất chữ. */
const gopYDo = new Map<number, string>();
let locLoai: LoaiBanGhi | '' = '';
let locChu = '';
let banGhiChon: number | null = null;
let tCapNhat = 0;

async function taiLai(): Promise<void> {
  try {
    tt = await bridge.goi<TrangThaiDoiNgu>('team.state', {});
    loiTai = '';
    tCapNhat = Date.now();
  } catch (e) {
    loiTai = e instanceof Error ? e.message : String(e);
  }
  ve();
}

let henTai = 0;
const taiLaiSau = () => {
  clearTimeout(henTai);
  henTai = window.setTimeout(() => void taiLai(), 250);
};
bridge.nghe('*', (_d, ten) => {
  if (ten.startsWith('team.') || ten === 'bridge.stageOnline' || ten === 'stage.ready') taiLaiSau();
});
window.setInterval(() => {
  if (bridge.trangThai().noi === 'da-noi') void taiLai();
  else ve();
}, 15000);

/* ------------------------------------------------------------ vẽ */

function veTrangThaiNoi(): void {
  const s = bridge.trangThai();
  const b = $('tt-bridge');
  b.className = `trang-thai ${s.noi === 'da-noi' ? 'ok' : s.noi === 'mat' ? 'loi' : 'cho'}`;
  b.lastChild!.textContent = s.noi === 'da-noi' ? 'Bridge' : s.noi === 'mat' ? 'Mất bridge' : 'Đang nối…';
  const k = $('tt-san-khau');
  k.className = `trang-thai ${s.sanKhau ? 'ok' : 'loi'}`;
  k.lastChild!.textContent = s.sanKhau ? 'Sân khấu' : 'Sân khấu chưa mở';
}

function ve(): void {
  veTrangThaiNoi();
  $('tieu-de').textContent = TEN_TRANG[trang];
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.sb-item')) {
    a.classList.toggle('chon', a.dataset.trang === trang);
  }
  $('cap-nhat').textContent = tCapNhat ? `Cập nhật ${gioNgan(tCapNhat, Date.now())}` : '';
  const viecs = tt ? hangCanQuyet(tt) : [];
  $('dem-hom-nay').textContent = viecs.length ? String(viecs.length) : '';
  $('dem-so').textContent = tt ? String(tt.soQuyTrinh.length) : '';
  $('dem-doi-ngu').textContent = tt?.nhanVien.length ? String(tt.nhanVien.length) : '';

  const main = $('trang');
  // giữ chỗ con trỏ / ô đang gõ khi vẽ lại
  const dangGo = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement
    ? (document.activeElement as HTMLElement).dataset.khoa
    : undefined;
  main.replaceChildren(...veTrang(viecs));
  if (dangGo) {
    const el = main.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-khoa="${dangGo}"]`);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

function veTrang(viecs: ViecCanQuyet[]): Node[] {
  if (!tt) {
    const s = bridge.trangThai();
    const loi =
      s.noi !== 'da-noi'
        ? 'Chưa nối được bridge. Bật bridge (VS Code: "Gen-Stage: Mở sân khấu", hoặc pnpm bridge) — trang tự nối lại.'
        : loiTai || 'Đang tải…';
    return [h('div', { class: 'trong' }, h('p', {}, loi), loiTai.includes('Sân khấu') || !s.sanKhau ? h('p', { class: 'mo' }, 'Sổ quy trình sống trong tab sân khấu — mở sân khấu rồi trang tự cập nhật.') : null)];
  }
  if (trang === 'so') return veSo();
  if (trang === 'doi-ngu') return veDoiNgu();
  return veHomNay(viecs);
}

function oSo(nhan: string, gt: number, loai = ''): HTMLElement {
  return h('div', { class: `kpi ${loai}` }, h('div', { class: 'kpi-nhan' }, nhan), h('div', { class: 'kpi-so mono' }, String(gt)));
}

function veHomNay(viecs: ViecCanQuyet[]): Node[] {
  const now = Date.now();
  const sd = soDoHomNay(tt!, now);
  const kpi = h(
    'section',
    { class: 'kpis', 'aria-label': 'Số đo hôm nay' },
    oSo('Chờ anh ký', sd.choKy, sd.choKy ? 'nhan' : ''),
    oSo('Nhân viên đang làm', sd.dangLam),
    oSo('Kiểm nhận hôm nay', sd.kiemNhan),
    oSo('Trả lại hôm nay', sd.traLai, sd.traLai ? 'canh' : ''),
    oSo('CEO đã duyệt hôm nay', sd.ceoDuyet),
    oSo('Vi phạm quy trình', sd.viPham, sd.viPham ? 'loi' : ''),
  );

  const hang = h(
    'section',
    { class: 'panel can-quyet' },
    h('div', { class: 'panel-dau' }, h('h2', {}, 'Cần anh quyết'), h('span', { class: 'mono mo' }, `${viecs.length} việc · cũ nhất trước`)),
    ...(viecs.length
      ? viecs.map((v) => veViec(v, now))
      : [h('div', { class: 'trong-nho' }, tt!.ceoKyTay ? 'Không có gì chờ anh. Báo cáo mới của Nhi sẽ hiện ở đây.' : 'Sân khấu đang ở chế độ Nam tự duyệt.')]),
  );

  const nv = tt!.nhanVien;
  const congTy = h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-dau' }, h('h2', {}, 'Công ty lúc này')),
    h(
      'dl',
      { class: 'dl' },
      h('dt', {}, 'Pha'),
      h('dd', {}, TEN_PHA[tt!.pha] ?? tt!.pha),
      h('dt', {}, 'Giám đốc'),
      h('dd', {}, tt!.choCeoDuyet ? 'Đang chờ anh trả lời' : tt!.viecTruong ? `Đang: ${tt!.viecTruong}` : 'Rảnh'),
      h('dt', {}, 'Báo cáo'),
      h('dd', {}, tt!.baoCaoCho ? 'Đang hoãn — chờ nhân viên nộp đủ bài' : '—'),
      h('dt', {}, 'Đã nhận'),
      h('dd', { class: 'mono' }, `${tt!.daHien} nhân viên${tt!.khongHien ? ` · ${tt!.khongHien} không hiện (đủ chỗ)` : ''}`),
    ),
    nv.length ? bangNhanVien(nv.slice(0, 6)) : h('div', { class: 'trong-nho' }, 'Chưa có nhân viên nào đang làm.'),
  );

  const ganDay = h(
    'section',
    { class: 'panel rong' },
    h('div', { class: 'panel-dau' }, h('h2', {}, 'Sổ gần đây'), h('a', { href: '#so', class: 'lk' }, 'Xem cả sổ →')),
    bangSo(locSo(tt!.soQuyTrinh, '', '').slice(0, 8), now, false),
  );

  return [kpi, h('div', { class: 'luoi-2' }, hang, congTy), ganDay];
}

function veViec(v: ViecCanQuyet, now: number): HTMLElement {
  if (v.loai === 'cho-tra-loi') {
    return h(
      'article',
      { class: 'viec info' },
      h('div', { class: 'viec-dau' }, h('span', { class: 'chip info' }, 'Đang chờ'), h('h3', {}, v.tieuDe), h('span', { class: 'mono mo' }, daCho(v.t, now))),
      h('p', { class: 'viec-mo' }, v.moTa),
    );
  }
  const so = v.baoCao.so;
  const dang = dangKy.has(so);
  const oGopY = h('textarea', {
    class: 'gop-y',
    rows: '2',
    maxlength: '200',
    placeholder: 'Góp ý (bắt buộc khi trả lại)…',
    'data-khoa': `gy-${so}`,
    'aria-label': `Góp ý cho báo cáo ${so}`,
  });
  oGopY.value = gopYDo.get(so) ?? '';
  oGopY.addEventListener('input', () => gopYDo.set(so, oGopY.value));
  const nutDuyet = h('button', { class: 'nut chinh', type: 'button' }, dang ? 'Đang ký…' : 'Ký duyệt');
  const nutTra = h('button', { class: 'nut', type: 'button' }, 'Trả lại');
  if (dang) {
    nutDuyet.setAttribute('disabled', '');
    nutTra.setAttribute('disabled', '');
  }
  nutDuyet.addEventListener('click', () => void ky(so, 'approve', oGopY.value));
  nutTra.addEventListener('click', () => {
    if (!oGopY.value.trim()) {
      oGopY.focus();
      toast('Trả lại thì ghi một câu góp ý để Nhi biết sửa gì', 'loi');
      return;
    }
    void ky(so, 'reject', oGopY.value);
  });
  const chiTiet = h(
    'details',
    { class: 'giay-to' },
    h('summary', {}, `Giấy tờ của phiên (${v.lienQuan.length})`),
    h(
      'ol',
      {},
      ...v.lienQuan.map((b) =>
        h('li', {}, h('span', { class: 'mono mo' }, `#${b.so}`), ' ', h('span', { class: `chip ${mauLoai(b.loai)}` }, TEN_LOAI[b.loai] ?? b.loai), ' ', b.tomTat, h('span', { class: 'mo' }, ` — ${b.ky}`)),
      ),
    ),
  );
  return h(
    'article',
    { class: `viec ${v.baoCao.ok ? '' : 'canh'}` },
    h('div', { class: 'viec-dau' }, h('span', { class: 'chip nhan' }, 'Chờ ký'), h('h3', {}, v.tieuDe), h('span', { class: 'mono mo' }, daCho(v.t, now))),
    h('p', { class: 'viec-mo' }, v.moTa),
    chiTiet,
    oGopY,
    h('div', { class: 'viec-nut' }, nutTra, nutDuyet),
  );
}

async function ky(so: number, quyet: 'approve' | 'reject', gopY: string): Promise<void> {
  if (dangKy.has(so)) return;
  dangKy.add(so);
  ve();
  try {
    await bridge.goi('team.sign', { report: so, decision: quyet, ...(gopY.trim() ? { note: gopY.trim() } : {}) });
    gopYDo.delete(so);
    toast(quyet === 'approve' ? `Đã ký duyệt báo cáo #${so}` : `Đã trả lại báo cáo #${so}`);
  } catch (e) {
    toast(`Không ký được: ${e instanceof Error ? e.message : String(e)}`, 'loi');
  } finally {
    dangKy.delete(so);
    await taiLai();
  }
}

function mauLoai(l: LoaiBanGhi): string {
  if (l === 'ceo-duyet' || l === 'kiem-nhan') return 'ok';
  if (l === 'tra-lai' || l === 'ceo-tra-lai') return 'canh';
  if (l === 'vi-pham') return 'loi';
  if (l === 'bao-cao' || l === 'xin-duyet') return 'nhan';
  return 'tho';
}

function bangSo(ds: BanGhi[], now: number, chonDuoc: boolean): HTMLElement {
  if (!ds.length) return h('div', { class: 'trong-nho' }, 'Sổ chưa có bản ghi nào khớp.');
  const than = h('tbody', {});
  for (const b of ds) {
    const tr = h(
      'tr',
      { class: banGhiChon === b.so ? 'chon' : '' },
      h('td', { class: 'mono id' }, `SQ-${String(b.so).padStart(4, '0')}`),
      h('td', { class: 'mono' }, gioNgan(b.t, now)),
      h('td', {}, h('span', { class: `chip ${mauLoai(b.loai)}` }, TEN_LOAI[b.loai] ?? b.loai)),
      h('td', {}, b.ky),
      h('td', { class: 'tom-tat' }, b.tomTat),
    );
    if (chonDuoc) {
      tr.tabIndex = 0;
      const chon = () => {
        banGhiChon = banGhiChon === b.so ? null : b.so;
        ve();
      };
      tr.addEventListener('click', chon);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chon();
        }
      });
    }
    than.append(tr);
  }
  return h(
    'div',
    { class: 'cuon' },
    h(
      'table',
      { class: 'bang' },
      h('thead', {}, h('tr', {}, h('th', {}, 'ID'), h('th', {}, 'Giờ'), h('th', {}, 'Loại'), h('th', {}, 'Ký'), h('th', {}, 'Nội dung'))),
      than,
    ),
  );
}

function veSo(): Node[] {
  const now = Date.now();
  const chonLoai = h('select', { class: 'o', 'aria-label': 'Lọc loại giấy tờ' }, h('option', { value: '' }, 'Mọi loại'));
  for (const [k, ten] of Object.entries(TEN_LOAI)) {
    const o = h('option', { value: k }, ten);
    if (k === locLoai) o.setAttribute('selected', '');
    chonLoai.append(o);
  }
  chonLoai.addEventListener('change', () => {
    locLoai = chonLoai.value as LoaiBanGhi | '';
    ve();
  });
  const tim = h('input', { class: 'o tim mono', type: 'search', placeholder: 'Tìm: số, nội dung, người ký…', 'data-khoa': 'tim-so', 'aria-label': 'Tìm trong sổ' });
  tim.value = locChu;
  tim.addEventListener('input', () => {
    locChu = tim.value;
    ve();
  });
  const ds = locSo(tt!.soQuyTrinh, locLoai, locChu);
  const chon = tt!.soQuyTrinh.find((b) => b.so === banGhiChon);
  const congThuc = h(
    'div',
    { class: 'cong-thuc mono' },
    h('span', { class: 'ct-ref' }, chon ? `SQ-${String(chon.so).padStart(4, '0')}` : '—'),
    h('span', { class: 'ct-gt' }, chon ? (chon.chiTiet ? JSON.stringify(chon.chiTiet) : chon.tomTat) : 'Chọn một dòng để xem chi tiết'),
  );
  return [
    h(
      'section',
      { class: 'panel rong' },
      h('div', { class: 'thanh-cong-cu' }, chonLoai, tim),
      congThuc,
      bangSo(ds, now, true),
      h('div', { class: 'chan mono' }, `${ds.length} / ${tt!.soQuyTrinh.length} bản ghi · sổ giữ tối đa 300 bản gần nhất`),
    ),
  ];
}

function bangNhanVien(nv: TrangThaiDoiNgu['nhanVien']): HTMLElement {
  return h(
    'div',
    { class: 'cuon' },
    h(
      'table',
      { class: 'bang' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nhân viên'), h('th', {}, 'Vai'), h('th', {}, 'Việc'), h('th', {}, 'Bước'), h('th', {}, 'Nguồn'))),
      h(
        'tbody',
        {},
        ...nv.map((n) =>
          h(
            'tr',
            {},
            h('td', { class: 'mono id' }, n.actor),
            h('td', {}, tenCuaVai(n.role)),
            h('td', { class: 'tom-tat' }, n.task || '—'),
            h('td', {}, h('span', { class: `chip ${n.pha === 'lam-lai' ? 'canh' : n.pha === 'cho-duyet' || n.pha === 'nop' ? 'nhan' : 'tho'}` }, TEN_PHA_NV[n.pha] ?? n.pha)),
            h('td', { class: 'mono mo' }, n.source),
          ),
        ),
      ),
    ),
  );
}

function veDoiNgu(): Node[] {
  const nv = tt!.nhanVien;
  return [
    h(
      'section',
      { class: 'panel rong' },
      h('div', { class: 'panel-dau' }, h('h2', {}, 'Nhân viên đang làm'), h('span', { class: 'mono mo' }, `${nv.length} / 6 chỗ`)),
      nv.length ? bangNhanVien(nv) : h('div', { class: 'trong-nho' }, 'Chưa có nhân viên nào. Khi Claude Code gọi subagent (hoặc não local chia việc), nhân viên sẽ hiện ở đây và trên sân khấu.'),
    ),
    h(
      'section',
      { class: 'panel rong' },
      h('div', { class: 'panel-dau' }, h('h2', {}, 'Quy trình')),
      h('p', { class: 'mo' }, 'Nhận việc → lập kế hoạch → giao việc (họp nếu ≥ 2 người) → thực hiện → Giám đốc duyệt từng bài → báo cáo → CEO ký. Chi tiết: docs/doi-ngu/QUY-TRINH.md.'),
      h('div', { class: 'pha-ds' }, ...Object.entries(TEN_PHA).map(([k, ten]) => h('span', { class: `pha ${k === tt!.pha ? 'dang' : ''}` }, ten))),
    ),
  ];
}

/* ------------------------------------------------------------ điều hướng */

function theoHash(): void {
  const t = location.hash.replace('#', '') as Trang;
  trang = t in TEN_TRANG ? t : 'hom-nay';
  ve();
}
window.addEventListener('hashchange', theoHash);
theoHash();
