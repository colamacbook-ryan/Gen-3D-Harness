/**
 * nao-local.mjs — DRIVER NÃO LOCAL (V1, INT-03): nghe sân khấu, trả lời bằng LLM
 * chạy trên máy (Ollama, API OpenAI-compatible `/v1`). Không cần mạng ra ngoài,
 * không cần VS Code (INT-05) — extension chỉ khởi động file này.
 *
 *     ô chat / chatroom / mic
 *        │  actor.say owner {to}  →  user.text / user.speech
 *        ▼
 *     bridge/server.ts ──ws ?role=nao──► nao-local.mjs (file này)
 *         │                                 │ ≤300 ms phản xạ (turnTo + emote)
 *         │                                 ▼
 *         │                      Ollama /v1/chat/completions + tools
 *         │                                 │ tool_calls (≤ 3 vòng)
 *         ◄──── ws cmd (qua lyDoCamNao) ────┘
 *
 * KHUNG LẤY Y NGUYÊN TỪ `nao-agy.mjs` (import, không chép): lọc câu
 * (`laCauCuaSep`), gộp 800 ms (`taoGop`), hàng đợi một lượt (`taoHangDoi`),
 * phản xạ (`phanXa`), nối bridge `?role=nao` + heartbeat 15 s + backoff 1→10 s +
 * log lý do mỗi lần mất/nối (`noiSanKhau`, bài học #37: KHÔNG unref hẹn giờ nối
 * lại), rút gọn describe (`gonDescribe`), dòng nhắc một dòng (`dungDongNhac`).
 * File này chỉ thay phần "não".
 *
 * TOOL: sinh từ registry bằng đúng hàm của MCP (`toolTuLenh` trong
 * `bridge/mcp.ts`) rồi lọc DANH SÁCH TRẮNG 10 tool — model local nhỏ gọi tool
 * kém, đưa 44 tool là nó lạc. Mọi tool_call đi qua `lyDoCamNao` (rào theo vai,
 * cùng chỗ với MCP) trước khi chạm ws.
 *
 * NGƯỜI TRẢ LỜI: tách bằng chính `tachNguoiNhan` của lớp hiểu lệnh (C2) —
 * tên gọi trong câu → `to` → gen. Javis (`owner`) không bao giờ là người trả lời:
 * câu tự do gửi Javis do lớp hiểu lệnh lo ("chưa hiểu"), driver bỏ qua.
 *
 * Chạy:  pnpm nao-local        (= tsx scripts/nao-local.mjs — cần tsx vì
 *                               import thẳng `bridge/mcp.ts` + registry TS)
 *
 * Biến môi trường:
 *   GEN_STAGE_PORT              cổng ws bridge (mặc định 8787)
 *   GEN_STAGE_TOKEN             token ws nếu bridge bật token
 *   GEN_STAGE_OLLAMA_URL        gốc Ollama (mặc định http://127.0.0.1:11434)
 *   GEN_STAGE_OLLAMA_MODEL      model muốn dùng (bỏ trống = tự chọn model có "tools")
 *   GEN_STAGE_NAO_LOCAL_HAN     ms tối đa một lượt (mặc định 60000)
 *   GEN_STAGE_NAO_LOCAL_XIN_CHO ms chưa thấy mở miệng thì xin Sếp chờ (mặc định 20000)
 *   GEN_STAGE_NAO_GOP / _NHIP_TIM / _QUA_HAN_TIM   như nao-agy.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MS_GIUA_LUOT_IDE,
  MS_GOP_MAC_DINH,
  MS_NHIP_TIM_MAC_DINH,
  MS_QUA_HAN_TIM_MAC_DINH,
  MS_XIN_CHO,
  MS_BACKOFF_MAX,
  MS_BACKOFF_MIN,
  dungDongNhac,
  gannNgheIde,
  gonDescribe,
  laCauCuaSep,
  noiSanKhau,
  phanXa,
  taoGop,
  taoHangDoi,
  taoLocTrung,
  tinhBackoff,
} from './nao-agy.mjs';
import { giuKhoaHoacThoat } from './khoa-nao.mjs';
import { cuaBossTuDescribe, lyDoCamNao, toolTuLenh } from '../bridge/mcp.ts';
import { taoRegistry } from '../src/api/commands/index.ts';
import { danhSachThamSo } from '../src/api/registry.ts';
import { tachNguoiNhan } from '../src/behavior/hieu-lenh.ts';
import { tach, tenDep } from '../src/behavior/ngu-phap.ts';

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const OLLAMA_MAC_DINH = 'http://127.0.0.1:11434';
/** Hạn một lượt não local (gồm cả mọi vòng tool). */
export const MS_HAN_LOCAL = 60_000;
/** Tối đa bấy nhiêu lần gọi model trong một lượt. */
export const VONG_TOI_DA = 3;
/** Hạn một lần dò Ollama (`/v1/models`, `/api/show`) — Ollama treo không được giữ cả hàng đợi. */
export const MS_DO_MODEL = 5_000;
/** Persona dài quá thì model nhỏ đọc chậm — cắt ở đây. */
const PERSONA_TOI_DA_DONG = 40;

/** Danh sách trắng — thứ tự là thứ tự đưa cho model. */
export const DANH_SACH_TRANG = Object.freeze([
  'actor_say',
  'actor_emote',
  'actor_moveTo',
  'actor_faceTo',
  'actor_play',
  'actor_express',
  'screen_show',
  'fx_play',
  'module_build',
  'camera_preset',
]);

export const CAU_CHUA_CO_NAO =
  'Em chưa có não local, Sếp bật Ollama và kéo một model có tools giúp em nhé';
export const CAU_XIN_CHO = 'Em đang nghĩ, Sếp chờ chút ạ';
export const CAU_QUA_LAU = 'Em nghĩ lâu quá, Sếp hỏi lại giúp em nhé';
export const CAU_DU_PHONG = 'Em nghe rồi Sếp, nhưng em chưa nghĩ ra câu trả lời ạ';
/** Model đã diễn được (đi, emote, màn hình…) mà không nói gì → đáp gọn, không than "chưa nghĩ ra". */
export const CAU_DA_LAM = 'Dạ, em làm ngay ạ';

/** Hai nhân vật mặc định khi chưa đọc được sân khấu (để rào người trả lời không mù). */
const ACTOR_MAC_DINH = [
  { id: 'owner', controlledBy: 'owner' },
  { id: 'gen', controlledBy: 'agent' },
];

/* ============================================================== 1. tool */

