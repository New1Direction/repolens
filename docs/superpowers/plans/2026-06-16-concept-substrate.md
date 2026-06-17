# Concept Substrate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist deep-dive atoms per repo and link repos by shared concepts — lexical matching everywhere, embeddings where the provider supports them — exposing a link/index API the later Knowledge-Graph UI (2b) and anchor explanations (2c) consume.

**Architecture:** A new pure module `concepts.js` does all indexing/linking/cosine math (fully unit-tested). `store.js` gains a new IDB `concepts` store (CRUD). The deep-dive runner in `background.js` persists atoms on completion. Then a provider-gated embeddings path (new `callEmbeddings` + `providers.js` capability metadata) caches per-atom vectors when the configured provider exposes an embeddings endpoint; the pure module's per-pair hybrid uses vectors when both repos have them, else lexical. No hosted backend; cosine is local JS.

**Tech Stack:** Vanilla ES modules (zero-build, no deps), Vitest (+ `fake-indexeddb`), mocked `global.fetch` for the provider call, `node --check` + `npm run check:html` for glue.

---

## Build order (two phases in one plan)

- **Phase 1 (Tasks 1–3) — lexical substrate.** `concepts.js` (incl. the cosine/embedding math as pure functions), the `concepts` store, and atom persistence (`vectors: null`). No AI, no provider/`background.js` call changes beyond persisting atoms. Ships a working lexical concept graph + the hybrid's fallback path.
- **Phase 2 (Tasks 4–5) — embeddings path.** `providers.js` capability + `callEmbeddings` + embed-on-deep-dive, so vectors get cached when supported. **v1 scope: OpenAI-protocol compat providers** (OpenAI is in `COMPAT_PROVIDERS`; plus any tagged with an embeddings model). The 5 first-class providers (Anthropic/Google/OpenRouter/xAI/Nous) use a separate call path and fall back to lexical in v1 — Google embeddings is a clean follow-up. (Spec mentioned Google; this narrowing is deliberate to stay bounded — flagged here.)

## File Structure

- **Create** `concepts.js` — pure: `normalizeConcept`, `cosineSimilarity`, `conceptIndex`, `lexicalMatcher`, `bestEmbeddingMatch`, `deriveConceptLinks`.
- **Create** `tests/concepts.test.js`.
- **Modify** `store/idb.js` — v6→v7, add `'concepts'`.
- **Modify** `store.js` — `getConcepts` / `getAllConcepts` / `setConcepts` (CRUD). **Create** `tests/store-concepts.test.js`.
- **Modify** `background.js` — persist atoms on deep-dive completion (Phase 1); `callEmbeddings` + embed-on-deep-dive (Phase 2).
- **Modify** `providers.js` — embeddings capability metadata + helpers (Phase 2). **Create** `tests/concepts-embeddings.test.js`.

---

## Phase 1 — Lexical substrate

### Task 1: `concepts.js` + tests

