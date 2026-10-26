/**
 * nao-local.test.mjs — driver não local (V1) chạy THẬT qua mạng nội bộ:
 *   - bridge GIẢ: WebSocketServer cổng 8860 (đóng vai bridge + sân khấu: trả
 *     pong, trả lệnh, phát sự kiện user.text như bridge thật phát xuống client);
 *   - Ollama GIẢ: HTTP cổng 8861 trả `tool_calls`/`content` theo kịch bản;
 *   - cổng 8862 bỏ trống = "Ollama đang tắt".
 * Driver nối ws `?role=nao`, gọi `/v1/chat/completions` bằng fetch thật.
 */
import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import {
  CAU_CHUA_CO_NAO,
  DANH_SACH_TRANG,
  batDriver,
  docPersona,
  chonNguoiTraLoi,
  sachNoiDung,
  sinhToolLocal,
} from '../nao-local.mjs';

// GEN_STAGE_TEST_CONG: đổi cổng gốc khi nhiều phiên cùng chạy test trên một máy
const CONG_GOC = Number(process.env.GEN_STAGE_TEST_CONG ?? 8860);
const CONG_BRIDGE = CONG_GOC;
const CONG_OLLAMA = CONG_GOC + 1;
const CONG_TAT = CONG_GOC + 2;
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ bridge giả */
const bridge = { wss: null, lenh: [], url: [], clients: new Set() };
const ACTORS = [
  { id: 'owner', controlledBy: 'owner', pos: [0, 0, 0] },
  { id: 'gen', controlledBy: 'agent', pos: [1, 0, 1] },
  { id: 'mai', controlledBy: 'agent', pos: [2, 0, 1] },
];
function phat(event, data) {
  for (const c of bridge.clients) c.send(JSON.stringify({ event, data }));
}

/* ------------------------------------------------------------ Ollama giả */
const ollama = { server: null, kichBan: [], yeuCau: [], models: ['qwen-gia'] };
function traLoi(msg) {
  return { choices: [{ index: 0, message: { role: 'assistant', content: '', ...msg }, finish_reason: 'stop' }] };
}
function goiTool(ten, args, id = `c-${Math.random().toString(36).slice(2, 7)}`) {
  return { id, type: 'function', function: { name: ten, arguments: JSON.stringify(args) } };
}

beforeAll(async () => {
  bridge.wss = new WebSocketServer({ host: '127.0.0.1', port: CONG_BRIDGE });
  bridge.wss.on('connection', (ws, req) => {
    bridge.url.push(req.url);
    bridge.clients.add(ws);
    ws.on('close', () => bridge.clients.delete(ws));
    ws.on('message', (tho) => {
      const g = JSON.parse(String(tho));
      if (g.ping !== undefined) return ws.send(JSON.stringify({ pong: g.ping }));
      if (!g.cmd) return;
      bridge.lenh.push({ cmd: g.cmd, args: g.args ?? {} });
      const result = g.cmd === 'stage.describe' ? { actors: ACTORS, screens: [], modules: [] } : {};
      ws.send(JSON.stringify({ id: g.id, ok: true, result }));
      if (g.cmd === 'actor.say') {
        setTimeout(() => phat('actor.sayStart', { actor: g.args.actor, text: g.args.text }), 5);
      }
    });
  });
  ollama.server = createServer((req, res) => {
    let than = '';
    req.on('data', (d) => (than += d));
    req.on('end', () => {
      const tra = (j, ma = 200) => {
        res.writeHead(ma, { 'content-type': 'application/json' });
        res.end(JSON.stringify(j));
      };
      if (req.url === '/v1/models') return tra({ object: 'list', data: ollama.models.map((id) => ({ id, object: 'model' })) });
      if (req.url === '/api/show') return tra({ capabilities: ['completion', 'tools'] });
      if (req.url === '/v1/chat/completions') {
        ollama.yeuCau.push(JSON.parse(than));
        const buoc = ollama.kichBan.shift() ?? { content: 'Dạ' };
        return tra(traLoi(buoc));
      }
      tra({ error: 'không có' }, 404);
    });
  });
  await new Promise((r) => ollama.server.listen(CONG_OLLAMA, '127.0.0.1', r));
});

