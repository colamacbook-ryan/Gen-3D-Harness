/**
 * web/chatroom.ts — script chạy TRONG webview chatroom (không framework).
 *
 * Không giữ trạng thái: nhận `{lenh:"moHinh", moHinh}` từ extension host rồi vẽ
 * lại. Gửi lên host: `sanSang`, `chon {id}`, `gui {text}`.
 * V2 (giọng): `micGiu` / `micTha` (nút 🎤 giữ-để-nói), `giongGui {text}` /
 * `giongBo` (câu tin cậy thấp chờ xác nhận). Nhận thêm `{lenh:"muc", rms}`.
 */
import type { DongChat, MoHinhChatroom, MoHinhGiong, NhanVat } from '../src/thuan/chatroom-logic';

interface VsCodeApi {
  postMessage(m: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vs = acquireVsCodeApi();

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Thiếu #${id}`);
  return e as T;
};

const denBridge = $('den-bridge');
const chuBridge = $('chu-bridge');
const denSanKhau = $('den-san-khau');
const chuSanKhauEl = $('chu-san-khau');
const denNao = $('den-nao');
const chuNaoEl = $('chu-nao');
const canhBao = $('canh-bao');
const dsNhanVat = $<HTMLUListElement>('ds-nhan-vat');
const dsDong = $<HTMLOListElement>('ds-dong');
const form = $<HTMLFormElement>('o-nhap');
const nhap = $<HTMLInputElement>('nhap');
const nutGui = $<HTMLButtonElement>('nut-gui');
const nutMic = $<HTMLButtonElement>('nut-mic');
const khuGiong = $('giong');
const giongChu = $('giong-chu');
const giongVach = $('giong-vach');
const giongMuc = $('giong-muc');
const giongGoiY = $('giong-goi-y');
const formXacNhan = $<HTMLFormElement>('giong-xac-nhan');
const giongSua = $<HTMLInputElement>('giong-sua');
const giongGui = $<HTMLButtonElement>('giong-gui');
const giongBo = $<HTMLButtonElement>('giong-bo');

let moHinh: MoHinhChatroom | null = null;

function ten(ds: readonly NhanVat[], id: string | undefined): string {
  if (!id) return '';
  if (id === 'camera') return 'Sếp (camera)';
  return ds.find((a) => a.id === id)?.name ?? id;
}

function gio(t: number): string {
  return new Date(t).toLocaleTimeString('vi-VN', { hour12: false });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, chu?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (chu !== undefined) e.textContent = chu;
  return e;
}

function veNhanVat(m: MoHinhChatroom): void {
  dsNhanVat.replaceChildren();
  if (!m.nhanVat.length) {
    dsNhanVat.append(el('li', 'trong', m.sanKhauNoi ? 'Sân khấu chưa có nhân vật.' : 'Chưa có dữ liệu sân khấu.'));
    return;
  }
  for (const a of m.nhanVat) {
    const li = el('li');
    const nut = el('button', 'nhan-vat' + (a.id === m.dangChon ? ' dang-chon' : ''));
    nut.type = 'button';
    nut.setAttribute('aria-pressed', String(a.id === m.dangChon));
    nut.title = `Chọn ${a.name} làm người nghe (câu không gọi tên sẽ tới ${a.name})`;
    nut.append(
      el('span', 'ten', a.name),
      el('span', 'id', a.id),
      el('span', 'nhan ' + a.controlledBy, a.controlledBy === 'owner' ? 'Sếp lái' : 'agent'),
    );
    nut.addEventListener('click', () => vs.postMessage({ loai: 'chon', id: a.id }));
    li.append(nut);
    dsNhanVat.append(li);
  }
}

function veDong(m: MoHinhChatroom): void {
  const oCuoi = dsDong.scrollHeight - dsDong.scrollTop - dsDong.clientHeight < 24;
  dsDong.replaceChildren();
  for (const d of m.dong as DongChat[]) {
    const li = el('li', 'dong ' + d.loai);
    li.append(el('span', 'gio', gio(d.t)));
    if (d.loai === 'sep') {
      const ai = el('span', 'ai', ten(m.nhanVat, d.ai) + (d.toi ? ' → ' + ten(m.nhanVat, d.toi) : ''));
      li.append(ai);
      if (d.giong) li.append(el('span', 'giong', 'nói'));
    } else if (d.loai === 'nhan-vat') {
      li.append(el('span', 'ai', ten(m.nhanVat, d.ai)));
    }
    li.append(el('span', 'chu', d.text));
    dsDong.append(li);
  }
  if (!m.dong.length) dsDong.append(el('li', 'trong', 'Chưa có câu nào.'));
  if (oCuoi) dsDong.scrollTop = dsDong.scrollHeight;
}

function ve(m: MoHinhChatroom): void {
  moHinh = m;
  denBridge.className = 'den ' + (m.bridgeNoi ? 'xanh' : 'do');
  chuBridge.textContent = 'Bridge: ' + (m.bridgeNoi ? 'đã nối' : 'chưa nối');
  // chữ + màu trạng thái do host tính sẵn (hàm thuần `chuSanKhau`/`chuNao`) — webview chỉ vẽ
  denSanKhau.className = 'den ' + m.trangThaiSanKhau.den;
  chuSanKhauEl.textContent = m.trangThaiSanKhau.chu;
  denNao.className = 'den ' + m.trangThaiNao.den;
  chuNaoEl.textContent = m.trangThaiNao.chu;
  canhBao.hidden = !m.canhBao;
  canhBao.textContent = m.canhBao;
  veNhanVat(m);
  veDong(m);
  const nguoiNghe = m.dangChon ? ten(m.nhanVat, m.dangChon) : '…';
  nhap.placeholder = `Nói với ${nguoiNghe}… (Enter gửi)`;
  nutGui.disabled = !m.bridgeNoi;
  veGiong(m.giong, m);
}

/* ------------------------------------------------------ V2 — giọng nói */

/** id câu chờ xác nhận đang nằm trong ô sửa — chỉ ghi đè ô khi câu MỚI tới. */
let cauDangSua = -1;

function veGiong(g: MoHinhGiong, m: MoHinhChatroom): void {
  const dangThu = g.pha === 'khoi-dong' || g.pha === 'nghe' || g.pha === 'nhan-dang';
  nutMic.disabled = !g.nutDuoc;
  nutMic.classList.toggle('dang-thu', dangThu);
  nutMic.setAttribute('aria-pressed', String(dangThu));
  const nguoiNghe = m.dangChon ? ten(m.nhanVat, m.dangChon) : '…';
  nutMic.title = g.nutDuoc ? `Giữ để nói với ${nguoiNghe}` : `Không nói được: ${g.nutLyDo}`;
  if (!g.nutDuoc && dangGiu) thaMic(); // nút vừa bị tắt giữa chừng (không thể xảy ra khi đang thu, nhưng phòng hờ)

  const coGiDeHien = g.pha !== 'nghi' || !!g.chu;
  khuGiong.hidden = !coGiDeHien;
  khuGiong.className = 'pha-' + g.pha;
  const toi = g.toi ? ten(m.nhanVat, g.toi) : '';
  // người nghe chỉ ghi kèm khi đang thu / chờ xác nhận (lỗi, bỏ qua thì không cần)
  const kemToi = dangThu || g.pha === 'cho-xac-nhan';
  giongChu.textContent = g.chu + (toi && kemToi ? ` → ${toi}` : '');
  giongVach.hidden = g.pha !== 'nghe';
  if (g.pha !== 'nghe') giongMuc.style.width = '0%';
  giongGoiY.hidden = !g.goiY;
  giongGoiY.textContent = g.goiY;

  const choXacNhan = g.pha === 'cho-xac-nhan' && !!g.cau;
  formXacNhan.hidden = !choXacNhan;
  if (choXacNhan && g.cau && g.cau.id !== cauDangSua) {
    cauDangSua = g.cau.id;
    giongSua.value = g.cau.text;
    giongSua.focus();
    giongSua.select();
  }
  if (!choXacNhan) cauDangSua = -1;
  giongGui.disabled = g.dangGui || !m.bridgeNoi;
  giongBo.disabled = g.dangGui;
}

let dangGiu = false;

function giuMic(e: Event): void {
  e.preventDefault();
  if (dangGiu || nutMic.disabled) return;
  dangGiu = true;
  vs.postMessage({ loai: 'micGiu' });
}

function thaMic(): void {
  if (!dangGiu) return;
  dangGiu = false;
  vs.postMessage({ loai: 'micTha' });
}

nutMic.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  giuMic(e);
});
// thả / kéo ra khỏi nút / hệ thống huỷ con trỏ → dừng thu (gửi `dung`)
for (const ten of ['pointerup', 'pointerleave', 'pointercancel'] as const) nutMic.addEventListener(ten, thaMic);
// nút có thể bị tắt giữa chừng → pointerup không tới nút; bắt ở cửa sổ cho chắc
window.addEventListener('pointerup', thaMic);
window.addEventListener('blur', thaMic);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) thaMic();
});
// bàn phím trên chính nút (Tab tới 🎤): giữ Space/Enter — keyup có trong webview
nutMic.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) giuMic(e);
  else if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
});
nutMic.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    thaMic();
  }
});
// nút trong <form>: click (sau pointerup) không được gửi form
nutMic.addEventListener('click', (e) => e.preventDefault());

formXacNhan.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = giongSua.value.trim();
  if (!text) return;
  vs.postMessage({ loai: 'giongGui', text });
});
giongBo.addEventListener('click', () => vs.postMessage({ loai: 'giongBo' }));
giongSua.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') vs.postMessage({ loai: 'giongBo' });
});

window.addEventListener('message', (ev: MessageEvent) => {
  const m = ev.data as { lenh?: string; moHinh?: MoHinhChatroom; rms?: unknown };
  if (m?.lenh === 'moHinh' && m.moHinh) ve(m.moHinh);
  else if (m?.lenh === 'muc' && typeof m.rms === 'number') {
    // RMS lời nói thường 0,02–0,3: căn bậc hai cho vạch dễ đọc
    giongMuc.style.width = `${Math.round(Math.min(1, Math.sqrt(Math.max(0, m.rms))) * 100)}%`;
  }
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = nhap.value.trim();
  if (!text || !moHinh?.bridgeNoi) return;
  vs.postMessage({ loai: 'gui', text });
  nhap.value = '';
});

vs.postMessage({ loai: 'sanSang' });
