/**
 * khoa-nao.mjs — KHOÁ DRIVER NÃO dùng chung cho `nao-agy.mjs` và `nao-local.mjs`.
 *
 * Vì sao: hai driver não cùng nghe `user.text` thì mỗi câu của Sếp được trả lời
 * HAI lần (hai bong bóng chen nhau, tốn quota). Không chặn ở bridge được vì tiến
 * trình MCP stdio của agy cũng nối `?role=nao` — chặn ở đó sẽ phá agy. Nên chặn
 * ngay ở driver: file `.cache/nao-driver.lock` tạo NGUYÊN TỬ (`openSync` cờ `wx`),
 * nội dung JSON `{ pid, starttime, ten }`.
 *
 * `starttime` (field 22 của /proc/<pid>/stat) để phân biệt "pid cũ đã chết nhưng
 * hệ điều hành cấp lại cho tiến trình khác" — khoá của tiến trình đã chết (pid
 * không còn, hoặc starttime khác) thì chiếm lại.
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const KHOA_MAC_DINH = resolve(GOC, '.cache/nao-driver.lock');
/** Mã thoát khi bị khoá — `chay.sh` đọc mã này để KHÔNG bật lại vòng lặp. */
export const MA_THOAT_BI_KHOA = 3;

/** starttime (jiffies từ lúc boot) của pid; `null` nếu không có tiến trình đó. */
export function docStartTime(pid) {
  try {
    const s = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // `comm` nằm trong ngoặc và có thể chứa khoảng trắng/ngoặc → cắt từ ')' CUỐI.
    const sau = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return sau[19] ?? null; // field 22 = sau[19] (sau ')' bắt đầu từ field 3)
  } catch {
    return null;
  }
}

function conSong(k, docStart) {
  if (!k || !Number.isInteger(k.pid)) return false;
  const st = docStart(k.pid);
  return st !== null && String(st) === String(k.starttime);
}

/**
 * Lấy khoá. Trả `{ ok: true, huy() }` hoặc `{ ok: false, giu: {pid, ten} }`.
 * `docStart` nhận vào để test giả lập tiến trình sống/chết.
 */
export function layKhoaNao({ ten, duong = KHOA_MAC_DINH, pid = process.pid, docStart = docStartTime } = {}) {
  mkdirSync(dirname(duong), { recursive: true });
  const toi = { pid, starttime: docStart(pid) ?? '', ten };
  for (let lan = 0; lan < 5; lan++) {
    let fd;
    try {
      fd = openSync(duong, 'wx');
    } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
      let cu = null;
      try {
        cu = JSON.parse(readFileSync(duong, 'utf8'));
      } catch {
        /* file hỏng / đang được ghi dở — xử lý như mồ côi bên dưới, trừ khi vừa biến mất */
      }
      if (cu && conSong(cu, docStart)) return { ok: false, giu: { pid: cu.pid, ten: cu.ten } };
      try {
        unlinkSync(duong); // mồ côi → chiếm lại; hai tiến trình cùng chiếm thì một bên thua ở `wx` kế tiếp
      } catch (e2) {
        if (e2?.code !== 'ENOENT') throw e2;
      }
      continue;
    }
    try {
      writeSync(fd, JSON.stringify(toi));
    } finally {
      closeSync(fd);
    }
    let da = false;
    return {
      ok: true,
      khoa: toi,
      huy() {
        if (da) return;
        da = true;
        try {
          const k = JSON.parse(readFileSync(duong, 'utf8'));
          if (k.pid === pid && String(k.starttime) === String(toi.starttime)) unlinkSync(duong); // chỉ xoá khoá CỦA MÌNH
        } catch {
          /* đã mất — không sao */
        }
      },
    };
  }
  return { ok: false, giu: { pid: 0, ten: '?' } };
}

/**
 * Dùng trong `chay()` của driver: không lấy được khoá → log + thoát mã
 * `MA_THOAT_BI_KHOA`. Lấy được thì tự dọn khi thoát bình thường / SIGINT / SIGTERM.
 */
export function giuKhoaHoacThoat({ ten, tienTo, duong = process.env.GEN_STAGE_NAO_KHOA || KHOA_MAC_DINH }) {
  const k = layKhoaNao({ ten, duong });
  if (!k.ok) {
    console.error(`${tienTo} đang có driver não ${k.giu.ten} (pid ${k.giu.pid}) — thoát (hai driver cùng chạy thì mỗi câu trả lời hai lần).`);
    process.exit(MA_THOAT_BI_KHOA);
  }
  process.on('exit', () => k.huy());
  // SIGINT/SIGTERM: handler của driver gọi process.exit(0) → sự kiện 'exit' ở trên dọn khoá.
  return k;
}