afterAll(async () => {
  for (const c of bridge.clients) c.terminate();
  await new Promise((r) => bridge.wss.close(r));
  await new Promise((r) => ollama.server.close(r));
});

let driver = null;
const ghiLai = [];
async function bat(opts = {}) {
  bridge.lenh.length = 0;
  ollama.yeuCau.length = 0;
  ghiLai.length = 0;
  driver = await batDriver({
    WebSocket,
    cong: CONG_BRIDGE,
    ollamaUrl: `http://127.0.0.1:${CONG_OLLAMA}`,
    ghi: (...a) => ghiLai.push(a.join(' ')),
    msGop: 30,
    msXinCho: 10_000,
    backoff: { min: 40, max: 80 },
    ...opts,
  });
  await ngu(50);
  // bỏ describe lúc khởi động (giữ lại câu báo "chưa có não" nếu có)
  const giu = bridge.lenh.filter((l) => l.cmd !== 'stage.describe');
  bridge.lenh.length = 0;
  bridge.lenh.push(...giu);
  return driver;
}
afterEach(() => {
  driver?.dong();
  driver = null;
  ollama.kichBan.length = 0;
});

/** Sếp gõ → bridge phát user.text; chờ hàng đợi rảnh. */
async function sepNoi(data) {
  phat('user.text', { actor: 'owner', ...data });
  await ngu(80); // qua cửa sổ gộp 30 ms
  await driver.hangDoi.choHet();
  await ngu(30);
}
const lenhSay = () => bridge.lenh.filter((l) => l.cmd === 'actor.say');

/* -------------------------------------------------------------- thuần */

describe('nao-local — phần thuần', () => {
  it('sinh đúng 10 tool từ registry (cùng hàm MCP), đúng format OpenAI', () => {
    const { tools, thieu } = sinhToolLocal({ ghi: () => {} });
    expect(thieu).toEqual([]);
    expect(tools.map((t) => t.function.name)).toEqual([...DANH_SACH_TRANG]);
    const say = tools.find((t) => t.function.name === 'actor_say');
    expect(say.type).toBe('function');
    expect(say.function.parameters.required).toEqual(expect.arrayContaining(['actor', 'text']));
  });

  it('tool registry không có thì bỏ + ghi log', () => {
    const log = [];
    const { tools, thieu } = sinhToolLocal({ trang: ['actor_say', 'khong_co'], ghi: (m) => log.push(m) });
    expect(tools).toHaveLength(1);
    expect(thieu).toEqual(['khong_co']);
    expect(log.join()).toMatch(/khong_co/);
  });

  it('người trả lời: tên gọi > to > gen; Javis không bao giờ', () => {
    expect(chonNguoiTraLoi('hôm nay làm gì', ACTORS)).toBe('gen');
    expect(chonNguoiTraLoi('hôm nay làm gì', ACTORS, 'camera')).toBe('gen');
    expect(chonNguoiTraLoi('hôm nay làm gì', ACTORS, 'owner')).toBeNull();
    expect(chonNguoiTraLoi('Gen ơi hôm nay làm gì', ACTORS, 'owner')).toBe('gen');
    expect(chonNguoiTraLoi('Javis ơi hát đi', ACTORS)).toBeNull();
  });

  it('sachNoiDung bỏ <think> và gọn khoảng trắng', () => {
    expect(sachNoiDung('<think>abc\nxyz</think>\n Dạ  Sếp ')).toBe('Dạ Sếp');
  });
});

/* -------------------------------------------------- qua mạng (giả) */