/**
 * Tool cho Ollama: `toolTuLenh` (cùng hàm MCP dùng) → format OpenAI
 * `{type:"function", function:{name, description, parameters}}`, lọc danh sách
 * trắng. Tool nào registry không có thì bỏ và ghi log.
 */
export function sinhToolLocal({ registry = taoRegistry(), trang = DANH_SACH_TRANG, ghi = console.log } = {}) {
  const coSan = new Map(registry.all().map((s) => [toolTuLenh(s).name, s]));
  const tools = [];
  const banDo = new Map();
  const thieu = [];
  for (const ten of trang) {
    const spec = coSan.get(ten);
    if (!spec) {
      thieu.push(ten);
      continue;
    }
    const t = toolTuLenh(spec);
    tools.push({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } });
    banDo.set(t.name, spec);
  }
  if (thieu.length) ghi(`[nao-local] ${gio()} registry KHÔNG có tool: ${thieu.join(', ')} — bỏ khỏi danh sách trắng.`);
  return { tools, banDo, thieu };
}

/** Trần số giá trị liệt kê trong một tham số — giữ prompt gọn cho model nhỏ. */
export const GIA_TRI_TOI_DA = 30;

/**
 * Điền giá trị HỢP LỆ đang có trên sân khấu vào schema tool (từ `stage.bootstrap`).
 * Model nhỏ không có `stage_describe` để tra, nên tên place/clip/màn hình phải nằm ngay
 * trong schema — E2E 26/10: model đoán `screen:"main"` (không tồn tại).
 * Tham số không tự do → `enum`; tự do (`to` nhận cả toạ độ) → thêm vào mô tả.
 * Bỏ qua `actor`: driver tự điền người trả lời, không gợi tên Javis cho model.
 * Thuần: trả bản sao, không sửa `tools`.
 */
export function boSungGiaTri(tools, banDo, bootstrap, { ten = tenDep } = {}) {
  const lenh = new Map(((bootstrap && bootstrap.commands) || []).map((c) => [c.cmd, c]));
  return tools.map((t) => {
    const ra = structuredClone(t);
    const mt = lenh.get(banDo.get(t.function.name)?.cmd);
    if (!mt) return ra;
    for (const p of mt.params || []) {
      const prop = ra.function.parameters.properties?.[p.name];
      if (!prop || p.name === 'actor' || prop.enum || !Array.isArray(p.values) || !p.values.length) continue;
      const vals = p.values.filter((v) => typeof v === 'string').slice(0, GIA_TRI_TOI_DA);
      if (!vals.length) continue;
      // id giữ từ thời lab mà nghĩa đã đổi (ban-dieu-khien = bàn làm việc) ⇒ kèm tên tiếng Việt
      const nhan = (v) => {
        const d = ten(v);
        return d && d !== v.replace(/-/g, ' ') ? `${v} (${d})` : v;
      };
      if (p.tuDo) prop.description = `${prop.description ?? ''} Có trên sân khấu: ${vals.map(nhan).join(', ')}.`.trim();
      else prop.enum = vals;
    }
    return ra;
  });
}

/**
 * Tool "sống": lần đầu (và sau mỗi lần sân khấu nối lại) hỏi `stage.bootstrap` rồi điền giá trị.
 * Hỏi hỏng ⇒ dùng tool gốc, lượt sau hỏi lại — không bao giờ chặn lượt não.
 */
export function taoToolSong({ san, tools, banDo, ghi = console.log }) {
  let cache = null;
  san.khiSuKien?.((event) => {
    if (event === 'bridge.stageOnline') cache = null;
  });
  return async function layTools() {
    if (cache) return cache;
    const kq = await san.goi('stage.bootstrap', {}).catch((e) => ({ ok: false, error: String(e) }));
    if (!kq?.ok) {
      ghi(`[nao-local] ${gio()} không đọc được stage.bootstrap (${kq?.error ?? '?'}) — dùng tool chưa điền giá trị.`);
      return tools;
    }
    cache = boSungGiaTri(tools, banDo, kq.result);
    return cache;
  };
}

/* ===================================================== 2. người trả lời */

/**
 * Ai trả lời câu này? Cùng luật lớp hiểu lệnh (CHỐT A): tên gọi → `to` → gen.
 * Trả `null` nếu người nhận chỉ là nhân vật của Sếp (Javis) — não không đáp.
 * "mọi người" → nhân vật agent đầu tiên trong danh sách người nhận.
 */
export function chonNguoiTraLoi(text, actors, to) {
  const ds = Array.isArray(actors) && actors.length ? actors : ACTOR_MAC_DINH;
  const bc = { actors: ds.map((a) => ({ id: a.id, controlledBy: a.controlledBy ?? 'agent' })), places: [], emotes: [], screens: [], props: [], gocMay: [] };
  const cauGoc = String(text ?? '');
  // textGoc: G3 gọi trần "Nhi, …" đầu câu cần câu nguyên văn (dấu phẩy)
  const nn = tachNguoiNhan(tach(cauGoc), bc, typeof to === 'string' ? to : undefined, cauGoc).nguoiNhan;
  return nn.find((id) => bc.actors.find((a) => a.id === id)?.controlledBy === 'agent') ?? null;
}

/* ============================================================ 3. persona */

/** Persona: `.cache/nao-local/<actor>.md` (của Sếp) > `scripts/nao-local/<actor>.md` > mặc định. */
export function docPersona(actor, { goc = GOC } = {}) {
  // id actor đi thẳng vào đường dẫn file ⇒ chỉ nhận id an toàn (không `/`, `..`) — review bảo mật 26/10
  const an = /^[a-z0-9_-]{1,32}$/i.test(String(actor));
  const ung = an ? [resolve(goc, '.cache/nao-local', `${actor}.md`), resolve(goc, 'scripts/nao-local', `${actor}.md`)] : [];
  for (const f of ung) {
    if (existsSync(f)) return readFileSync(f, 'utf8').split('\n').slice(0, PERSONA_TOI_DA_DONG).join('\n').trim();
  }
  return `# Em là ${actor}\n\nEm là nhân vật "${actor}" trên sân khấu 3D của Sếp. Xưng "em", gọi "Sếp", tiếng Việt, câu ngắn.`;
}

