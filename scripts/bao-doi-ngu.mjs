#!/usr/bin/env node
/**
 * bao-doi-ngu.mjs — INT-07: HOOK của Claude Code → `team.event` trên sân khấu.
 *
 * Claude Code gọi script này ở `PreToolUse` / `PostToolUse` của tool giao việc
 * cho subagent (`Task`, bản mới tên `Agent`), JSON của hook đi vào stdin:
 *   · PreToolUse  → `team.event { kind: "spawn", id, role: subagent_type, task: description }`
 *   · PostToolUse → `team.event { kind: "done" | "fail", id }`
 * Sân khấu dựng một nhân viên búp bê theo vai, Nhi (kỹ sư trưởng) giao việc,
 * nhân viên làm ở khu của mình rồi nộp kết quả — xem `src/behavior/doi-ngu.ts`.
 *
 * LUẬT CỦA MỘT HOOK: KHÔNG BAO GIỜ làm chậm hay chặn Claude Code. Luôn thoát
 * mã 0, không in gì ra stdout (stdout của hook có nghĩa với Claude Code), hạn
 * cứng `HAN_MS`; bridge tắt / sai token / JSON lạ ⇒ lặng lẽ bỏ qua (ghi
 * stderr khi có `GEN_STAGE_DOI_NGU_LOG=1`).
 *
 * Cấu hình (ví dụ `~/.claude/settings.json` hoặc `.claude/settings.local.json`):
 *   "hooks": {
 *     "PreToolUse":  [{ "matcher": "Task|Agent", "hooks": [{ "type": "command",
 *                        "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }],
 *     "PostToolUse": [{ "matcher": "Task|Agent", "hooks": [{ "type": "command",
 *                        "command": "node /đường/tới/Gen-3D-Harness/scripts/bao-doi-ngu.mjs" }] }]
 *   }
 * Biến môi trường: `GEN_STAGE_PORT` (8787), `GEN_STAGE_TOKEN` (nếu bridge bật token).
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const HAN_MS = 1500;
const TOOL_GIAO_VIEC = new Set(['Task', 'Agent']);

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
  if (typeof res === 'string' && /^(error|lỗi)\b/i.test(res.trim())) return true;
  return false;
}

/**
 * JSON hook → tham số `team.event`, hoặc `null` nếu không liên quan. THUẦN
 * (test gọi thẳng). Chỉ lấy vai + mô tả ngắn — KHÔNG gửi prompt/kết quả của
 * subagent lên sân khấu (riêng tư; sân khấu chỉ cần biết "ai làm gì").
 */
export function suKienTuHook(p) {
  if (!p || typeof p !== 'object') return null;
  if (!TOOL_GIAO_VIEC.has(p.tool_name)) return null;
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