describe('nao-local — driver chạy thật với bridge + Ollama giả', () => {
  it('nối bridge bằng ?role=nao', async () => {
    await bat();
    expect(bridge.url.some((u) => /role=nao/.test(u))).toBe(true);
  });

  it('(a) Sếp hỏi → model gọi actor_say gen → sân khấu nhận đúng lệnh', async () => {
    await bat();
    ollama.kichBan.push(
      { tool_calls: [goiTool('actor_say', { actor: 'gen', text: 'Dạ em chào Sếp', interrupt: true })] },
      { content: '' },
    );
    await sepNoi({ text: 'Chào em' });
    expect(lenhSay()).toEqual([{ cmd: 'actor.say', args: { actor: 'gen', text: 'Dạ em chào Sếp', interrupt: true } }]);
    // phản xạ: turnTo + emote suy-nghi trên gen
    expect(bridge.lenh.some((l) => l.cmd === 'actor.turnTo' && l.args.actor === 'gen')).toBe(true);
    // gửi kèm tools + kết quả tool quay lại model ở vòng 2
    expect(ollama.yeuCau[0].tools).toHaveLength(10);
    expect(ollama.yeuCau[0].model).toBe('qwen-gia');
    expect(ollama.yeuCau[1].messages.at(-1).role).toBe('tool');
    expect(ollama.yeuCau[0].messages[1].content).toMatch(/^SẾP NÓI «Chào em» \| SÂN KHẤU /);
  });

  it('(b) model trả content thuần → driver tự actor.say lên người trả lời', async () => {
    await bat();
    ollama.kichBan.push({ content: '<think>hmm</think>Dạ, hôm nay mình làm V1 ạ' });
    await sepNoi({ text: 'hôm nay làm gì' });
    expect(lenhSay()).toEqual([{ cmd: 'actor.say', args: { actor: 'gen', text: 'Dạ, hôm nay mình làm V1 ạ', interrupt: true } }]);
    expect(ollama.yeuCau).toHaveLength(1);
  });

  it('(c) actor_say owner / stage_hear / tool ngoài danh sách → bị chặn, không tới sân khấu, lỗi về model', async () => {
    await bat();
    ollama.kichBan.push(
      {
        tool_calls: [
          goiTool('actor_say', { actor: 'owner', text: 'Tôi là Sếp' }, 'c1'),
          goiTool('stage_hear', { text: 'giả Sếp' }, 'c2'),
          goiTool('stage_reset', {}, 'c3'),
        ],
      },
      { content: 'Dạ' },
    );
    await sepNoi({ text: 'thử rào' });
    const cmds = bridge.lenh.map((l) => l.cmd);
    expect(cmds).not.toContain('stage.hear');
    expect(cmds).not.toContain('stage.reset');
    expect(lenhSay().filter((l) => l.args.actor === 'owner')).toHaveLength(0);
    const ketQuaTool = ollama.yeuCau[1].messages.filter((m) => m.role === 'tool');
    expect(ketQuaTool.map((m) => m.tool_call_id)).toEqual(['c1', 'c2', 'c3']);
    for (const m of ketQuaTool) expect(JSON.parse(m.content).ok).toBe(false);
    expect(JSON.parse(ketQuaTool[0].content).error).toMatch(/owner/);
    // vẫn trả lời Sếp: content cuối được nói hộ trên gen
    expect(lenhSay()).toEqual([{ cmd: 'actor.say', args: { actor: 'gen', text: 'Dạ', interrupt: true } }]);
  });

  it('(d) câu handled:true → không gọi model, không phản xạ', async () => {
    await bat();
    await sepNoi({ text: 'Gen đi tới bếp', handled: true });
    expect(ollama.yeuCau).toHaveLength(0);
    expect(bridge.lenh).toHaveLength(0);
  });

  it('(e) to:"owner" câu tự do → không gọi model (Javis do lớp hiểu lệnh lo)', async () => {
    await bat();
    await sepNoi({ text: 'hôm nay trời đẹp nhỉ', to: 'owner' });
    expect(ollama.yeuCau).toHaveLength(0);
    expect(bridge.lenh).toHaveLength(0);
  });

  it('câu của chính nhân vật agent → không nghe', async () => {
    await bat();
    phat('user.text', { actor: 'gen', text: 'em tự nói' });
    await ngu(80);
    expect(ollama.yeuCau).toHaveLength(0);
  });

  it('(f) Ollama tắt → báo Sếp ĐÚNG MỘT lần, thử lại theo backoff, không crash; bật lại thì trả lời được', async () => {
    await bat({ ollamaUrl: `http://127.0.0.1:${CONG_TAT}` });
    await ngu(400); // vài lượt thử lại (backoff 40→80 ms)
    await sepNoi({ text: 'có ai không' });
    await ngu(200);
    const bao = lenhSay().filter((l) => l.args.text === CAU_CHUA_CO_NAO);
    expect(bao).toHaveLength(1);
    expect(ghiLai.filter((l) => /CHƯA CÓ NÃO LOCAL/.test(l)).length).toBeGreaterThanOrEqual(3);
    expect(driver.doNao.model()).toBeNull();
    expect(lenhSay().filter((l) => l.args.text !== CAU_CHUA_CO_NAO)).toHaveLength(0);

    // bật "Ollama" ở đúng cổng đó → vòng thử lại tự tìm thấy, lượt sau trả lời được
    const song = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'hoi-sinh' }] }));
      if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['tools'] }));
      res.end(JSON.stringify(traLoi({ content: 'Em về rồi ạ' })));
    });
    await new Promise((r) => song.listen(CONG_TAT, '127.0.0.1', r));
    try {
      await ngu(250);
      expect(driver.doNao.model()).toBe('hoi-sinh');
      await sepNoi({ text: 'giờ thì sao' });
      expect(lenhSay().at(-1).args.text).toBe('Em về rồi ạ');
      expect(lenhSay().filter((l) => l.args.text === CAU_CHUA_CO_NAO)).toHaveLength(1);
    } finally {
      song.closeAllConnections?.();
      await new Promise((r) => song.close(r));
    }
  });

  it('(g) model gọi tool mãi → dừng ở 3 vòng, vẫn nói với Sếp', async () => {
    await bat();
    for (let i = 0; i < 5; i++) {
      ollama.kichBan.push({ tool_calls: [goiTool('actor_emote', { actor: 'gen', emote: 'vui' })] });
    }
    await sepNoi({ text: 'nhảy đi' });
    expect(ollama.yeuCau).toHaveLength(3);
    expect(bridge.lenh.filter((l) => l.cmd === 'actor.emote' && l.args.emote === 'vui')).toHaveLength(3);
    // không actor_say nào, không content → driver nói câu dự phòng đúng một lần
    expect(lenhSay()).toHaveLength(1);
    expect(lenhSay()[0].args.actor).toBe('gen');
  });

  it('model quên "actor" → điền người trả lời, không bao giờ owner', async () => {
    await bat();
    ollama.kichBan.push({ tool_calls: [goiTool('actor_say', { text: 'Dạ' })] }, { content: '' });
    await sepNoi({ text: 'ê' });
    expect(lenhSay()).toEqual([{ cmd: 'actor.say', args: { text: 'Dạ', actor: 'gen' } }]);
  });

  it('quá hạn lượt → xin Sếp hỏi lại, không treo hàng đợi', async () => {
    await bat({ msHan: 150 });
    // Ollama giả chậm: chặn bằng một kịch bản "treo" qua server tạm
    const cham = createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'cham' }] }));
      }
      if (req.url === '/api/show') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ capabilities: ['tools'] }));
      }
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(traLoi({ content: 'muộn' })));
      }, 600);
    });
    await new Promise((r) => cham.listen(CONG_TAT, '127.0.0.1', r));
    try {
      driver.dong();
      driver = await batDriver({
        WebSocket,
        cong: CONG_BRIDGE,
        ollamaUrl: `http://127.0.0.1:${CONG_TAT}`,
        ghi: () => {},
        msGop: 30,
        msHan: 150,
        backoff: { min: 40, max: 80 },
      });
      await ngu(100);
      bridge.lenh.length = 0;
      await sepNoi({ text: 'nghĩ lâu đi' });
      const say = lenhSay();
      expect(say).toHaveLength(1);
      expect(say[0].args.text).toMatch(/lâu/);
    } finally {
      cham.closeAllConnections?.();
      await new Promise((r) => cham.close(r));
    }
  });
});