/** Nhắc hệ thống mỗi lượt: persona + luật cứng (luật nằm ở code, persona Sếp sửa thoải mái). */
export function dungNhacHeThong({ persona, actor }) {
  return [
    persona,
    '',
    'LUẬT CỨNG (driver):',
    `- Em là actor "${actor}". Chỉ điều khiển chính em. KHÔNG BAO GIỜ điều khiển actor "owner" (Javis, avatar của Sếp).`,
    `- Trả lời Sếp bằng tool actor_say {"actor":"${actor}","text":"…","interrupt":true}: tiếng Việt, tối đa 2 câu.`,
    '- Gọi actor_say TRƯỚC, rồi mới diễn thêm tối đa 2 tool (actor_emote, screen_show, module_build…).',
    '- Không gọi được tool thì cứ trả lời bằng chữ thường — driver sẽ nói hộ em.',
    '- Mỗi lượt user là một dòng: SẾP NÓI «…» | SÂN KHẤU {trạng thái rút gọn}.',
  ].join('\n');
}

/**
 * Bỏ `<think>…</think>` của model suy luận, gọn khoảng trắng, cắt ≤ 300 ký tự.
 * Model nhỏ hay VIẾT lệnh thành chữ (`actor_say {"actor":"gen","text":"…"}`) hoặc chép lại
 * trạng thái sân khấu (E2E 26/10, B5): rút đúng `"text"` của lời nói nếu có; còn dấu vết
 * lệnh/JSON thì bỏ hẳn (rỗng ⇒ driver dùng câu dự phòng) — không đọc JSON thành tiếng.
 */
export function sachNoiDung(s) {
  const goc = String(s ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/[{}\[\]]|\b[a-z]+_[a-zA-Z]+\s*[({]|"[a-zA-Z]+"\s*:/.test(goc)) {
    const m = goc.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return '';
    let t = m[1];
    try {
      t = JSON.parse(`"${t}"`);
    } catch {
      /* giữ nguyên */
    }
    return /[{}\[\]]/.test(t) ? '' : t.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  return goc.slice(0, 300);
}

/* ============================================================== 4. Ollama */

/** Lỗi từ Ollama mang cờ `tatHan` = không tới được / không có model → coi như mất não. */
class LoiOllama extends Error {
  constructor(msg, { tatHan = false, quaHan = false } = {}) {
    super(msg);
    this.tatHan = tatHan;
    this.quaHan = quaHan;
  }
}

/** Client Ollama mỏng: `/v1/models`, `/api/show`, `/v1/chat/completions`. `fetch` truyền vào được để test. */
export function taoOllama({ url = OLLAMA_MAC_DINH, fetch: f = globalThis.fetch, msDo = MS_DO_MODEL } = {}) {
  const goc = String(url).replace(/\/+$/, '');
  async function goi(duong, init = {}) {
    let res;
    try {
      // mọi lần gọi đều có hạn: dò model mặc định `msDo`; chat dùng signal của lượt
      res = await f(`${goc}${duong}`, { ...init, signal: init.signal ?? AbortSignal.timeout(msDo) });
    } catch (e) {
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') throw new LoiOllama('quá hạn', { quaHan: true });
      throw new LoiOllama(`không tới được Ollama ${goc} (${e?.cause?.code ?? e?.message ?? e})`, { tatHan: true });
    }
    const chu = await res.text();
    if (!res.ok) {
      throw new LoiOllama(`Ollama ${duong} HTTP ${res.status}: ${chu.slice(0, 200)}`, { tatHan: res.status === 404 });
    }
    try {
      return JSON.parse(chu);
    } catch {
      throw new LoiOllama(`Ollama ${duong} trả không phải JSON`);
    }
  }
  return {
    url: goc,
    async models() {
      const j = await goi('/v1/models');
      return (j.data ?? []).map((m) => m.id).filter(Boolean);
    },
    /** `capabilities` của model (Ollama mới có `["completion","tools",…]`); không đọc được thì `null`. */
    async capabilities(model) {
      try {
        const j = await goi('/api/show', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model }),
        });
        return Array.isArray(j.capabilities) ? j.capabilities : null;
      } catch {
        return null;
      }
    },
    async chat({ model, messages, tools, signal }) {
      const j = await goi('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, tools, stream: false }),
        signal,
      });
      const msg = j.choices?.[0]?.message;
      if (!msg) throw new LoiOllama('Ollama trả về không có choices[0].message');
      return msg;
    },
  };
}

/**
 * Dò lúc chạy (STD-10): chọn model. Có `muon` thì phải có trong `/v1/models`;
 * không thì ưu tiên model khai `tools` trong `/api/show`, không đọc được
 * capability thì lấy model đầu tiên.
 */
export async function chonModel(ollama, { muon = '' } = {}) {
  const ds = await ollama.models();
  if (!ds.length) throw new LoiOllama('Ollama chưa có model nào (ollama pull <model>)', { tatHan: true });
  if (muon) {
    if (!ds.includes(muon)) {
      throw new LoiOllama(`không thấy model "${muon}" trong /v1/models (có: ${ds.join(', ')})`, { tatHan: true });
    }
    return muon;
  }
  let dauTien = null;
  for (const m of ds) {
    const cap = await ollama.capabilities(m);
    if (cap?.includes('tools')) return m;
    if (cap === null && !dauTien) dauTien = m;
  }
  if (dauTien) return dauTien;
  throw new LoiOllama(`không model nào có khả năng "tools" (có: ${ds.join(', ')})`, { tatHan: true });
}

/**
 * Trạng thái "có não local chưa". Mất não → log lý do mỗi lần thử, báo Sếp
 * ĐÚNG MỘT LẦN mỗi đợt mất (`bao()` trả true = đã nói tới nơi), thử lại theo
 * backoff 1→10 s. Hẹn giờ KHÔNG unref (bài học #37 — đây có thể là handle
 * duy nhất giữ tiến trình khi bridge cũng đang mất).
 */
export function taoDoNao({ ollama, muon = '', bao, ghi = console.log, backoff = { min: MS_BACKOFF_MIN, max: MS_BACKOFF_MAX } }) {
  let model = null;
  let lanThu = 0;
  let daBao = false;
  let hen = null;
  let dung = false;
  let dangDo = null;

  async function thu() {
    try {
      const m = await chonModel(ollama, { muon });
      if (m !== model) ghi(`[nao-local] ${gio()} não local sẵn sàng: ${ollama.url} · model ${m}`);
      model = m;
      lanThu = 0;
      daBao = false;
      return model;
    } catch (e) {
      model = null;
      lanThu++;
      const cho = tinhBackoff(lanThu, backoff);
      ghi(`[nao-local] ${gio()} CHƯA CÓ NÃO LOCAL (${e?.message ?? e}) — thử lại lần ${lanThu} sau ${cho} ms.`);
      if (!daBao) {
        try {
          daBao = (await bao(e?.message ?? String(e))) === true;
        } catch {
          /* sân khấu chưa nghe được — lần thử sau báo lại */
        }
      }
      if (!dung && !hen) {
        hen = setTimeout(() => {
          hen = null;
          void lay();
        }, cho);
      }
      return null;
    }
  }

  function lay() {
    if (model) return Promise.resolve(model);
    if (!dangDo) dangDo = thu().finally(() => (dangDo = null));
    return dangDo;
  }

  return {
    lay,
    model: () => model,
    daBao: () => daBao,
    /** Lượt não vừa thấy Ollama chết/mất model → quên model, dò lại ngay. */
    hong(lyDo) {
      if (!model) return;
      ghi(`[nao-local] ${gio()} MẤT NÃO LOCAL giữa lượt: ${lyDo}`);
      model = null;
      if (hen) {
        clearTimeout(hen);
        hen = null;
      }
      void lay();
    },
    dong() {
      dung = true;
      if (hen) clearTimeout(hen);
      hen = null;
    },
  };
}