**Files:**
- Create: `concepts.js`
- Test: `tests/concepts.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/concepts.test.js
import { describe, it, expect } from 'vitest';
import {
  normalizeConcept, cosineSimilarity, conceptIndex,
  lexicalMatcher, bestEmbeddingMatch, deriveConceptLinks,
} from '../concepts.js';

const rec = (repoId, names, vectors = null) => ({
  repoId, vectors,
  atoms: names.map((n, i) => ({ id: `a${i}`, name: n, purpose: `does ${n}` })),
});

describe('normalizeConcept', () => {
  it('lowercases, strips punctuation, drops stopwords', () => {
    expect(normalizeConcept({ name: 'The Routing Layer!' })).toBe('routing');
    expect(normalizeConcept({ name: 'Auth/Session' })).toBe('auth-session');
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal, 0 for mismatched/empty', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('conceptIndex (lexical)', () => {
  it('maps each normalized concept to the repos that have it', () => {
    const recs = { x: rec('a/x', ['Router', 'Cache']), y: rec('c/y', ['router', 'Queue']) };
    const idx = conceptIndex(recs);
    expect(idx['router'].sort()).toEqual(['a/x', 'c/y']);
    expect(idx['cache']).toEqual(['a/x']);
  });
});

describe('lexicalMatcher', () => {
  it('links repos sharing a normalized concept, scored by overlap', () => {
    const recs = { x: rec('a/x', ['Router', 'Cache']), y: rec('c/y', ['Routing', 'Cache']) };
    const links = lexicalMatcher(recs);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ a: 'a/x', b: 'c/y', shared: ['cache'], score: 1 });
  });
});

describe('bestEmbeddingMatch', () => {
  it('returns the best atom-pair label when above threshold, else null', () => {
    const a = rec('a/x', ['Router'], [[1, 0]]);
    const b = rec('c/y', ['Dispatch'], [[1, 0]]);
    const m = bestEmbeddingMatch(a, b, 0.82);
    expect(m.score).toBeCloseTo(1);
    expect(m.label).toBe('Router ~ Dispatch');
    const far = rec('e/z', ['X'], [[0, 1]]);
    expect(bestEmbeddingMatch(a, far, 0.82)).toBeNull();
  });
});

describe('deriveConceptLinks (per-pair hybrid)', () => {
  it('uses embeddings when BOTH repos have vectors', () => {
    const recs = {
      x: rec('a/x', ['Router'], [[1, 0]]),
      y: rec('c/y', ['Dispatch'], [[1, 0]]),
    };
    const links = deriveConceptLinks(recs, { threshold: 0.82 });
    expect(links).toHaveLength(1);
    expect(links[0].score).toBeCloseTo(1);
    expect(links[0].shared).toEqual(['Router ~ Dispatch']);
  });

  it('falls back to lexical when either repo lacks vectors', () => {
    const recs = {
      x: rec('a/x', ['Cache'], [[1, 0]]),   // has vectors
      y: rec('c/y', ['Cache'], null),        // no vectors → lexical for this pair
    };
    const links = deriveConceptLinks(recs, { threshold: 0.82 });
    expect(links).toHaveLength(1);
    expect(links[0].shared).toEqual(['cache']);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/concepts.test.js`
Expected: FAIL — `Cannot find module '../concepts.js'`.

- [ ] **Step 3: Write the module**

```js
// concepts.js
// Pure concept model for the Knowledge Graph. Indexes deep-dive atoms across the
// library and links repos by shared concepts. No DOM/network/AI — the embedding
// VECTORS are produced in background.js (when the provider supports it); this
// module only does the math/matching, so it stays fully unit-testable.

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'is', 'it', 'its', 'that', 'this', 'layer', 'module', 'system', 'core']);

/** Canonical lexical key for an atom (lowercase, strip punctuation, drop stopwords). */
export function normalizeConcept(atom) {
  const raw = ((atom && (atom.name || atom.id)) || '').toLowerCase();
  const tokens = raw.replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((t) => t && !STOPWORDS.has(t));
  return tokens.join('-');
}

/** Cosine similarity of two equal-length numeric vectors; 0 for empty/mismatched. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const EMBED_THRESHOLD = 0.82;

const keysOf = (rec) => new Set(((rec && rec.atoms) || []).map(normalizeConcept).filter(Boolean));

/** Lexical concept → repos index. */
export function conceptIndex(records) {
  const idx = {};
  for (const rec of Object.values(records || {})) {
    if (!rec || !rec.repoId) continue;
    for (const k of keysOf(rec)) (idx[k] ||= []).push(rec.repoId);
  }
  return idx;
}

/** Lexical matcher: link repos sharing >=1 normalized concept key. */
export function lexicalMatcher(records) {
  const recs = Object.values(records || {}).filter((r) => r && r.repoId);
  const links = [];
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const ka = keysOf(recs[i]);
      const shared = [...keysOf(recs[j])].filter((k) => ka.has(k));
      if (shared.length) links.push({ a: recs[i].repoId, b: recs[j].repoId, shared, score: shared.length });
    }
  }
  return links;
}

/** Best cross-repo atom-pair match by cosine; { score, label } if >= threshold, else null. */
export function bestEmbeddingMatch(recA, recB, threshold = EMBED_THRESHOLD) {
  const va = recA && recA.vectors, vb = recB && recB.vectors;
  if (!Array.isArray(va) || !Array.isArray(vb) || !va.length || !vb.length) return null;
  let best = { score: 0, label: null };
  for (let i = 0; i < va.length; i++) {
    for (let j = 0; j < vb.length; j++) {
      const s = cosineSimilarity(va[i], vb[j]);
      if (s > best.score) best = { score: s, label: `${recA.atoms[i]?.name} ~ ${recB.atoms[j]?.name}` };
    }
  }
  return best.score >= threshold ? best : null;
}

/**
 * Link repos by shared concepts. Per-pair hybrid: when BOTH repos have vectors,
 * use the embedding matcher; otherwise lexical for that pair.
 * @returns {{a:string,b:string,shared:string[],score:number}[]}
 */
export function deriveConceptLinks(records, { threshold = EMBED_THRESHOLD } = {}) {
  const recs = Object.values(records || {}).filter((r) => r && r.repoId);
  const links = [];
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i], b = recs[j];
      const bothVec = Array.isArray(a.vectors) && a.vectors.length && Array.isArray(b.vectors) && b.vectors.length;
      if (bothVec) {
        const m = bestEmbeddingMatch(a, b, threshold);
        if (m) links.push({ a: a.repoId, b: b.repoId, shared: [m.label], score: m.score });
      } else {
        const ka = keysOf(a);
        const shared = [...keysOf(b)].filter((k) => ka.has(k));
        if (shared.length) links.push({ a: a.repoId, b: b.repoId, shared, score: shared.length });
      }
    }
  }
  return links;
}
```

