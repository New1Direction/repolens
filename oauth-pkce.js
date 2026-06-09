/** PKCE helpers shared by Anthropic and OpenRouter OAuth flows. */

export function base64url(buf) {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkcePair() {
  const verifierArr = new Uint8Array(32);
  crypto.getRandomValues(verifierArr);
  const verifier = base64url(verifierArr);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));

  const stateArr = new Uint8Array(16);
  crypto.getRandomValues(stateArr);
  const state = base64url(stateArr);

  return { verifier, challenge, state };
}