/* ============================================================ 5. một lượt */

/** Đọc `arguments` của tool_call (Ollama trả chuỗi JSON; vài bản trả object). */
function docArgs(a) {
  const laObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (laObj(a)) return a;
  if (a === undefined || a === null || (typeof a === 'string' && !a.trim())) return {};
  const j = typeof a === 'string' ? JSON.parse(a) : a;
  // "null"/mảng/số/chuỗi parse được nhưng KHÔNG phải object tham số → coi là JSON không hợp lệ
  if (!laObj(j)) throw new Error('arguments không phải object');
  return j;
}

/**
 * Một lượt não local:
 *   describe rút gọn → model (≤ VONG_TOI_DA vòng) → mỗi tool_call: danh sách
 *   trắng + `lyDoCamNao` → ws cmd → kết quả trả lại model.
 *   Model không gọi `actor_say` nào thành công → driver tự nói `content`.
 *   > msXinCho chưa mở miệng → "Em đang nghĩ…"; > msHan → huỷ, xin hỏi lại.
 */
export function taoLuotLocal({
  san,
  ollama,
  doNao,
  tools,
  banDo,
  layTools = async () => tools,
  layPersona = docPersona,
  capNhatActors = () => {},
  ghi = console.log,
  msHan = MS_HAN_LOCAL,
  msXinCho = MS_XIN_CHO,
  vongToiDa = VONG_TOI_DA,
  chiaViec = null,
  msChiaViec = MS_CHIA_VIEC,
}) {
  /** Ai đang chờ `actor.sayStart` của nhân vật nào (nhận cả `data` để lọc câu "xin chờ"). */
  const choNoi = new Set();
  san.khiSuKien((event, data) => {
    if (event !== 'actor.sayStart') return;
    for (const f of Array.from(choNoi)) f(String(data?.actor ?? ''), data);
  });

  return async function luot({ cau, nguoiTraLoi = 'gen', t0 = Date.now(), ide = false }) {
    const bd = Date.now();
    const nhat = { cau, nguoiTraLoi, model: null, vong: 0, toolCalls: [], tuNoi: null, ok: false, lyDo: '', ...(ide ? { ide: true } : {}) };
    ghi(`[nao-local] ${gio()} ${ide ? 'IDE' : 'SẾP'} → ${nguoiTraLoi}: «${cau}»`);
    // V3 — lượt IDE: Sếp không hỏi gì → không "xin chờ", không câu dự phòng/lỗi nói ra,
    // và câu driver nói hộ KHÔNG cắt ngang việc đang làm (ưu tiên thấp).

    // Hẹn "xin chờ" + hạn lượt chạy NGAY, bao cả bước dò model (`doNao.lay()`):
    // Ollama treo ở dò thì Sếp vẫn nghe "đang nghĩ" rồi "nghĩ lâu quá", hàng đợi không kẹt.
    let moMieng = false;
    const thoi = (id, data) => {
      if (id !== nguoiTraLoi || moMieng) return;
      if (data?.text === CAU_XIN_CHO) return; // câu "xin chờ" không phải câu trả lời
      moMieng = true;
      ghi(`[nao-local] ${gio()} ${nguoiTraLoi} BẮT ĐẦU NÓI sau ${Date.now() - t0} ms (từ lúc Sếp gõ)`);
    };
    choNoi.add(thoi);
    const henXinCho = setTimeout(() => {
      if (!moMieng && !ide) void san.goi('actor.say', { actor: nguoiTraLoi, text: CAU_XIN_CHO, emotion: 'suy-nghi', interrupt: true });
    }, msXinCho);
    const ac = new AbortController();
    // câu là yêu cầu việc ⇒ có thể phải chờ cả đội làm: thêm ngân sách cho quy trình
    const quyTrinh = Boolean(chiaViec) && !ide && nguoiTraLoi === 'gen' && laYeuCauViec(cau);
    const henHan = setTimeout(() => ac.abort(), msHan + (quyTrinh ? msChiaViec : 0));
    const huyLuon = new Promise((_, rej) => ac.signal.addEventListener('abort', () => rej(new LoiOllama('quá hạn', { quaHan: true }))));
    huyLuon.catch(() => {}); // tránh unhandledRejection khi lượt xong trước hạn

    let daNoi = false;
    let ketQuaDoi = [];
    /** Có lệnh diễn (không phải actor.say) chạy thành công trên người trả lời — E2E 26/10. */
    let daDien = false;
    let noiDung = '';
    try {
      const model = await Promise.race([doNao.lay(), huyLuon]);
      if (!model) {
        nhat.lyDo = 'chua-co-nao';
        ghi(`[nao-local] ${gio()} bỏ lượt: chưa có não local (đã báo Sếp: ${doNao.daBao() ? 'rồi' : 'chưa'}).`);
        return nhat;
      }
      nhat.model = model;
      const mt = await san.goi('stage.describe', {});
      const cuaBoss = cuaBossTuDescribe(mt.ok ? mt.result : undefined);
      if (mt.ok) capNhatActors(mt.result?.actors);
      if (quyTrinh) {
        const cv = await Promise.race([chiaViec.chia({ cau, model, signal: ac.signal }), huyLuon]);
        ketQuaDoi = cv.ketQua;
        if (ketQuaDoi.length) nhat.doiNgu = ketQuaDoi.map(({ vai, viec, ok }) => ({ vai, viec, ok }));
      }
      const messages = [
        { role: 'system', content: dungNhacHeThong({ persona: layPersona(nguoiTraLoi), actor: nguoiTraLoi }) },
        {
          role: 'user',
          content: dungDongNhac({ cau, ide, describe: gonDescribe(mt.result, { suKien: san.suKienCuoi() }) }) + nhacTongHop(ketQuaDoi),
        },
      ];

      const toolLuot = await layTools();
      for (let v = 0; v < vongToiDa; v++) {
        const msg = await ollama.chat({ model, messages, tools: toolLuot, signal: ac.signal });
        nhat.vong++;
        const nd = sachNoiDung(msg.content);
        if (nd) noiDung = nd;
        const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (!calls.length) break;
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
        for (let i = 0; i < calls.length; i++) {
          const c = calls[i];
          const id = c.id ?? `call_${v}_${i}`;
          const kq = await thucThi(c, { cuaBoss, nguoiTraLoi });
          nhat.toolCalls.push(kq.nhat);
          if (kq.nhat.cmd === 'actor.say' && kq.ok && String(kq.nhat.args?.actor) === nguoiTraLoi) daNoi = true; // đúng người trả lời mới tính
          else if (kq.ok && kq.nhat.cmd !== 'actor.say') daDien = true;
          messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(kq.traModel).slice(0, 2000) });
        }
      }
      nhat.ok = true;
    } catch (e) {
      if (e?.quaHan || ac.signal.aborted) {
        nhat.lyDo = `quá ${msHan} ms`;
        ghi(`[nao-local] ${gio()} lượt quá hạn ${msHan} ms.`);
        if (!daNoi && !ide) {
          await san.goi('actor.say', { actor: nguoiTraLoi, text: CAU_QUA_LAU, emotion: 'boi-roi', interrupt: true });
          nhat.tuNoi = CAU_QUA_LAU;
        }
        return nhat;
      }
      nhat.lyDo = e?.message ?? String(e);
      ghi(`[nao-local] ${gio()} NÃO LOCAL LỖI: ${nhat.lyDo}`);
      if (e?.tatHan) {
        doNao.hong(nhat.lyDo); // mất Ollama/model: báo Sếp một lần qua doNao, không nói thêm
        return nhat;
      }
      if (!daNoi && !ide) {
        const cau2 = `Em bị lỗi não local: ${nhat.lyDo.slice(0, 80)}`;
        await san.goi('actor.say', { actor: nguoiTraLoi, text: cau2, emotion: 'that-bai', interrupt: true });
        nhat.tuNoi = cau2;
      }
      return nhat;
    } finally {
      clearTimeout(henXinCho);
      clearTimeout(henHan);
      choNoi.delete(thoi);
      // bước cuối của quy trình: báo cáo CEO (sân khấu tự hoãn tới khi cả đội nộp bài)
      if (quyTrinh) void chiaViec.xongLuot(nhat.ok);
    }

    // Ollama không có tool_choice: model trả chữ thuần → driver nói hộ
    // Đã diễn được thì KHÔNG cắt ngang (interrupt:false): model vừa cho đi ra cửa sổ mà câu nói hộ
    // `interrupt:true` là cú đi bị huỷ, Gen không bao giờ tới nơi (E2E 26/10, cùng họ bug B3).
    if (!daNoi && (noiDung || !ide)) {
      const text = noiDung || (daDien ? CAU_DA_LAM : CAU_DU_PHONG);
      const kq = await san.goi('actor.say', { actor: nguoiTraLoi, text, interrupt: !ide && !daDien });
      nhat.tuNoi = text;
      if (!kq.ok) ghi(`[nao-local] ${gio()} tự nói hộ lỗi: ${kq.error}`);
    }
    ghi(`[nao-local] ${gio()} xong lượt sau ${Date.now() - bd} ms · ${nhat.vong} vòng · ${nhat.toolCalls.length} tool_call · ${nhat.tuNoi ? 'driver nói hộ' : 'model tự nói'}`);
    return nhat;
  };

  /** Một tool_call → (rào) → ws. Bị chặn thì trả lỗi về cho model như kết quả tool. */
  async function thucThi(c, { cuaBoss, nguoiTraLoi }) {
    const ten = String(c?.function?.name ?? '');
    const spec = banDo.get(ten);
    let args;
    try {
      args = docArgs(c?.function?.arguments);
    } catch {
      const loi = `arguments của ${ten} không phải JSON hợp lệ`;
      return { ok: false, traModel: { ok: false, error: loi }, nhat: { tool: ten, cmd: null, args: null, chan: loi } };
    }
    if (!spec) {
      const loi = `Tool "${ten}" không có trong danh sách được phép (${[...banDo.keys()].join(', ')}).`;
      ghi(`[nao-local] ${gio()} CHẶN ${ten}: ngoài danh sách trắng`);
      return { ok: false, traModel: { ok: false, error: loi }, nhat: { tool: ten, cmd: null, args, chan: loi } };
    }
    // model nhỏ hay quên "actor" → điền người trả lời (không bao giờ điền owner)
    if (args.actor === undefined && danhSachThamSo(spec).some((p) => p.name === 'actor')) args = { ...args, actor: nguoiTraLoi };
    const cam = lyDoCamNao(spec.cmd, args, cuaBoss);
    if (cam) {
      ghi(`[nao-local] ${gio()} CHẶN ${spec.cmd} ${JSON.stringify(args)}: ${cam}`);
      return { ok: false, traModel: { ok: false, error: cam }, nhat: { tool: ten, cmd: spec.cmd, args, chan: cam } };
    }
    const kq = await san.goi(spec.cmd, args);
    ghi(`[nao-local] ${gio()} → ${spec.cmd} ${JSON.stringify(args)} · ${kq.ok ? 'ok' : 'LỖI ' + kq.error}`);
    return {
      ok: kq.ok,
      traModel: kq.ok ? { ok: true, result: kq.result ?? null } : { ok: false, error: kq.error },
      nhat: { tool: ten, cmd: spec.cmd, args, ok: kq.ok, ...(kq.ok ? {} : { error: kq.error }) },
    };
  }
}