- [ ] **Step 4: Run tests + confirm pass**

Run: `npx vitest run tests/concepts.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint concepts.js tests/concepts.test.js` (0 errors)
```bash
git add concepts.js tests/concepts.test.js
git commit -m "feat(concepts): pure concept index + lexical/embedding link matchers"
```

### Task 2: `concepts` IDB store + CRUD

**Files:**
- Modify: `store/idb.js:9-10`
- Modify: `store.js` (after the mastery section)
- Test: `tests/store-concepts.test.js`

- [ ] **Step 1: Register the store**

In `store/idb.js`, replace the version + STORES lines:

```js
// v6 added 'mastery'. v7 added 'concepts' (the Knowledge-Graph concept substrate).
// Each upgrade is additive — onupgradeneeded creates any new store, data survives.
const DB_VERSION = 7;
const STORES = ['repos', 'nodes', 'edges', 'collections', 'decisions', 'snapshots', 'scenes', 'mastery', 'concepts'];
```

- [ ] **Step 2: Write the failing test**

```js
// tests/store-concepts.test.js
import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { setConcepts, getConcepts, getAllConcepts } from '../store.js';

describe('concepts persistence', () => {
  it('round-trips a record by repoId', async () => {
    const rec = { repoId: 'honojs/hono', atoms: [{ id: 'r', name: 'Router' }], vectors: null, embedModel: null, computedAt: '2026-06-16T00:00:00.000Z' };
    await setConcepts('honojs/hono', rec);
    expect(await getConcepts('honojs/hono')).toEqual(rec);
  });
  it('returns null for an unknown repo', async () => {
    expect(await getConcepts('nope/none')).toBeNull();
  });
  it('getAllConcepts returns a repoId→record map', async () => {
    await setConcepts('a/b', { repoId: 'a/b', atoms: [] });
    const map = await getAllConcepts();
    expect(map['a/b'].repoId).toBe('a/b');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/store-concepts.test.js`
Expected: FAIL — `setConcepts is not a function`.

- [ ] **Step 4: Add the store functions**

In `store.js`, after the mastery section, add (mirrors `mastery`):

