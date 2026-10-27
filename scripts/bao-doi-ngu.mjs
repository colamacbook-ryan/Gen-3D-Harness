#!/usr/bin/env node
/**
 * bao-doi-ngu.mjs — INT-07: HOOK của Claude Code → `team.event` trên sân khấu.
 *
 * Mỗi mốc của một phiên Claude Code là một bước trong QUY TRÌNH công ty
 * (`src/behavior/doi-ngu.ts`, `docs/doi-ngu/QUY-TRINH.md`). JSON hook vào stdin:
 *
 *   | hook                         | team.event     | trên sân khấu                                  |
 *   | ---------------------------- | -------------- | ---------------------------------------------- |
 *   | SessionStart                 | session-start  | Nhi chào CEO, về bàn                           |
 *   | UserPromptSubmit             | brief          | CEO (Ryan) giao việc: Nhi lên bàn CEO nhận việc |
 *   | PreToolUse  Task/Agent       | spawn          | nhân viên vào cửa, chờ Giám đốc giao việc      |
 *   | PostToolUse Task/Agent       | done / fail    | nhân viên nộp bài, Giám đốc duyệt, về          |
 *   | PreToolUse  tool khác        | work {tool}    | Nhi tự làm: thẻ + màn hình (đọc/viết/test…)    |
 *   | PostToolUse tool khác        | work-result    | chỉ gửi khi lỗi, hoặc test/build/lệnh/git      |
 *   | Notification                 | ask            | Nhi lên bàn CEO đứng chờ duyệt                 |
 *   | Stop                         | report         | Nhi báo cáo CEO (hoãn tới khi đội nộp đủ bài)  |
 *   | PreCompact                   | compact        | Nhi ra kệ hồ sơ sắp xếp ghi chép               |
 *   | SessionEnd                   | session-end    | đội về, Nhi ra sofa                            |
 *
 * RIÊNG TƯ: chỉ gửi vai + mô tả ngắn của subagent và LOẠI việc (`doc`, `test`…).
 * Không bao giờ gửi prompt, lệnh shell, đường dẫn file, nội dung thông báo hay
 * kết quả tool — loại việc được phân ngay trong tiến trình này rồi bỏ.
 *
 * LUẬT CỦA MỘT HOOK: KHÔNG BAO GIỜ làm chậm hay chặn Claude Code. Luôn thoát
 * mã 0, không in gì ra stdout (stdout của hook có nghĩa với Claude Code), hạn
 * cứng `HAN_MS`; bridge tắt / sai token / JSON lạ ⇒ lặng lẽ bỏ qua (ghi
 * stderr khi có `GEN_STAGE_DOI_NGU_LOG=1`).
 *
 * Cấu hình: chép khối `hooks` trong `docs/doi-ngu/README.md` vào
 * `~/.claude/settings.json` (hoặc `.claude/settings.local.json` của dự án) —
 * mọi mốc trỏ tới CÙNG một lệnh `node …/scripts/bao-doi-ngu.mjs`.
 * Biến môi trường: `GEN_STAGE_PORT` (8787), `GEN_STAGE_TOKEN` (nếu bridge bật token).
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HAN_MS = 1500;
const TOOL_GIAO_VIEC = new Set(['Task', 'Agent']);

/** Tool → loại việc (khớp `LOAI_VIEC` trong `src/behavior/doi-ngu.ts`). */
const LOAI_THEO_TOOL = {
  Read: 'doc',
  NotebookRead: 'doc',
  Grep: 'tim',
  Glob: 'tim',
  LS: 'tim',
  Edit: 'viet',
  MultiEdit: 'viet',
  Write: 'viet',
  NotebookEdit: 'viet',
  WebFetch: 'web',
  WebSearch: 'web',
  TodoWrite: 'ke-hoach',
  TaskCreate: 'ke-hoach',
  TaskUpdate: 'ke-hoach',
  EnterPlanMode: 'ke-hoach',
  ExitPlanMode: 'ke-hoach',
};

/** Loại việc mà KẾT QUẢ đạt cũng đáng báo (để sân khấu thấy "sửa xong lỗi"). */
const BAO_KET_QUA_DAT = new Set(['test', 'build', 'chay-lenh', 'git']);

const ghiLog = (...x) => {
  if (process.env.GEN_STAGE_DOI_NGU_LOG === '1') console.error('[bao-doi-ngu]', ...x);
};

/**
 * Mã ghép cặp Pre ↔ Post. Ưu tiên `tool_use_id`; bản Claude Code nào không có
 * thì băm (phiên + mô tả + prompt) — cùng một lời gọi tool cho cùng một chuỗi.
 */
function maSubagent(p) {
  if (typeof p.tool_use_id === 'string' && p.tool_use_id) return p.tool_use_id;
  const ti = p.tool_input ?? {};
  const h = createHash('sha1')
    .update(`${p.session_id ?? ''}|${ti.description ?? ''}|${ti.prompt ?? ''}`)
    .digest('hex');
  return `h${h.slice(0, 16)}`;
}

/** Kết quả tool có phải lỗi không (đủ các dạng Claude Code từng trả). */
function laLoi(res) {
  if (!res) return false;
  if (typeof res === 'object' && (res.is_error === true || res.isError === true)) return true;
  if (typeof res === 'object' && Number.isInteger(res.exit_code ?? res.exitCode) && (res.exit_code ?? res.exitCode) !== 0) return true;
  if (typeof res === 'string' && /^(error|lỗi)\b/i.test(res.trim())) return true;
  return false;
}

/**
 * Phân loại một tool thành loại việc. Bash: đọc lệnh NGAY TẠI ĐÂY để phân loại
 * (test / build / git / lệnh thường) — chuỗi lệnh không rời tiến trình này.
 */