/* ======================================================= 5b. chia việc (INT-07) */

/**
 * NÃO LOCAL CHIA VIỆC CHO NHÂN VIÊN — theo QUY TRÌNH, do DRIVER cầm lái
 * (Ryan 27/10: "luôn phải theo quy trình, không tự biên tự diễn"). Model chỉ
 * được hỏi đúng câu của từng bước; thứ tự bước là của driver, không của model:
 *
 *   1. nhận việc     `team.event brief`   — chỉ khi câu của Sếp là YÊU CẦU VIỆC
 *   2. lập kế hoạch  model trả JSON `{"viec":[{"vai","viec"}]}` (≤ 3 việc, vai trong bảng)
 *   3. giao việc     `team.event spawn` cho từng việc (sân khấu họp / giao riêng)
 *   4. thực hiện     mỗi nhân viên = một lượt model riêng với vai riêng, KHÔNG tool
 *                    (nhân viên không điều khiển sân khấu, chỉ làm việc chuyên môn)
 *   5. nộp + KIỂM NHẬN  Giám đốc duyệt từng bài bằng một lượt model trả JSON
 *                    `{"dat":bool,"ly_do":"…"}`: đạt ⇒ `done` (dấu ĐÃ KIỂM NHẬN);
 *                    chưa đạt lần đầu ⇒ `rework` (dấu TRẢ LẠI, nhân viên làm lại
 *                    với góp ý); chưa đạt lần hai / hỏng ⇒ `fail`
 *   6. tổng hợp      lượt chính của Nhi chỉ nhận bài ĐÃ KIỂM NHẬN rồi nói với Sếp
 *   7. báo cáo       `team.event report` (sân khấu hoãn tới khi cả đội nộp xong)
 *
 * Câu nói chuyện thường (hỏi han, chào) KHÔNG đi quy trình — không ai họp vì
 * một câu "chào em".
 */
