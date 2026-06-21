// Environment-driven model provider for RepoLens MCP.
// Keeps the MCP local + BYO-key while supporting the providers people already
// have in agent workflows. Auto-select order is explicit and deterministic.

const DEFAULT_TIMEOUT_MS = 60_000;

const PROVIDERS = {
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-6',
  },
  openai: {
    env: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4.1-mini',
  },
  openrouter: {
    env: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'anthropic/claude-sonnet-4.5',
  },
  google: {
    env: 'GOOGLE_API_KEY',
    modelEnv: 'GOOGLE_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
};

function timeoutMs() {
  return (
    Number(process.env.REPOLENS_MCP_TIMEOUT_MS) ||
    Number(process.env.ANTHROPIC_TIMEOUT_MS) ||
    DEFAULT_TIMEOUT_MS
  );
}

export function pickModelProvider(env = process.env) {
  const forced = String(env.REPOLENS_MCP_PROVIDER || '')
    .toLowerCase()
    .trim();
  if (forced) {
    const cfg = PROVIDERS[forced];
    if (!cfg) throw new Error(`Unknown REPOLENS_MCP_PROVIDER "${forced}"`);
    if (!env[cfg.env]) throw new Error(`${cfg.env} is not set for REPOLENS_MCP_PROVIDER=${forced}`);
    return { id: forced, key: env[cfg.env], model: env[cfg.modelEnv] || cfg.defaultModel };
  }
  for (const id of ['anthropic', 'openai', 'openrouter', 'google']) {
    const cfg = PROVIDERS[id];
    if (env[cfg.env]) return { id, key: env[cfg.env], model: env[cfg.modelEnv] || cfg.defaultModel };
  }
  throw new Error(
    'No MCP model provider configured — set ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_API_KEY'
  );
}

async function fetchWithTimeout(url, opts, label) {
  const ms = timeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`${label} request timed out after ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function openAiBody(model, prompt) {
  return { model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] };
}

function parseOpenAiText(json, label) {
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${label} returned an empty response`);
  return text;
}

async function callAnthropic({ key, model }, prompt) {
  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    },
    'Anthropic'
  );
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => b.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Anthropic returned an empty response');
  return text;
}

async function callOpenAI({ key, model }, prompt) {
  const res = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(openAiBody(model, prompt)),
    },
    'OpenAI'
  );
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return parseOpenAiText(await res.json(), 'OpenAI');
}

async function callOpenRouter({ key, model }, prompt) {
  const res = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://github.com/New1Direction/RepoLens',
        'X-Title': 'RepoLens MCP',
      },
      body: JSON.stringify(openAiBody(model, prompt)),
    },
    'OpenRouter'
  );
  if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return parseOpenAiText(await res.json(), 'OpenRouter');
}

async function callGoogle({ key, model }, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    },
    'Google'
  );
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Google returned an empty response');
  return text;
}

export async function callModel(prompt) {
  const provider = pickModelProvider();
  if (provider.id === 'anthropic') return callAnthropic(provider, prompt);
  if (provider.id === 'openai') return callOpenAI(provider, prompt);
  if (provider.id === 'openrouter') return callOpenRouter(provider, prompt);
  if (provider.id === 'google') return callGoogle(provider, prompt);
  throw new Error(`Unsupported MCP provider: ${provider.id}`);
}