export function loaiViec(tenTool, ti = {}) {
  if (tenTool === 'Bash') {
    const lenh = typeof ti.command === 'string' ? ti.command : '';
    if (/\b(vitest|jest|pytest|mocha|tools\/test\.sh)\b|\b(pnpm|npm|yarn)( run)? test\b|\btest\b.*\.(mjs|ts|sh)\b/.test(lenh)) return 'test';
    if (/\b(tsc|vite build|webpack|cargo build|go build|make)\b|\b(pnpm|npm|yarn)( run)? build\b/.test(lenh)) return 'build';
    if (/^\s*(cd [^&;]+(&&|;)\s*)?git\b/.test(lenh)) return 'git';
    return 'chay-lenh';
  }
  return LOAI_THEO_TOOL[tenTool] ?? 'khac';
}

/** Mã cho sự kiện cấp phiên (không có tool_use_id): băm phiên + loại + mốc thời gian. */
function maPhien(p, kind) {
  const h = createHash('sha1').update(`${p.session_id ?? ''}|${kind}|${Date.now()}|${Math.random()}`).digest('hex');
  return `s${h.slice(0, 16)}`;
}

/**
 * JSON hook → tham số `team.event`, hoặc `null` nếu không liên quan. THUẦN
 * (test gọi thẳng). Chỉ lấy vai + mô tả ngắn của subagent và loại việc — KHÔNG
 * gửi prompt / lệnh / đường dẫn / kết quả lên sân khấu.
 */
export function suKienTuHook(p) {
  if (!p || typeof p !== 'object') return null;
  const nguon = { source: 'claude-code' };
  switch (p.hook_event_name) {
    case 'SessionStart':
      return { kind: 'session-start', id: maPhien(p, 'ss'), ...nguon };
    case 'UserPromptSubmit':
      return { kind: 'brief', id: maPhien(p, 'br'), ...nguon };
    case 'Notification':
      return { kind: 'ask', id: maPhien(p, 'ask'), ...nguon };
    case 'Stop':
      return { kind: 'report', id: maPhien(p, 'rp'), ...nguon };
    case 'PreCompact':
      return { kind: 'compact', id: maPhien(p, 'cp'), ...nguon };
    case 'SessionEnd':
      return { kind: 'session-end', id: maPhien(p, 'se'), ...nguon };
    case 'PreToolUse':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      break;
    default:
      return null;
  }
  if (typeof p.tool_name !== 'string' || !p.tool_name) return null;
  if (!TOOL_GIAO_VIEC.has(p.tool_name)) {
    const tool = loaiViec(p.tool_name, p.tool_input ?? {});
    const id = typeof p.tool_use_id === 'string' && p.tool_use_id ? p.tool_use_id : maPhien(p, 'w');
    if (p.hook_event_name === 'PreToolUse') return { kind: 'work', id, tool, ...nguon };
    const ok = p.hook_event_name !== 'PostToolUseFailure' && !laLoi(p.tool_response);
    if (ok && !BAO_KET_QUA_DAT.has(tool)) return null; // đạt thường ngày: không làm phiền sân khấu
    return { kind: 'work-result', id, tool, ok, ...nguon };
  }
  const id = maSubagent(p);
  if (p.hook_event_name === 'PreToolUse') {
    const ti = p.tool_input ?? {};
    return {
      kind: 'spawn',
      id,
      role: typeof ti.subagent_type === 'string' && ti.subagent_type ? ti.subagent_type : 'general-purpose',
      task: typeof ti.description === 'string' ? ti.description.slice(0, 120) : '',
      source: 'claude-code',
    };
  }
  if (p.hook_event_name === 'PostToolUseFailure') return { kind: 'fail', id, source: 'claude-code' };
  if (p.hook_event_name === 'PostToolUse') {
    return { kind: laLoi(p.tool_response) ? 'fail' : 'done', id, source: 'claude-code' };
  }
  return null;
}

/** Gửi một lệnh lên bridge, chờ trả lời hoặc hết hạn. Không bao giờ ném. */
export async function guiLenBridge(args, { port = process.env.GEN_STAGE_PORT ?? '8787', token = process.env.GEN_STAGE_TOKEN, hanMs = HAN_MS } = {}) {
  const { default: WebSocket } = await import('ws');
  return await new Promise((xong) => {
    let ws;
    const het = setTimeout(() => {
      ghiLog('hết hạn');
      try {
        ws?.terminate();
      } catch {
        /* bỏ qua */
      }
      xong(false);
    }, hanMs);
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch (e) {
      clearTimeout(het);
      ghiLog(e);
      xong(false);
      return;
    }
    ws.on('open', () => {
      if (token) ws.send(JSON.stringify({ token }));
      ws.send(JSON.stringify({ id: 'doi-ngu-1', cmd: 'team.event', args }));
    });
    ws.on('message', (tho) => {
      let g;
      try {
        g = JSON.parse(String(tho));
      } catch {
        return;
      }
      if (g.id !== 'doi-ngu-1') return;
      clearTimeout(het);
      if (!g.ok) ghiLog('bridge từ chối:', g.error);
      ws.close();
      xong(g.ok === true);
    });
    ws.on('error', (e) => {
      clearTimeout(het);
      ghiLog('ws lỗi:', e.message);
      xong(false);
    });
  });
}

async function docStdin() {
  let s = '';
  for await (const k of process.stdin) s += k;
  return s;
}

async function chinh() {
  try {
    const p = JSON.parse(await docStdin());
    const args = suKienTuHook(p);
    if (args) await guiLenBridge(args);
  } catch (e) {
    ghiLog(e);
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void chinh();