export const VAI_NHAN_VIEN_LOCAL = Object.freeze({
  builder: 'thợ xây — viết/sửa code',
  tester: 'kiểm thử — nghĩ ca test, tìm lỗi',
  debugger: 'bác sĩ debug — tìm nguyên nhân gốc',
  designer: 'thiết kế — giao diện, trải nghiệm',
  researcher: 'nghiên cứu — tra cứu, so sánh phương án',
  reviewer: 'reviewer — soát lỗi, rủi ro',
  architect: 'kiến trúc sư — thiết kế hệ thống, chia bước',
  scribe: 'thư ký — viết tài liệu, tóm tắt',
});
export const TOI_DA_VIEC_LOCAL = 3;
export const MS_CHIA_VIEC = 90_000;

// `\b` của JS chỉ hiểu chữ ASCII ("gì" kết thúc bằng "ì" thì `\bgì\b` không bao giờ khớp) → biên chữ theo \p{L}
const tuRieng = (ds, them = '') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${ds.join('|')})(?![\\p{L}\\p{N}])${them}`, 'iu');
const DONG_TU_VIEC = tuRieng([
  'viết', 'sửa', 'kiểm tra', 'kiểm thử', 'test', 'nghiên cứu', 'thiết kế', 'review', 'rà soát', 'soát',
  'tìm hiểu', 'phân tích', 'dựng', 'xây', 'triển khai', 'tối ưu', 'refactor', 'debug', 'lập kế hoạch',
  'soạn', 'tổng hợp', 'so sánh', 'đánh giá', 'cài đặt', 'làm giúp', 'làm cho',
]);
const DAU_HOI = /\?|(?<![\p{L}])(?:gì|sao|nhỉ|đâu|nào)(?![\p{L}])|(?<![\p{L}])(?:không|chưa|à|hả)\s*[.!]*$/iu;

/** Câu của Sếp có phải một YÊU CẦU VIỆC (đáng đi quy trình) không. Thuần. */
export function laYeuCauViec(cau) {
  const c = String(cau ?? '').trim();
  if (c.split(/\s+/).length < 4) return false;
  if (DAU_HOI.test(c)) return false;
  return DONG_TU_VIEC.test(c);
}

/** Đọc kế hoạch model trả về (JSON, có thể lẫn chữ / khối ```). Sai khuôn → []. Thuần. */
export function docKeHoach(text) {
  const s = String(text ?? '');
  const dau = s.indexOf('{');
  const cuoi = s.lastIndexOf('}');
  if (dau < 0 || cuoi <= dau) return [];
  let j;
  try {
    j = JSON.parse(s.slice(dau, cuoi + 1));
  } catch {
    return [];
  }
  const ds = Array.isArray(j?.viec) ? j.viec : [];
  const ra = [];
  for (const v of ds) {
    const vai = String(v?.vai ?? '').trim().toLowerCase();
    const viec = String(v?.viec ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!VAI_NHAN_VIEN_LOCAL[vai] || !viec) continue;
    ra.push({ vai, viec });
    if (ra.length >= TOI_DA_VIEC_LOCAL) break;
  }
  return ra;
}

const NHAC_LAP_KE_HOACH = [
  'Bạn là Nhi — Giám đốc kỹ thuật. Sếp (CEO) vừa giao một yêu cầu.',
  'Quyết định có cần CHIA VIỆC cho nhân viên không. Việc nhỏ, một người làm được thì KHÔNG chia.',
  `Chỉ dùng các vai: ${Object.entries(VAI_NHAN_VIEN_LOCAL).map(([k, v]) => `${k} (${v})`).join('; ')}.`,
  `Tối đa ${TOI_DA_VIEC_LOCAL} việc, mỗi việc một câu ngắn tiếng Việt.`,
  'CHỈ trả về JSON, không giải thích: {"viec":[{"vai":"builder","viec":"..."}]} — không chia thì {"viec":[]}.',
].join('\n');

const NHAC_DUYET = [
  'Bạn là Nhi — Giám đốc kỹ thuật, đang DUYỆT bài nhân viên nộp.',
  'Đạt khi bài làm đúng việc được giao, cụ thể, không bịa. Khắt khe nhưng công bằng.',
  'CHỈ trả về JSON: {"dat":true,"ly_do":"..."} hoặc {"dat":false,"ly_do":"cần sửa gì"}.',
].join('\n');

/** Đọc kết quả duyệt. Không đọc được ⇒ coi là ĐẠT (không bắt nhân viên làm lại vì model nói lan man). Thuần. */
export function docDuyet(text) {
  const s = String(text ?? '');
  const dau = s.indexOf('{');
  const cuoi = s.lastIndexOf('}');
  if (dau >= 0 && cuoi > dau) {
    try {
      const j = JSON.parse(s.slice(dau, cuoi + 1));
      if (typeof j?.dat === 'boolean') return { dat: j.dat, lyDo: String(j.ly_do ?? '').slice(0, 200) };
    } catch {
      /* rơi xuống dưới */
    }
  }
  return { dat: true, lyDo: 'không đọc được phiếu duyệt — mặc định kiểm nhận' };
}

const nhacNhanVien = (vai) =>
  [
    `Bạn là nhân viên ${VAI_NHAN_VIEN_LOCAL[vai] ?? vai} trong đội của Giám đốc Nhi.`,
    'Làm đúng việc được giao, nộp KẾT QUẢ ngắn gọn (≤ 5 câu tiếng Việt, có ý cụ thể). Không chào hỏi.',
  ].join('\n');

