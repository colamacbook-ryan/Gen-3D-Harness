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
): Promise<boolean> {
  if (m?.loai === 'sanSang') return true;
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
