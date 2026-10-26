/**
 * xu-ly-chatroom.ts — xử lý tin webview chatroom gửi lên host (thuần, không
 * import `vscode`). `ChatroomProvider` và script bằng chứng `kiem-vscode.mjs`
 * dùng CHUNG hàm này, nên cái được kiểm trên cloud là đúng code chạy trong VS Code.
 */
import type { KetQuaLenh } from './cau-noi';
import { CHU_KHONG_RO } from './giong';
import type { SoChatroom } from './so-chatroom';

export interface TinTuChatroom {
  loai?: unknown;
  id?: unknown;
  text?: unknown;
}

/** V2 — phần của `DieuKhienGiong` mà chatroom cần (nút 🎤 giữ-để-nói). */
export interface NutGiong {
  giu(): void;
  tha(): void;
}

/**
 * Cửa sổ kiểm "Gen đã nhận câu này chưa" trước khi GỬI LẠI `stage.hear`: hạn `stage.hear` của
 * tai-nghe 15 s + thời gian Sếp đọc ô xác nhận rồi bấm. (Câu đã vào Gen mà ô xác nhận vẫn hiện
 * xảy ra khi tai-nghe nhận lỗi "không rõ kết cục" — hết hạn / ws rớt / bridge bị thay.)
 */
export const CUA_SO_DA_NHAN_MS = 30_000;

/** Chuẩn hoá để so câu: trim, gộp khoảng trắng, bỏ dấu câu cuối (bridge cũng bỏ `.!…` cuối — `chuanHoaCauNoi`). */
export const chuanSoCau = (t: string): string => t.trim().replace(/\s+/g, ' ').replace(/[.!…]+$/g, '');

/** Sự kiện `user.text`/`user.speech` cùng `to|text` (chuẩn hoá) đã thấy trong `CUA_SO_DA_NHAN_MS` gần nhất? */
export function daNhanRoi(so: SoChatroom, to: string, text: string, t = Date.now()): boolean {
  const khoa = chuanSoCau(text);
  return so.dong.some(
    (d) =>
      d.loai === 'sep' &&
      t - d.t <= CUA_SO_DA_NHAN_MS &&
      chuanSoCau(d.text) === khoa &&
      // `to` vắng trong sự kiện thì coi là khớp (thà báo "đã nhận" còn hơn gửi đôi)
      (d.toi === undefined || d.toi === to),
  );
}

export interface GoiLenh {
  goi(cmd: string, args: Record<string, unknown>): Promise<KetQuaLenh>;
}

/**
 * Trả `true` nếu cần vẽ lại webview ngay. Gửi câu thành công thì KHÔNG tự thêm
 * dòng: câu hiện qua sự kiện `user.text` của sân khấu — một nguồn duy nhất.
 */
export async function xuLyTinChatroom(
  m: TinTuChatroom,
  so: SoChatroom,
  cauNoi: GoiLenh,
  ghi: (dong: string) => void,
  giong?: NutGiong,
): Promise<boolean> {
  if (m?.loai === 'sanSang') return true;
  // V2 — nút 🎤: host spawn/dừng tai-nghe; trạng thái về qua mô hình
  if (m?.loai === 'micGiu') {
    giong?.giu();
    return false;
  }
  if (m?.loai === 'micTha') {
    giong?.tha();
    return false;
  }
  if (m?.loai === 'giongBo') {
    if (so.giong.pha === 'cho-xac-nhan') {
      ghi('[giọng] Sếp bỏ câu chờ xác nhận');
      so.giongNghi();
    }
    return true;
  }
  if (m?.loai === 'giongGui' && typeof m.text === 'string') {
    const cau = so.giong.cau;
    if (so.giong.pha !== 'cho-xac-nhan' || !cau || so.giong.dangGui) return true;
    const text = m.text.trim();
    if (!text) {
      so.datGiong({ chu: 'Câu rỗng — sửa lại hoặc bấm Bỏ.' });
      return true;
    }
    // Trước khi gửi (lại): Gen đã nhận đúng câu này rồi thì KHÔNG gửi — lần gửi trước có thể đã
    // tới nơi dù tai-nghe báo lỗi "không rõ kết cục".
    if (daNhanRoi(so, cau.to, text)) {
      ghi(`[giọng] bỏ gửi lại — đã thấy user.text cùng to|text trong ${CUA_SO_DA_NHAN_MS / 1000} s: ${text}`);
      so.giongNghi('Gen đã nhận câu này rồi — không gửi lại.');
      return true;
    }
    // `to` = người nghe lúc BẮT ĐẦU thu (INT-02), không phải lựa chọn hiện tại
    const args = { text, to: cau.to, confidence: cau.confidence, durationMs: cau.durationMs };
    ghi(`[giọng] → stage.hear ${JSON.stringify(args)}`);
    so.datGiong({ chu: 'Đang gửi…', dangGui: true });
    const kq = await cauNoi.goi('stage.hear', args);
    // trong lúc chờ có thể đã bắt đầu lần thu mới / bị huỷ — chỉ chạm đúng câu này
    if (so.giong.cau?.id !== cau.id) return true;
    if (!kq.ok) {
      // giữ câu trong ô sửa để Sếp thử lại
      const khongRo = /không trả lời|không rõ đã chạy/.test(kq.error ?? '');
      so.datGiong({
        chu: `Lỗi gửi: ${kq.error ?? 'không rõ'}` + (khongRo ? ` ${CHU_KHONG_RO}` : ''),
        dangGui: false,
      });
      return true;
    }
    so.giongNghi();
    return true;
  }
  if (m?.loai === 'chon' && typeof m.id === 'string') {
    if (so.chonNhanVat(m.id)) ghi(`[chatroom] chọn người nghe: ${m.id}`);
    return true;
  }
  if (m?.loai === 'gui' && typeof m.text === 'string') {
    const r = so.taoLenh(m.text);
    if (!r.ok) {
      so.ghiHeThong(`Chưa gửi được: ${r.loi}`);
      return true;
    }
    ghi(`[chatroom] → ${r.lenh.cmd} ${JSON.stringify(r.lenh.args)}`);
    const kq = await cauNoi.goi(r.lenh.cmd, r.lenh.args);
    if (!kq.ok) {
      so.ghiHeThong(`Lỗi gửi: ${kq.error ?? 'không rõ'}`);
      return true;
    }
    return false;
  }
  return false;
}