/**
 * Bộ chia việc. `chia({cau, model, signal})` chạy bước 1–5 và trả
 * `{ yeuCau: bool, ketQua: [{vai, viec, ok, traLoi}] }`; `xongLuot()` là bước 7.
 * Mọi lệnh sân khấu đi qua `team.event` (ws, nguồn `nao-local`).
 */
export function taoChiaViec({ san, ollama, ghi = console.log }) {
  let dem = 0;
  const gui = (args) => san.goi('team.event', { source: 'nao-local', ...args });
  return {
    async chia({ cau, model, signal }) {
      if (!laYeuCauViec(cau)) return { yeuCau: false, ketQua: [] };
      const luotId = `nl${Date.now().toString(36)}${(dem++).toString(36)}`;
      await gui({ kind: 'brief', id: `${luotId}-b` });
      await gui({ kind: 'work', id: `${luotId}-p`, tool: 'ke-hoach' });
      let keHoach = [];
      try {
        const msg = await ollama.chat({
          model,
          messages: [
            { role: 'system', content: NHAC_LAP_KE_HOACH },
            { role: 'user', content: String(cau) },
          ],
          signal,
        });
        keHoach = docKeHoach(msg.content);
      } catch (e) {
        if (signal?.aborted) throw e;
        ghi(`[nao-local] ${gio()} lập kế hoạch lỗi: ${e?.message ?? e} — Nhi tự làm`);
      }
      ghi(`[nao-local] ${gio()} KẾ HOẠCH: ${keHoach.length ? keHoach.map((k) => `${k.vai}: ${k.viec}`).join(' | ') : 'không chia, Nhi tự làm'}`);
      if (!keHoach.length) return { yeuCau: true, ketQua: [] };
      const viec = keHoach.map((k, i) => ({ ...k, id: `${luotId}-${i}` }));
      for (const v of viec) await gui({ kind: 'spawn', id: v.id, role: v.vai, task: v.viec });
      const ketQua = [];
      // Ollama phục vụ tuần tự: chạy lần lượt cho số đo dễ đọc, kết quả không đổi
      const lam = async (v, gopY) => {
        if (signal?.aborted) throw new LoiOllama('quá hạn', { quaHan: true });
        const msg = await ollama.chat({
          model,
          messages: [
            { role: 'system', content: nhacNhanVien(v.vai) },
            {
              role: 'user',
              content: `Yêu cầu của Sếp: «${String(cau)}»\nViệc của bạn: ${v.viec}${gopY ? `\nGiám đốc TRẢ LẠI bài trước, góp ý: ${gopY}` : ''}`,
            },
          ],
          signal,
        });
        return sachNoiDung(msg.content).slice(0, 600);
      };
      const duyet = async (v, bai) => {
        const msg = await ollama.chat({
          model,
          messages: [
            { role: 'system', content: NHAC_DUYET },
            { role: 'user', content: `Việc giao: ${v.viec}\nBài nộp của ${v.vai}: ${bai}` },
          ],
          signal,
        });
        return docDuyet(msg.content);
      };
      for (const v of viec) {
        let traLoi = '';
        let ok = false;
        let lyDo = '';
        try {
          traLoi = await lam(v);
          if (traLoi) {
            let d = await duyet(v, traLoi);
            if (!d.dat) {
              ghi(`[nao-local] ${gio()} TRẢ LẠI ${v.vai}: ${d.lyDo}`);
              await gui({ kind: 'rework', id: v.id });
              traLoi = await lam(v, d.lyDo);
              d = traLoi ? await duyet(v, traLoi) : { dat: false, lyDo: 'nộp trống' };
            }
            ok = d.dat;
            lyDo = d.lyDo;
          }
        } catch (e) {
          if (signal?.aborted) {
            await gui({ kind: 'fail', id: v.id });
            throw e;
          }
          ghi(`[nao-local] ${gio()} nhân viên ${v.vai} hỏng: ${e?.message ?? e}`);
        }
        ghi(`[nao-local] ${gio()} ${ok ? 'ĐÃ KIỂM NHẬN' : 'TRẢ LẠI'} ${v.vai}${lyDo ? ` — ${lyDo}` : ''}`);
        await gui({ kind: ok ? 'done' : 'fail', id: v.id });
        ketQua.push({ vai: v.vai, viec: v.viec, ok, traLoi, lyDo });
      }
      return { yeuCau: true, ketQua };
    },
    async xongLuot(ok = true) {
      await gui({ kind: 'report', id: `nl${Date.now().toString(36)}r${(dem++).toString(36)}`, ok });
    },
  };
}

/** Phần thêm vào dòng nhắc của Nhi: kết quả nhân viên để DUYỆT + tổng hợp báo Sếp. */
export function nhacTongHop(ketQua) {
  if (!ketQua?.length) return '';
  const dong = ketQua
    .map((k) => `- ${k.vai} («${k.viec}»): ${k.ok ? `[ĐÃ KIỂM NHẬN] ${k.traLoi}` : `[TRẢ LẠI] ${k.lyDo || 'không đạt'}`}`)
    .join(' ');
  return ` | ĐỘI ĐÃ NỘP BÀI (em là Giám đốc, đã đóng dấu từng bài: chỉ TỔNG HỢP bài ĐÃ KIỂM NHẬN thành MỘT câu trả lời ngắn cho Sếp bằng actor_say, bài TRẢ LẠI thì nói thật là chưa xong) ${dong}`;
}

/* ================================================================ 6. driver */

/**
 * Dựng trọn driver (dùng cho `chay()` và test): nối bridge, dò Ollama, nghe câu.
 * Trả `{ san, doNao, hangDoi, dong, nhatKy }`.
 */
