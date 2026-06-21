// estimate.js — a cheap, provider-agnostic token estimate, so a scan's size is
// visible at a glance. Deliberately reports TOKENS, not dollars: token counts
// don't go stale, and the reader can multiply by whatever their provider charges.
// The heuristic (~4 chars/token, blended with a word count) is the well-known
// rule of thumb — an estimate, not an exact tokenizer.

/**
 * Estimate the token count of a text blob.
 * @param {unknown} text
 * @returns {number} estimated tokens (integer, ≥ 0)
 */
export function estimateTokens(text) {
  const s = String(text ?? '');
  if (!s.trim()) return 0;
  // Blend chars/4 with words×1.3 — closer than either heuristic alone.
  const byChars = s.length / 4;
  const byWords = s.trim().split(/\s+/).length * 1.3;
  return Math.max(1, Math.round((byChars + byWords) / 2));
}

/** Compact token count for display: 850 → "850", 2847 → "2.8k", 1_200_000 → "1.2M". */
export function formatTokens(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) {
    const k = v / 1000;
    return (k < 10 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k';
  }
  const m = v / 1_000_000;
  return (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : String(Math.round(m))) + 'M';
}
