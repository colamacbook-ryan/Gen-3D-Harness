/**
 * Cửa Origin của bridge (review bảo mật 28/10): trang web lạ trong trình duyệt của Sếp
 * không được nối bridge (WebSocket không có CORS) — không thì nó ký thay Sếp (`team.sign`)
 * hay giả giọng Sếp (`stage.hear`). Client không phải trình duyệt (không Origin) vẫn nối.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { nguonDuocPhep } from '../../../bridge/nguon';

describe('nguonDuocPhep (thuần)', () => {
  it('không Origin = tiến trình trên máy ⇒ cho', () => {
    expect(nguonDuocPhep(undefined, '127.0.0.1:8787', false)).toBe(true);
  });
  it('trang của chính máy + webview VS Code ⇒ cho', () => {
    for (const o of ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173', 'vscode-webview://abc123']) {
      expect(nguonDuocPhep(o, '127.0.0.1:8787', false), o).toBe(true);
    }
  });
  it('trang lạ / null / hỏng / file ⇒ từ chối', () => {
    for (const o of ['https://evil.example', 'http://127.0.0.1.evil.example', 'null', 'file://', 'rác', 'http://192.168.1.5:5173']) {
      expect(nguonDuocPhep(o, '127.0.0.1:8787', false), o).toBe(false);
    }
  });
  it('mở ra ngoài (--host): chỉ thêm trang CÙNG máy với địa chỉ bridge đang được gọi', () => {
    expect(nguonDuocPhep('http://192.168.1.5:5173', '192.168.1.5:8787', true)).toBe(true);
    expect(nguonDuocPhep('http://192.168.1.9:5173', '192.168.1.5:8787', true)).toBe(false);
    expect(nguonDuocPhep('https://evil.example', 'evil.example:8787', false)).toBe(false);
  });
});

describe('bridge thật', () => {
  const CONG = Number(process.env.GEN_STAGE_TEST_CONG_ORIGIN ?? 8941);
  let bridge: ChildProcess;
  const noi = (headers: Record<string, string> = {}) =>
    new Promise<string>((res) => {
      const w = new WebSocket(`ws://127.0.0.1:${CONG}/`, { headers });
      w.on('message', (t) => {
        const g = JSON.parse(String(t));
        if (g.event === 'bridge.hello') {
          w.close();
          res('noi');
        }
      });
      w.on('unexpected-response', (_r, resp) => res(`tu-choi-${resp.statusCode}`));
      w.on('error', () => res('loi'));
    });

  beforeAll(async () => {
    bridge = spawn('node_modules/.bin/tsx', ['bridge/server.ts'], {
      stdio: 'ignore',
      detached: true,
      env: {
        ...process.env,
        GEN_STAGE_PORT: String(CONG),
        GEN_STAGE_TTS_PORT: String(CONG + 1),
        GEN_STAGE_MCP_PORT: String(CONG + 2),
        GEN_STAGE_STT_PORT: String(CONG + 3),
      },
    });
    for (let i = 0; i < 60; i++) {
      if ((await noi()) === 'noi') return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('bridge không lên');
  }, 30000);
  afterAll(() => {
    try {
      process.kill(-bridge.pid!, 'SIGTERM');
    } catch {
      /* đã tắt */
    }
  });

  it('trang web lạ bị chặn ngay ở bắt tay (401)', async () => {
    expect(await noi({ Origin: 'https://evil.example' })).toBe('tu-choi-401');
  });
  it('trang sân khấu / Bàn duyệt của máy vẫn nối', async () => {
    expect(await noi({ Origin: 'http://127.0.0.1:5173' })).toBe('noi');
  });
  it('WebSocket toàn cục của Node (extension VS Code dùng) vẫn nối', async () => {
    const WS = (globalThis as { WebSocket?: typeof globalThis.WebSocket }).WebSocket;
    if (!WS) return;
    const kq = await new Promise<string>((res) => {
      const w = new WS(`ws://127.0.0.1:${CONG}/`);
      w.addEventListener('message', () => {
        w.close();
        res('noi');
      });
      w.addEventListener('error', () => res('loi'));
    });
    expect(kq).toBe('noi');
  });
});
