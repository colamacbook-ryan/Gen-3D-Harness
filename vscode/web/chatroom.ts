/**
 * web/chatroom.ts — script chạy TRONG webview chatroom (không framework).
 *
 * Không giữ trạng thái: nhận `{lenh:"moHinh", moHinh}` từ extension host rồi vẽ
 * lại. Gửi lên host: `sanSang`, `chon {id}`, `gui {text}`.
 */
import type { DongChat, MoHinhChatroom, NhanVat } from '../src/thuan/chatroom-logic';

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
const nutGui = form.querySelector('button') as HTMLButtonElement;

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
}

window.addEventListener('message', (ev: MessageEvent) => {
  const m = ev.data as { lenh?: string; moHinh?: MoHinhChatroom };
  if (m?.lenh === 'moHinh' && m.moHinh) ve(m.moHinh);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = nhap.value.trim();
  if (!text || !moHinh?.bridgeNoi) return;
  vs.postMessage({ loai: 'gui', text });
  nhap.value = '';
});

vs.postMessage({ loai: 'sanSang' });