```js
// ─── concepts: per-repo deep-dive atoms + embeddings (Knowledge Graph) ────────

/** Persist a repo's concept record (atoms [+ vectors]). Throws on failure. */
export async function setConcepts(repoId, record) {
  if (!repoId) throw new Error('setConcepts needs a repoId');
  await idbPut('concepts', { id: repoId, payload: record });
}

/** Get a repo's concept record, or null. */
export async function getConcepts(repoId) {
  try {
    const row = await idbGet('concepts', repoId);
    return (row && row.payload) || null;
  } catch {
    return null;
  }
}

/** All concept records as a { repoId: record } map. Best-effort — {} on failure. */
export async function getAllConcepts() {
  try {
    const rows = await idbGetAll('concepts');
    const out = {};
    for (const r of rows || []) if (r && r.id) out[r.id] = r.payload;
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 5: Run tests + lint + commit**

Run: `npx vitest run tests/store-concepts.test.js` (PASS), `npx eslint store.js store/idb.js tests/store-concepts.test.js` (0 errors)
```bash
git add store/idb.js store.js tests/store-concepts.test.js
git commit -m "feat(concepts): IDB concepts store + CRUD persistence"
```

### Task 3: Persist atoms on deep-dive completion

**Files:**
- Modify: `background.js` — `runDeepDive` (lines 767-810).

- [ ] **Step 1: Read the runner**

Read `background.js:767-810`. `atoms` is parsed at line 795; the dive completes at `setDeep({ status: 'done' })` (line 806). `detected.repoId` is in scope. `setConcepts` will be imported from `./store.js`.

- [ ] **Step 2: Import setConcepts**

At the top of `background.js`, add to the `./store.js` import group:

```js
import { setConcepts } from './store.js';
```

(If `background.js` already imports other names from `./store.js`, add `setConcepts` to that existing import list rather than a second statement.)

- [ ] **Step 3: Persist after the dive succeeds**

In `runDeepDive`, immediately before `await setDeep({ status: 'done' });` (line 806), add a best-effort concept persist (Phase 1: no vectors yet):

```js
    // Persist atoms for the Knowledge-Graph concept substrate (best-effort —
    // a substrate write must never fail the dive). Vectors are added in Phase 2.
    try {
      await setConcepts(detected.repoId, {
        repoId: detected.repoId,
        atoms,
        vectors: null,
        embedModel: null,
        computedAt: new Date().toISOString(),
      });
    } catch { /* substrate is additive; ignore */ }
```

- [ ] **Step 4: Verify**

Run: `node --check background.js`
Run: `npx vitest run` (full suite still green; no contract changed)
Manual note: after a deep dive, `getConcepts(repoId)` returns the atoms (verified indirectly via the store test + code review; no DOM test env).

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat(concepts): persist deep-dive atoms to the concept store"
```

---

## Phase 2 — Embeddings path

### Task 4: Provider embeddings capability (`providers.js`)

**Files:**
- Modify: `providers.js` — add an embeddings model to OpenAI's entry + helpers.
- Test: `tests/concepts-embeddings.test.js` (capability portion)

- [ ] **Step 1: Read the registry helpers**

Read `providers.js:18-30` (the `openai` entry), `:193-235` (`compatProviderById`, `provKeyName`/`provModelName`/`provBaseName`, `isCompatConnected`, `compatModelFor`), and `:263-280` (`compatEndpoint`, `normalizeOpenAiUrl`). Confirm `openai`'s `endpoint` is `https://api.openai.com/v1/chat/completions`.

- [ ] **Step 2: Write the failing capability test**

```js
// tests/concepts-embeddings.test.js
import { describe, it, expect } from 'vitest';
import { providerSupportsEmbeddings, compatEmbeddingsEndpoint, embeddingsModelFor } from '../providers.js';

describe('embeddings capability', () => {
  it('openai supports embeddings when connected (has a key)', () => {
    expect(providerSupportsEmbeddings('openai', { openaiKey: 'sk-x' })).toBe(true);
    expect(providerSupportsEmbeddings('openai', {})).toBe(false);       // no key → not connected
  });
  it('a provider without an embeddings model does not support it', () => {
    expect(providerSupportsEmbeddings('groq', { groqKey: 'x' })).toBe(false);
  });
  it('derives the /embeddings endpoint from the chat endpoint', () => {
    expect(compatEmbeddingsEndpoint('openai', {})).toBe('https://api.openai.com/v1/embeddings');
  });
  it('embeddingsModelFor prefers an override then the default', () => {
    expect(embeddingsModelFor('openai', {})).toBe('text-embedding-3-small');
    expect(embeddingsModelFor('openai', { openaiEmbedModel: 'text-embedding-3-large' })).toBe('text-embedding-3-large');
  });
});
```

