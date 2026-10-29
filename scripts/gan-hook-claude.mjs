#!/usr/bin/env node
/**
 * gan-hook-claude.mjs — INT-07: gắn hook `scripts/bao-doi-ngu.mjs` vào cấu hình
 * Claude Code của Sếp, để mỗi phiên Claude Code hiện thành công ty agent trên
 * sân khấu (CEO giao việc, họp, nhân viên subagent, duyệt bài, báo cáo).
 *
 *   node scripts/gan-hook-claude.mjs            # gắn vào ~/.claude/settings.json ($CLAUDE_CONFIG_DIR nếu có)
 *   node scripts/gan-hook-claude.mjs --go       # gỡ đúng các hook này ra
 *   node scripts/gan-hook-claude.mjs --file <đường settings.json>
 *
 * Luật: CHỈ THÊM / GỠ đúng mục của mình (nhận ra bằng tên `bao-doi-ngu.mjs`),
 * không đụng hook hay setting nào khác; chạy lại không nhân đôi; sao lưu file
 * cũ thành `settings.json.bak-<thời điểm>` trước khi ghi. File hỏng JSON ⇒
 * dừng, không ghi đè.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAU_HIEU = 'bao-doi-ngu.mjs';

/** Mốc hook Claude Code → có cần `matcher` không (tool event thì cần "*"). */
export const MOC_HOOK = Object.freeze({
  SessionStart: null,
  UserPromptSubmit: null,
  PreToolUse: '*',
  PostToolUse: '*',
  Notification: null,
  Stop: null,
  PreCompact: null,
  SessionEnd: null,
});

/** Lệnh hook — đường dẫn trong ngoặc kép vì thư mục của Sếp có khoảng trắng. */
export function lenhHook(goc = GOC) {
  return `node "${resolve(goc, 'scripts', DAU_HIEU)}"`;
}

const laCuaMinh = (h) => typeof h?.command === 'string' && h.command.includes(DAU_HIEU);

/** Gỡ mọi hook của mình khỏi một mốc; bỏ nhóm rỗng. THUẦN (trả bản mới). */
function goMoc(dsNhom) {
  const ra = [];
  for (const nhom of Array.isArray(dsNhom) ? dsNhom : []) {
    const hooks = Array.isArray(nhom?.hooks) ? nhom.hooks.filter((h) => !laCuaMinh(h)) : nhom?.hooks;
    if (Array.isArray(nhom?.hooks) && hooks.length === 0) continue;
    ra.push({ ...nhom, hooks });
  }
  return ra;
}

/**
 * Gắn (hoặc gỡ, `go: true`) hook vào object settings. THUẦN: không sửa bản
 * vào. Gắn = gỡ bản cũ của mình rồi thêm một nhóm mới ⇒ chạy lại không nhân
 * đôi, và đổi chỗ repo thì lệnh tự cập nhật.
 */
export function ganHook(settings, { lenh = lenhHook(), go = false } = {}) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? structuredClone(settings) : {};
  const hooks = s.hooks && typeof s.hooks === 'object' && !Array.isArray(s.hooks) ? { ...s.hooks } : {};
  for (const [moc, matcher] of Object.entries(MOC_HOOK)) {
    const conLai = goMoc(hooks[moc]);
    if (!go) conLai.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: lenh }] });
    if (conLai.length) hooks[moc] = conLai;
    else delete hooks[moc];
  }
  if (Object.keys(hooks).length) s.hooks = hooks;
  else delete s.hooks;
  return s;
}

function chinh() {
  const a = process.argv.slice(2);
  const go = a.includes('--go');
  const iFile = a.indexOf('--file');
  // Claude Code đọc cấu hình ở $CLAUDE_CONFIG_DIR khi biến này được đặt, không thì ~/.claude
  const thuMuc = process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR) : resolve(homedir(), '.claude');
  const file = iFile >= 0 && a[iFile + 1] ? resolve(a[iFile + 1]) : resolve(thuMuc, 'settings.json');
  let cu = {};
  if (existsSync(file)) {
    try {
      cu = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`[gắn hook] ${file} không phải JSON hợp lệ (${e.message}) — KHÔNG ghi đè. Sửa tay rồi chạy lại.`);
      process.exit(2);
    }
    const bak = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(file, bak);
    console.log(`[gắn hook] đã sao lưu: ${bak}`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
  }
  const moi = ganHook(cu, { go });
  writeFileSync(file, `${JSON.stringify(moi, null, 2)}\n`);
  console.log(
    go
      ? `[gắn hook] đã GỠ hook Gen-Stage khỏi ${file}`
      : `[gắn hook] đã gắn ${Object.keys(MOC_HOOK).length} mốc → ${lenhHook()} vào ${file}\n` +
          '            Phiên Claude Code MỚI mới nhận hook (phiên đang mở thì gõ /hooks để xem).',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) chinh();
