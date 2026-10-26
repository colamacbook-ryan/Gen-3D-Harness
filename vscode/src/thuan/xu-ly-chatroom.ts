/**
 * xu-ly-chatroom.ts — xử lý tin webview chatroom gửi lên host (thuần, không
 * import `vscode`). `ChatroomProvider` và script bằng chứng `kiem-vscode.mjs`
 * dùng CHUNG hàm này, nên cái được kiểm trên cloud là đúng code chạy trong VS Code.
 */
import type { KetQuaLenh } from './cau-noi';
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
    // `to` = người nghe lúc BẮT ĐẦU thu (INT-02), không phải lựa chọn hiện tại
    const args = { text, to: cau.to, confidence: cau.confidence, durationMs: cau.durationMs };
    ghi(`[giọng] → stage.hear ${JSON.stringify(args)}`);
    so.datGiong({ chu: 'Đang gửi…', dangGui: true });
    const kq = await cauNoi.goi('stage.hear', args);
    // trong lúc chờ có thể đã bắt đầu lần thu mới / bị huỷ — chỉ chạm đúng câu này
    if (so.giong.cau?.id !== cau.id) return true;
    if (!kq.ok) {
      // giữ câu trong ô sửa để Sếp thử lại
      so.datGiong({ chu: `Lỗi gửi: ${kq.error ?? 'không rõ'}`, dangGui: false });
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
