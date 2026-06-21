import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickModelProvider, callModel } from '../mcp/model.js';

describe('pickModelProvider', () => {
  it('auto-picks the first configured provider in stable order', () => {
    expect(pickModelProvider({ OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a' })).toMatchObject({
      id: 'anthropic',
      key: 'a',
    });
    expect(pickModelProvider({ OPENAI_API_KEY: 'o' })).toMatchObject({ id: 'openai', key: 'o' });
    expect(pickModelProvider({ OPENROUTER_API_KEY: 'r' })).toMatchObject({ id: 'openrouter', key: 'r' });
    expect(pickModelProvider({ GOOGLE_API_KEY: 'g' })).toMatchObject({ id: 'google', key: 'g' });
  });

  it('supports forced provider + model overrides', () => {
    expect(
      pickModelProvider({
        REPOLENS_MCP_PROVIDER: 'openai',
        OPENAI_API_KEY: 'k',
        OPENAI_MODEL: 'gpt-x',
        ANTHROPIC_API_KEY: 'a',
      })
    ).toEqual({ id: 'openai', key: 'k', model: 'gpt-x' });
  });

  it('throws a clear setup error when no key is configured', () => {
    expect(() => pickModelProvider({})).toThrow(/No MCP model provider/);
  });
});

describe('callModel', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
  });

  it('calls OpenAI-compatible chat completions when OPENAI_API_KEY is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_MODEL = 'gpt-test';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }));
    await expect(callModel('hello')).resolves.toBe('ok');
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('gpt-test');
  });

  it('calls Google generateContent when forced to google', async () => {
    process.env.REPOLENS_MCP_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'g-key';
    process.env.GOOGLE_MODEL = 'gemini-test';
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'gemini ok' }] } }] }),
    }));
    await expect(callModel('hello')).resolves.toBe('gemini ok');
    expect(String(fetch.mock.calls[0][0])).toContain('models/gemini-test:generateContent');
  });
});
