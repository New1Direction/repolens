// Pure client-side ranker — the replacement for VelesDB's /search/text. No DOM, no I/O.
// Scores saved repo payloads against a query string and returns the best matches.
//
// Uses BM25 (Lucene's non-negative idf variant) with light field weighting, so a
// rare, distinctive term (e.g. "raytracer") outweighs a common one (e.g. "tool"),
// and a hit in a high-signal field (category/capabilities) outweighs a passing
// mention buried in the eli5. This is what powers "Similar repos" and the
// Synergies candidate seeding, where candidate quality drives real AI cost.

const STOP = new Set(['', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is']);

/** Lowercase, split on non-word chars (keeping +#. for things like c++ / c# / node.js), drop stopwords. */
export function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t && !STOP.has(t));
}

// Field → weight. Weight is applied by replicating that field's tokens, so a hit
// there counts for more term-frequency (a simple, deterministic BM25F approximation).
const FIELD_WEIGHTS = [
  ['category', 3],
  ['capabilities', 3],
  ['tags', 3],
  ['language', 2],
  ['repoId', 2],
  ['eli5', 1],
];

const K1 = 1.5;
const B = 0.75;

/** Weighted token bag for one repo payload. */
function docTokens(r) {
  const bag = [];
  for (const [field, weight] of FIELD_WEIGHTS) {
    const raw = Array.isArray(r[field]) ? r[field].join(' ') : r[field];
    const toks = tokens(raw);
    for (let i = 0; i < weight; i++) bag.push(...toks);
  }
  return bag;
}

/**
 * Rank repo payloads by BM25 relevance to `query`. Returns the matching payloads,
 * best first. Stable across ties (input order is preserved). Queries are usually
 * "<language> <category>".
 */
export function rankRepos(rows, query, { excludeId = null, topK = 3 } = {}) {
  const qTerms = [...new Set(tokens(query))];
  if (!qTerms.length) return [];

  // Build candidate docs (skip malformed + the excluded id).
  const docs = [];
  for (const r of rows) {
    if (!r || !r.repoId) continue;
    if (excludeId && r.repoId === excludeId) continue;
    const bag = docTokens(r);
    const tf = new Map();
    for (const t of bag) tf.set(t, (tf.get(t) || 0) + 1);
    docs.push({ r, tf, len: bag.length });
  }
  if (!docs.length) return [];

  const N = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.len, 0) / N || 1;

  // Document frequency per query term, across the candidate set.
  const df = new Map();
  for (const t of qTerms) {
    let count = 0;
    for (const d of docs) if (d.tf.has(t)) count++;
    df.set(t, count);
  }

  const scored = [];
  for (const d of docs) {
    let score = 0;
    for (const t of qTerms) {
      const f = d.tf.get(t) || 0;
      if (!f) continue;
      // Lucene's idf: always ≥ 0, so a term present in every doc still helps a little.
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * d.len) / avgdl));
    }
    if (score > 0) scored.push({ r: d.r, score });
  }
  scored.sort((a, b) => b.score - a.score); // Array.sort is stable → ties keep input order
  return scored.slice(0, topK).map((s) => s.r);
}
