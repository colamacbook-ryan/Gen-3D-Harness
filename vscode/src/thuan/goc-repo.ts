/**
 * goc-repo.ts — "repo Gen-Stage nằm ở đâu" khi extension được CÀI bằng `.vsix`
 * (không chạy F5 từ repo, nên thư mục cha của extension KHÔNG phải repo).
 *
 * `scripts/cai-vscode.sh` ghi đường dẫn tuyệt đối của repo vào
 * `$XDG_CONFIG_HOME/gen-stage/root` (mặc định `~/.config/gen-stage/root`).
 * Extension đọc file đó NGAY SAU setting `genStage.root`: Sếp cài một lệnh là
 * mở sân khấu được trong BẤT KỲ dự án nào, không phải tự đặt setting.
 *
 * Cùng mức tin như `genStage.root` (scope machine): file nằm trong thư mục cấu
 * hình người dùng, workspace không ghi được vào đó mà không chạy code trước.
 * Vẫn kiểm chặt: đường tuyệt đối, không ký tự điều khiển, và PHẢI là repo thật
 * (có `bridge/server.ts`) — sai thì coi như không có.
 *
 * Thuần (fs tiêm vào) để test được không cần VS Code.
 */
import * as path from 'node:path';

/** Đường file ghi chỗ đặt repo — khớp `scripts/cai-vscode.sh`. */
export function fileGocDaCai(env: Readonly<Record<string, string | undefined>>, home: string): string {
  const xdg = env.XDG_CONFIG_HOME;
  const goc = xdg && path.isAbsolute(xdg) ? xdg : path.join(home, '.config');
  return path.join(goc, 'gen-stage', 'root');
}

/**
 * Đọc chỗ đặt repo đã cài. Trả '' khi không có file, file rỗng/hỏng, đường
 * tương đối, có ký tự điều khiển, hoặc thư mục không phải repo Gen-Stage.
 */
export function docGocDaCai(
  file: string,
  doc: (f: string) => string | null,
  laRepo: (thuMuc: string) => boolean,
): string {
  const tho = doc(file);
  if (tho === null) return '';
  const dong = tho.split('\n')[0]!.trim();
  // eslint-disable-next-line no-control-regex
  if (!dong || !path.isAbsolute(dong) || /[\u0000-\u001f\u007f]/.test(dong)) return '';
  const p = path.resolve(dong);
  return laRepo(p) ? p : '';
}