describe('docPersona — id actor không được thoát khỏi thư mục persona (review bảo mật 26/10)', () => {
  it('id có / hoặc .. → không đọc file, trả persona mặc định', () => {
    for (const xau of ['../../etc/passwd', 'a/b', '..', '', 'x'.repeat(40)]) {
      expect(docPersona(xau)).toMatch(/^# Em là /);
    }
  });
  it('id hợp lệ "gen" vẫn đọc file persona có sẵn', () => {
    expect(docPersona('gen')).not.toMatch(/^# Em là gen\n\nEm là nhân vật/);
  });
});


/* ============================================== review 26/10 (V1, vòng sửa) */

describe('nao-local — review: dò model treo, arguments lạ, câu trùng, gộp, daNoi', () => {
  /** fetch giả: /v1/models treo (chỉ kết thúc khi signal huỷ) `soLanTreo` lần đầu, sau đó chuyển cho fetch thật. */
  function fetchTreo(soLanTreo) {
    let n = 0;
    return (url, init = {}) => {
      if (String(url).endsWith('/v1/models') && n++ < soLanTreo) {
        return new Promise((_, rej) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = init.signal.reason?.name ?? 'AbortError';
            rej(e);
          });
        });
      }
      return globalThis.fetch(url, init);
    };
  }

  it('(1a) dò model treo → fetch có timeout, lượt không kẹt, lượt sau dò lại và trả lời được', async () => {
    await bat({ fetch: fetchTreo(1), msDo: 80, msHan: 5000 });
    phat('user.text', { actor: 'owner', text: 'câu một' });
    await ngu(400);
    expect(driver.hangDoi.dangChay()).toBe(false);
    ollama.kichBan.push({ content: 'Dạ câu hai' });
    await sepNoi({ text: 'câu hai' });
    expect(lenhSay().at(-1).args.text).toBe('Dạ câu hai');
  });

  it('(1b) dò treo lâu hơn hạn lượt → hạn lượt bao cả bước dò: xin hỏi lại, không treo', async () => {
    await bat({ fetch: fetchTreo(1), msDo: 5000, msHan: 150 });
    phat('user.text', { actor: 'owner', text: 'câu một' });
    await ngu(500);
    expect(driver.hangDoi.dangChay()).toBe(false);
    expect(lenhSay().some((l) => /lâu/.test(l.args.text))).toBe(true);
  });

  it('(3) arguments "null"/mảng/số/chuỗi → báo model như JSON không hợp lệ, không ném TypeError', async () => {
    await bat();
    for (const a of ['null', '[1,2]', '42', '"abc"']) {
      ollama.yeuCau.length = 0;
      ollama.kichBan.push({ tool_calls: [{ id: 'x', type: 'function', function: { name: 'actor_say', arguments: a } }] }, { content: 'Dạ ổn' });
      await sepNoi({ text: `thử ${a}` });
      const kq = driver.nhatKy.at(-1);
      expect(kq.ok, a).toBe(true);
      expect(kq.toolCalls[0].chan, a).toMatch(/không phải JSON/);
      expect(JSON.parse(ollama.yeuCau[1].messages.at(-1).content).ok).toBe(false);
    }
  });

  it('(4) user.text + user.speech cùng câu trong 1,5 s → MỘT lượt, prompt không lặp', async () => {
    await bat({ msGop: 60 });
    ollama.kichBan.push({ content: 'Dạ chào Sếp' });
    phat('user.text', { actor: 'owner', text: 'xin chào', to: 'camera' });
    phat('user.speech', { actor: 'owner', text: 'xin chào', to: 'camera' });
    await ngu(200);
    await driver.hangDoi.choHet();
    expect(ollama.yeuCau).toHaveLength(1);
    expect(ollama.yeuCau[0].messages[1].content).toMatch(/SẾP NÓI «xin chào» \|/);
  });

  it('(5a) cửa sổ gộp: hai câu gọi hai người khác nhau → hai lượt riêng, mỗi người một lượt', async () => {
    await bat({ msGop: 100 });
    ollama.kichBan.push({ content: 'Dạ Gen đây' }, { content: 'Dạ Mai đây' });
    phat('user.text', { actor: 'owner', text: 'Gen ơi chào đi' });
    phat('user.text', { actor: 'owner', text: 'Mai ơi chào đi' });
    await ngu(300);
    await driver.hangDoi.choHet();
    await ngu(30);
    expect(ollama.yeuCau).toHaveLength(2);
    expect(ollama.yeuCau.map((y) => y.messages[0].content.match(/actor "(\w+)"/)[1]).sort()).toEqual(['gen', 'mai']);
    expect(lenhSay().map((l) => l.args.actor).sort()).toEqual(['gen', 'mai']);
  });

  it('(5b) daNoi chỉ tính khi actor_say lên ĐÚNG người trả lời: model cho mai nói hộ gen → driver vẫn nói cho gen', async () => {
    await bat();
    ollama.kichBan.push({ tool_calls: [goiTool('actor_say', { actor: 'mai', text: 'Em là Mai' })] }, { content: '' });
    await sepNoi({ text: 'Gen ơi, chào' });
    const say = lenhSay();
    expect(say.some((l) => l.args.actor === 'mai')).toBe(true);
    expect(say.some((l) => l.args.actor === 'gen')).toBe(true);
  });

  it('(5c) log "BẮT ĐẦU NÓI" không tính câu "xin chờ"', async () => {
    const cham = (url, init = {}) =>
      String(url).endsWith('/v1/chat/completions')
        ? ngu(350).then(() => globalThis.fetch(url, init))
        : globalThis.fetch(url, init);
    await bat({ fetch: cham, msXinCho: 60 });
    ollama.kichBan.push({ tool_calls: [goiTool('actor_say', { actor: 'gen', text: 'Dạ xong rồi' })] }, { content: '' });
    await sepNoi({ text: 'nghĩ chậm đi' });
    const dong = ghiLai.filter((l) => /BẮT ĐẦU NÓI/.test(l));
    expect(dong).toHaveLength(1);
    expect(Number(dong[0].match(/sau (\d+) ms/)[1])).toBeGreaterThanOrEqual(300);
  });
});