- [ ] **Step 3: Run it + confirm fail**

Run: `npx vitest run tests/concepts-embeddings.test.js`
Expected: FAIL — `providerSupportsEmbeddings is not a function`.

- [ ] **Step 4: Add the capability metadata + helpers**

In `providers.js`, add `embeddingsModel: 'text-embedding-3-small'` to the `openai` provider object (the entry starting `id: 'openai'`). Then add, near the other compat helpers:

```js
export const provEmbedModelName = (id) => `${id}EmbedModel`; // optional embeddings-model override

/** The embeddings model for a provider (override → registry default → ''). */
export function embeddingsModelFor(id, keys = {}) {
  const p = compatProviderById(id);
  return (keys[provEmbedModelName(id)] || (p && p.embeddingsModel) || '').trim();
}

/** Derive the POST-able /embeddings URL from the provider's chat endpoint. '' when unknown. */
export function compatEmbeddingsEndpoint(id, keys = {}) {
  const chat = compatEndpoint(id, keys);                 // e.g. .../v1/chat/completions
  if (!chat) return '';
  return chat.replace(/\/chat\/completions(\?.*)?$/, '/embeddings');
}

/** True when an OpenAI-protocol provider is connected AND has an embeddings model. */
export function providerSupportsEmbeddings(id, keys = {}) {
  return compatProtocol(id, keys) === 'openai'
    && !!embeddingsModelFor(id, keys)
    && isCompatConnected(id, keys);
}

/** First connected provider that supports embeddings → { id, endpoint, key, model }, or null. */
export function pickEmbeddingsProvider(keys = {}) {
  for (const p of COMPAT_PROVIDERS) {
    if (providerSupportsEmbeddings(p.id, keys)) {
      return { id: p.id, endpoint: compatEmbeddingsEndpoint(p.id, keys), key: keys[provKeyName(p.id)], model: embeddingsModelFor(p.id, keys) };
    }
  }
  return null;
}
```

- [ ] **Step 5: Run tests + lint + commit**

Run: `npx vitest run tests/concepts-embeddings.test.js` (PASS), `npx eslint providers.js tests/concepts-embeddings.test.js` (0 errors)
```bash
git add providers.js tests/concepts-embeddings.test.js
git commit -m "feat(concepts): provider embeddings-capability registry helpers"
```

### Task 5: `callEmbeddings` + embed-on-deep-dive

**Files:**
- Modify: `background.js` — add `callEmbeddings`; embed in `runDeepDive`.
- Test: extend `tests/concepts-embeddings.test.js` (call portion) — but `callEmbeddings` lives in `background.js` (a service-worker module). If `background.js` can't be imported under vitest (chrome globals), test the **pure body/parse** instead: factor the request body + response parse into `providers.js` and test those; the `fetch` wrapper stays in `background.js` and is verified by `node --check` + code review.

- [ ] **Step 1: Read the existing compat call**

Read `background.js:1287-1345` (`callOpenAICompatible`) and the `fetchWithTimeout` helper (~1273). Mirror its header style (`Authorization: Bearer <key>`), `AbortController` timeout, and error handling.

- [ ] **Step 2: Add pure embeddings body/parse to `providers.js` (testable)**

```js
/** Request body for an OpenAI-compatible /embeddings POST. */
export function embeddingsBody(model, input) {
  return { model, input };
}

/** Parse embedding vectors from an OpenAI-compatible /embeddings response, ordered by index. */
export function parseEmbeddings(json) {
  const data = Array.isArray(json?.data) ? json.data : [];
  return data
    .slice()
    .sort((x, y) => (x.index ?? 0) - (y.index ?? 0))
    .map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
}
```

Add to `tests/concepts-embeddings.test.js`:

```js
import { embeddingsBody, parseEmbeddings } from '../providers.js';

describe('embeddings body + parse', () => {
  it('builds the request body', () => {
    expect(embeddingsBody('text-embedding-3-small', ['a', 'b'])).toEqual({ model: 'text-embedding-3-small', input: ['a', 'b'] });
  });
  it('parses vectors ordered by index', () => {
    const json = { data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }] };
    expect(parseEmbeddings(json)).toEqual([[1, 2], [3, 4]]);
  });
});
```

