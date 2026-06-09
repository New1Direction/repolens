/** Anthropic OAuth — PKCE authorize + token refresh (Claude subscription).
 *
 * Hardened to Hermes-agent patterns from the RE campaign:
 * - Explicit 60s refresh skew
 * - Structured credential record (with legacy flat-key migration)
 * - In-flight refresh deduplication (like Hermes _refresh_inflight)
 * - isExpired helper + proactive refresh before use
 */

export const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
export const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
export const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
export const ANTHROPIC_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
export const ANTHROPIC_SCOPES = 'user:inference user:sessions:claude_code user:mcp_servers user:file_upload user:profile';

export const ANTHROPIC_OAUTH_VERIFIER_KEY = 'repolens_anthropic_oauth_verifier';
export const ANTHROPIC_OAUTH_STATE_KEY = 'repolens_anthropic_oauth_state';
export const ANTHROPIC_OAUTH_ERROR_KEY = 'repolens_anthropic_oauth_error';

// Hermes-style constants
export const ANTHROPIC_REFRESH_SKEW_SECONDS = 60;
export const ANTHROPIC_CREDENTIALS_KEY = 'anthropicCredentials'; // preferred structured storage

/** Structured credential shape (inspired by Hermes GoogleCredentials + xAI paths):
 * {
 *   access_token: string,
 *   refresh_token: string,
 *   expires_at: number,   // unix ms
 *   email?: string,
 *   metadata?: Record<string, any>
 * }
 */

// In-flight refresh deduplication (Hermes _refresh_inflight pattern).
// Prevents concurrent refresh calls from thundering the token endpoint.
let _anthropicRefreshPromise = null;

export function isAnthropicTokenExpired(creds, skewSeconds = ANTHROPIC_REFRESH_SKEW_SECONDS) {
  if (!creds?.access_token || !creds?.expires_at) return true;
  const skewMs = Math.max(0, skewSeconds) * 1000;
  return (Date.now() + skewMs) >= creds.expires_at;
}

/** Returns the best available credentials, preferring structured storage.
 * Falls back to legacy flat keys (anthropicKey / anthropicRefresh / anthropicExpiry)
 * and performs a one-time migration on read.
 */
export async function getAnthropicCredentials() {
  const data = await chrome.storage.local.get([
    ANTHROPIC_CREDENTIALS_KEY,
    'anthropicKey', 'anthropicRefresh', 'anthropicExpiry'
  ]);

  // Preferred structured path
  if (data[ANTHROPIC_CREDENTIALS_KEY] && typeof data[ANTHROPIC_CREDENTIALS_KEY] === 'object') {
    return data[ANTHROPIC_CREDENTIALS_KEY];
  }

  // Legacy flat keys → construct structured object (migration path)
  if (data.anthropicKey || data.anthropicRefresh) {
    const legacy = {
      access_token: data.anthropicKey || null,
      refresh_token: data.anthropicRefresh || null,
      expires_at: data.anthropicExpiry || null,
    };
    // Opportunistic migration (best effort)
    if (legacy.access_token || legacy.refresh_token) {
      await saveAnthropicCredentials(legacy).catch(() => {});
    }
    return legacy;
  }

  return null;
}

/** Writes credentials in both structured and legacy flat formats for compatibility. */
export async function saveAnthropicCredentials(creds) {
  if (!creds) return;

  const structured = {
    access_token: creds.access_token || creds.key || null,
    refresh_token: creds.refresh_token || creds.refresh || null,
    expires_at: creds.expires_at || creds.expiry || creds.expires || null,
    email: creds.email || null,
    metadata: creds.metadata || {},
  };

  const legacy = {
    anthropicKey: structured.access_token,
    anthropicRefresh: structured.refresh_token,
    anthropicExpiry: structured.expires_at,
  };

  await chrome.storage.local.set({
    [ANTHROPIC_CREDENTIALS_KEY]: structured,
    ...legacy,
  });
}

export async function clearAnthropicCredentials() {
  await chrome.storage.local.remove([
    ANTHROPIC_CREDENTIALS_KEY,
    'anthropicKey', 'anthropicRefresh', 'anthropicExpiry',
  ]);
}

export function buildAnthropicAuthorizeUrl({ challenge, state }) {
  const authUrl = new URL(ANTHROPIC_AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', ANTHROPIC_SCOPES);
  authUrl.searchParams.set('redirect_uri', ANTHROPIC_REDIRECT_URI);
  return authUrl.href;
}

export function isAnthropicOAuthCallbackUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname === 'console.anthropic.com'
      && url.pathname.includes('/oauth/code/callback');
  } catch {
    return false;
  }
}

export async function exchangeAnthropicCode({ code, state, verifier, storedState }) {
  if (state !== storedState) {
    throw new Error('State mismatch — possible CSRF');
  }

  const res = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      client_id: ANTHROPIC_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let errMsg;
    try {
      const e = JSON.parse(errBody);
      errMsg = e.error_description || e.error;
    } catch {
      errMsg = errBody;
    }
    throw new Error(errMsg || `Token exchange failed (${res.status})`);
  }

  const tokens = await res.json();

  const creds = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };
  await saveAnthropicCredentials(creds);
  return creds.access_token;
}

export async function refreshAnthropicToken({ force = false } = {}) {
  // Hermes-style in-flight deduplication
  if (_anthropicRefreshPromise && !force) {
    return _anthropicRefreshPromise;
  }

  _anthropicRefreshPromise = (async () => {
    try {
      const creds = await getAnthropicCredentials();

      if (!force && creds && !isAnthropicTokenExpired(creds)) {
        return creds.access_token;
      }

      if (!creds?.refresh_token) {
        await clearAnthropicCredentials();
        throw new Error('Anthropic token expired — please reconnect in Settings');
      }

      const res = await fetch(ANTHROPIC_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: ANTHROPIC_CLIENT_ID,
          refresh_token: creds.refresh_token,
        }),
      });

      if (!res.ok) {
        await clearAnthropicCredentials();
        throw new Error('Anthropic session expired — please reconnect in Settings');
      }

      const tokens = await res.json();

      const newCreds = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || creds.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
      };

      await saveAnthropicCredentials(newCreds);
      return newCreds.access_token;
    } finally {
      _anthropicRefreshPromise = null;
    }
  })();

  return _anthropicRefreshPromise;
}

/** Poll storage until background.js finishes the OAuth callback exchange. */
export async function waitForAnthropicOAuthResult({ timeoutMs = 300_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await chrome.storage.local.get([
      'anthropicKey',
      ANTHROPIC_CREDENTIALS_KEY,
      ANTHROPIC_OAUTH_ERROR_KEY,
    ]);

    // Support both structured and legacy flat storage
    const key = s.anthropicKey ||
      (s[ANTHROPIC_CREDENTIALS_KEY] && s[ANTHROPIC_CREDENTIALS_KEY].access_token);

    if (key) return { key };
    if (s[ANTHROPIC_OAUTH_ERROR_KEY]) return { error: s[ANTHROPIC_OAUTH_ERROR_KEY] };
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { error: 'Timed out — finish signing in and try Connect again' };
}