describe('nao-local — V3 giác quan IDE', () => {
  it('ide.event test bad → MỘT lượt cho gen, nhắc "VIỆC THẬT", không phản xạ turnTo; lần hai trong 60 s bị bỏ', async () => {
    await bat();
    ollama.kichBan.push({ content: 'Test đỏ rồi Sếp, để em xem cùng' });
    phat('ide.event', { kind: 'save', level: 'info', summary: 'Lưu 1 file: a.ts' });
    phat('ide.event', { kind: 'test', level: 'bad', summary: 'Test "unit" fail (mã 1)' });
    await ngu(120);
    await driver.hangDoi.choHet();
    await ngu(30);
    expect(ollama.yeuCau).toHaveLength(1);
    expect(ollama.yeuCau[0].messages[1].content).toMatch(/^VIỆC THẬT TRONG IDE CỦA SẾP «Sếp vừa chạy test — hỏng: Test "unit" fail \(mã 1\)»/);
    expect(bridge.lenh.some((l) => l.cmd === 'actor.turnTo')).toBe(false);
    // driver nói hộ câu của model, KHÔNG cắt ngang (ưu tiên thấp)
    expect(lenhSay()).toEqual([{ cmd: 'actor.say', args: { actor: 'gen', text: 'Test đỏ rồi Sếp, để em xem cùng', interrupt: false } }]);
    phat('ide.event', { kind: 'git', level: 'good', summary: 'Commit abc1234: sửa' });
    await ngu(120);
    await driver.hangDoi.choHet();
    expect(ollama.yeuCau).toHaveLength(1);
  });

  it('câu Sếp và sự kiện IDE cùng lúc → chỉ câu Sếp thành lượt', async () => {
    await bat({ msGop: 60 });
    ollama.kichBan.push({ content: 'Dạ' });
    phat('user.text', { actor: 'owner', text: 'Gen ơi', to: 'camera' });
    phat('ide.event', { kind: 'test', level: 'bad', summary: 'fail' });
    await ngu(200);
    await driver.hangDoi.choHet();
    expect(ollama.yeuCau).toHaveLength(1);
    expect(ollama.yeuCau[0].messages[1].content).toMatch(/^SẾP NÓI «Gen ơi»/);
  });

  it('model im lặng ở lượt IDE → không nói câu dự phòng', async () => {
    await bat({ msGiuaIde: 0 });
    ollama.kichBan.push({ content: '' });
    phat('ide.event', { kind: 'git', level: 'good', summary: 'Commit abc1234: sửa' });
    await ngu(120);
    await driver.hangDoi.choHet();
    await ngu(30);
    expect(ollama.yeuCau).toHaveLength(1);
    expect(lenhSay()).toEqual([]);
  });
});