Run: `npx vitest run tests/concepts-embeddings.test.js` (PASS after adding the functions).

- [ ] **Step 3: Add `callEmbeddings` in `background.js`**

Near `callOpenAICompatible`, add (uses the same `fetchWithTimeout`; import `embeddingsBody`, `parseEmbeddings`, `pickEmbeddingsProvider` from `./providers.js`):

```js
// Embeddings via the configured OpenAI-protocol provider (BYO-key). Returns
// number[][] aligned to `texts`, or null if no capable provider / on any error
// (callers fall back to lexical matching). Never throws.
async function callEmbeddings(keys, texts) {
  const p = pickEmbeddingsProvider(keys);
  if (!p || !p.endpoint || !p.key || !texts.length) return null;
  try {
    const res = await fetchWithTimeout(p.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify(embeddingsBody(p.model, texts)),
    });
    if (!res.ok) return null;
    const vectors = parseEmbeddings(await res.json());
    return vectors.length === texts.length ? { vectors, model: p.model } : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Embed in `runDeepDive`**

Replace the Phase-1 persist block (Task 3) so vectors are computed when available. In `runDeepDive`, before `setDeep({ status: 'done' })`:

```js
    // Knowledge-Graph substrate: persist atoms, with embeddings when the configured
    // provider supports them (else vectors stay null → lexical matching). Best-effort.
    try {
      const texts = atoms.map((a) => `${a.name} — ${a.purpose || ''}`.trim());
      const emb = await callEmbeddings(keys, texts);
      await setConcepts(detected.repoId, {
        repoId: detected.repoId,
        atoms,
        vectors: emb ? emb.vectors : null,
        embedModel: emb ? emb.model : null,
        computedAt: new Date().toISOString(),
      });
    } catch { /* substrate is additive; ignore */ }
```

- [ ] **Step 5: Verify**

Run: `node --check background.js && node --check providers.js`
Run: `npx vitest run` (all pass)
Run: `npx eslint background.js providers.js` (0 errors)

- [ ] **Step 6: Commit**

```bash
git add background.js providers.js tests/concepts-embeddings.test.js
git commit -m "feat(concepts): callEmbeddings + embed atoms on deep dive (provider-gated)"
```

---

## Phase 3 — Verification

### Task 6: Full pass

- [ ] **Step 1:** `npx vitest run` — all pass (prior total + `concepts.test.js`, `store-concepts.test.js`, `concepts-embeddings.test.js`).
- [ ] **Step 2:** `npx eslint .` — 0 errors.
- [ ] **Step 3:** `npm run check:html` — all files parse.
- [ ] **Step 4:** `node --check` on `concepts.js`, `store.js`, `store/idb.js`, `providers.js`, `background.js`.
- [ ] **Step 5: Manual note** (no DOM test env): with an OpenAI key configured, a deep dive caches vectors (`getConcepts(repoId).vectors` non-null); with Anthropic, `vectors` is null and `deriveConceptLinks` uses lexical. No user-visible surface yet (that's 2b).

---

## Spec coverage check

- Persist atoms to a new `concepts` store: Tasks 2, 3.
- Pure `concepts.js` (normalize, cosine, lexical + embedding matchers, `deriveConceptLinks` per-pair hybrid, `conceptIndex` lexical-only): Task 1.
- Provider-gated embeddings (capability + `callEmbeddings` + embed-on-deep-dive), error→null→lexical fallback: Tasks 4, 5.
- No hosted backend; embeddings the only new provider call; existing scan/lens contracts unchanged: Tasks 3–5 (additive, best-effort).
- Fully unit-tested pure module; persistence via fake-indexeddb; embeddings body/parse + capability tested; `callEmbeddings` fetch wrapper verified by `node --check` + review (can't import the SW module under vitest): Tasks 1, 2, 4, 5.

## Out of scope (per spec)

UI (2b), anchor-to-library explanation (2c), embeddings for the 5 first-class providers incl. Google (v1 covers OpenAI-protocol compat providers; Google is a clean follow-up via its separate call path).