export async function batDriver({
  WebSocket,
  cong,
  token = '',
  ollamaUrl = OLLAMA_MAC_DINH,
  muonModel = '',
  fetch: f = globalThis.fetch,
  ghi = console.log,
  msGop = MS_GOP_MAC_DINH,
  msHan = MS_HAN_LOCAL,
  msXinCho = MS_XIN_CHO,
  msDo = MS_DO_MODEL,
  msNhipTim = MS_NHIP_TIM_MAC_DINH,
  msQuaHanTim = MS_QUA_HAN_TIM_MAC_DINH,
  backoff = { min: MS_BACKOFF_MIN, max: MS_BACKOFF_MAX },
  khiXongLuot = () => {},
  layPersona = docPersona,
  msGiuaIde = MS_GIUA_LUOT_IDE,
  msChiaViec = MS_CHIA_VIEC,
}) {
  const san = await noiSanKhau({ WebSocket, cong, token, ghi, msNhipTim, msQuaHanTim, backoff });
  const ollama = taoOllama({ url: ollamaUrl, fetch: f, msDo });
  const { tools, banDo } = sinhToolLocal({ ghi });
  let actors = ACTOR_MAC_DINH;
  const capNhatActors = (ds) => {
    if (Array.isArray(ds) && ds.length) actors = ds.map((a) => ({ id: a.id, controlledBy: a.controlledBy ?? 'agent' }));
  };
  const doNao = taoDoNao({
    ollama,
    muon: muonModel,
    ghi,
    backoff,
    bao: async () => {
      const kq = await san.goi('actor.say', { actor: 'gen', text: CAU_CHUA_CO_NAO, emotion: 'boi-roi', interrupt: true });
      return kq.ok;
    },
  });
  const layTools = taoToolSong({ san, tools, banDo, ghi });
  const chiaViec = taoChiaViec({ san, ollama, ghi });
  const luot = taoLuotLocal({ san, ollama, doNao, tools, banDo, layTools, capNhatActors, ghi, msHan, msXinCho, layPersona, chiaViec, msChiaViec });
  const nhatKy = [];
  const hangDoi = taoHangDoi({
    chay: async (x) => {
      const kq = await luot(x);
      nhatKy.push(kq);
      khiXongLuot(kq);
    },
  });
  // Cửa sổ gộp 800 ms tách THEO NGƯỜI NHẬN: hai câu gọi hai người khác nhau ("Gen ơi…",
  // "Mai ơi…") thành hai lượt riêng, mỗi người một lượt. Cách khác (lấy người của câu
  // đầu/cuối cho cả cụm) luôn bỏ rơi hoặc nhét nhầm câu của một trong hai người.
  const gopTheoNguoi = new Map(); // id → { gop, tDau }
  const gopCua = (ng) => {
    let g = gopTheoNguoi.get(ng);
    if (!g) {
      g = { tDau: null, gop: null };
      g.gop = taoGop({
        msGop,
        xong: (cau) => {
          hangDoi.them({ cau, nguoiTraLoi: ng, t0: g.tDau ?? Date.now() });
          g.tDau = null;
        },
      });
      gopTheoNguoi.set(ng, g);
    }
    return g;
  };
  const trung = taoLocTrung();

  san.khiSuKien((event, data) => {
    if (event === 'bridge.stageOnline') void lamMoiActors();
    if (!laCauCuaSep(event, data)) return;
    // câu "của" chính một nhân vật agent → không nghe (chặn vòng lặp, mở rộng ngoài `gen`)
    if (actors.some((a) => a.id === String(data.actor ?? '') && a.controlledBy === 'agent')) return;
    const ng = chonNguoiTraLoi(data.text, actors, data.to);
    if (!ng) {
      ghi(`[nao-local] ${gio()} bỏ qua «${data.text}» — người nhận là nhân vật của Sếp (lớp hiểu lệnh lo).`);
      return;
    }
    if (trung(data)) return; // text + speech cùng một câu mic → chỉ nghe một lần
    const g = gopCua(ng);
    if (g.gop.dangCho() === 0) {
      g.tDau = Date.now();
      phanXa(san, ng);
    }
    g.gop.nhan(data.text);
  });

  async function lamMoiActors() {
    const mt = await san.goi('stage.describe', {});
    if (mt.ok) capNhatActors(mt.result?.actors);
  }

  // V3 — giác quan IDE: test/task/git good|bad → một lượt cho Gen (≥ 60 s giữa hai lượt IDE);
  // câu của Sếp (đang gộp ở bất kỳ người nhận nào / đang xếp hàng / đang chạy) luôn thắng.
  gannNgheIde({
    san,
    msGop,
    msGiua: msGiuaIde,
    ghi,
    sepBan: () => [...gopTheoNguoi.values()].some((g) => g.gop.dangCho() > 0) || hangDoi.dangChay() || hangDoi.doDai() > 0,
    themLuot: (x) => hangDoi.them({ ...x, nguoiTraLoi: 'gen' }),
  });

  if (await san.choMo()) await lamMoiActors();
  void doNao.lay();

  return {
    san,
    doNao,
    hangDoi,
    nhatKy,
    tools,
    dong() {
      doNao.dong();
      san.dong();
    },
  };
}

export async function chay() {
  giuKhoaHoacThoat({ ten: 'nao-local', tienTo: `[nao-local] ${gio()}` });
  const { default: WebSocket } = await import('ws');
  const cong = process.env.GEN_STAGE_PORT ?? '8787';
  const ollamaUrl = process.env.GEN_STAGE_OLLAMA_URL ?? OLLAMA_MAC_DINH;
  const muonModel = process.env.GEN_STAGE_OLLAMA_MODEL ?? '';
  console.log(`[nao-local] ${gio()} driver não local · bridge ${cong} · Ollama ${ollamaUrl} · model ${muonModel || '(tự chọn)'}`);
  const d = await batDriver({
    WebSocket,
    cong,
    token: process.env.GEN_STAGE_TOKEN ?? '',
    ollamaUrl,
    muonModel,
    msGop: Number(process.env.GEN_STAGE_NAO_GOP ?? MS_GOP_MAC_DINH),
    msHan: Number(process.env.GEN_STAGE_NAO_LOCAL_HAN ?? MS_HAN_LOCAL),
    msXinCho: Number(process.env.GEN_STAGE_NAO_LOCAL_XIN_CHO ?? MS_XIN_CHO),
    msNhipTim: Number(process.env.GEN_STAGE_NAO_NHIP_TIM ?? MS_NHIP_TIM_MAC_DINH),
    msQuaHanTim: Number(process.env.GEN_STAGE_NAO_QUA_HAN_TIM ?? MS_QUA_HAN_TIM_MAC_DINH),
  });
  console.log(`[nao-local] ${gio()} ${d.tools.length} tool · đang nghe user.text/user.speech + ide.event (test/task/git).`);
  for (const tin of ['SIGINT', 'SIGTERM']) {
    process.on(tin, () => {
      console.log(`[nao-local] ${gio()} tắt driver.`);
      d.dong();
      process.exit(0);
    });
  }
}

function gio() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

/* Chạy trực tiếp thì bật; `import` (test) thì không. */
if (process.argv[1] && /nao-local\.mjs$/.test(process.argv[1])) void chay();
