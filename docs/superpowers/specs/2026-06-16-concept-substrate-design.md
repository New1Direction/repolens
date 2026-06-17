# Concept Substrate (Pillar 3, Spec 2a)

- **Date:** 2026-06-16
- **Status:** Approved (design) — pending implementation plan
- **Surface:** the deep-dive pipeline (persist + embed atoms) + a new pure concept module + the local graph store. **No user-facing UI** in 2a.
- **Part of:** **Pillar 3 — The Knowledge Game**, Spec 2 (the Knowledge Graph). Spec 1 (the Mastery Loop) shipped (PR #37).
  - **2a — Concept substrate** ← *this* (persist atoms, index concepts, link repos by shared concepts)
  - **2b — Concept connections in the UI** (surface shared-concept links on the corkboard / ego-graph; annotate nodes with mastery)
  - **2c — Anchor-to-library explanation** (output tab: explain a new repo against repos you know)

## Problem / the gap

RepoLens already has a persistent graph (the `nodes`/`edges` IDB stores) and surfaces it as the **Corkboard** (a library-wide canvas of repos + ideas joined by relationship edges: `ALTERNATIVE_TO`, `SYNERGIZES_WITH`, `COMPARED_TO`, `COMBINES`) and the per-repo **Connections** ego-graph. But repos are linked only by those *relationships* — **never by shared concepts**.

The deep dive produces rich per-repo semantic **atoms** (`{id, name, kind, purpose, files}`) via `parseAtoms` (`deepdive.js`), uses them for the blueprint, then **discards them** — they are never persisted or compared across repos. So there is no data answering "which repos touch event-sourcing?" This substrate is the missing foundation for the "plug pieces together, think in new ways" vision, and for annotating the graph with the just-shipped mastery signal.

## Goals

- **Persist** each repo's deep-dive atoms locally (they're already produced — no new call for the atoms themselves).
- **Link repos by shared concepts** via a pure, pluggable matcher: **embeddings** when the provider supports them, **lexical** fallback otherwise.
- Expose a clean **link/index API** (`deriveConceptLinks`, `conceptIndex`) that 2b (visualize) and 2c (anchor) consume.

## Non-goals

- **No user-facing UI** in 2a — that is 2b. 2a is data + API, validated by tests.
- No hosted backend (embeddings go to the user's BYO provider; vectors are cached in IDB; cosine is local JS).
- No changes to the existing relationship edges / Corkboard / Connections rendering (2b territory).

## Decisions (resolved in brainstorming)

- First slice = **2a (substrate)** — the genuinely missing capability and the foundation.
- Matcher = **hybrid**: embeddings where the configured provider exposes an embeddings endpoint; lexical (normalized-tag + token-overlap) fallback otherwise. Per-repo fallback (a repo with vectors uses embeddings; without, lexical).
- **Build order within 2a:** the lexical substrate first (the fallback path, works everywhere, no AI/background changes), then the embeddings path layered on.

## Two explicit departures to call out

1. **2a touches `background.js` and adds a new AI call** (the embeddings request) — a deliberate departure from the Mastery Loop's "no background/AI changes." It is the direct consequence of choosing embeddings. There is still **no hosted backend**: the `/embeddings` call goes to the user's configured provider (BYO-key), vectors are cached in IDB, and all matching/cosine is local JS.
2. **2a ships nothing the user sees.** The visible payoff (concept links on the Corkboard) is 2b. This spec is the substrate; its "output" is persisted data + the link API, validated by unit tests.

## Components

### ① Persist atoms — new `concepts` IDB store

On deep-dive completion (the deep-dive runner in `background.js`), persist the atoms (already produced) to a new `concepts` store (additive: `store/idb.js` DB_VERSION 6→7, add `'concepts'` to `STORES`). Best-effort write — a ledger write must never fail a scan (mirrors `appendScanSnapshot`).

Record, keyed by raw repoId (mirrors `decisions`/`mastery`):
```
concepts[repoId] = {
  repoId,
  atoms: [{ id, name, kind, purpose, files }],   // from parseAtoms
  vectors: number[][] | null,                     // per-atom embedding (aligned to atoms), null when none
  embedModel: string | null,                      // model that produced vectors, e.g. 'text-embedding-3-small'
  computedAt: string,                             // ISO
}
```
`store.js` CRUD (no compute in the store): `getConcepts(repoId)`, `getAllConcepts()` (→ `{repoId: record}` map), `setConcepts(repoId, record)`.

### ② Pure concept logic — `concepts.js` (no DOM / network / AI)

Fully unit-testable. Exports:
- `normalizeConcept(atom)` → a canonical lexical key (lowercase, strip punctuation, drop stopwords). Used by the lexical matcher.
- `cosineSimilarity(vecA, vecB)` → number in [-1, 1] (0 for zero/length-mismatched vectors).
- **Matchers** (pure functions over the records map), behind one interface:
  - `lexicalMatcher` — builds a concept→repos index from normalized atom keys (with a light token-overlap merge of near-duplicate keys via `store/search.js`), then links repos sharing ≥1 concept.
  - `embeddingMatcher(threshold)` — links repos that have a cross-repo atom pair with `cosineSimilarity >= threshold` (default tunable, e.g. 0.82).
- `deriveConceptLinks(records, { matcher })` → `[{ a: repoId, b: repoId, shared: string[], score: number }]`. Per-repo hybrid selection: use the embedding matcher between two repos only when **both** have `vectors`; otherwise fall back to lexical for that pair. `shared` is the linking labels — **lexical**: the shared normalized concept keys; **embedding**: the names of the matched atom pair(s).
- `conceptIndex(records)` → `{ conceptLabel: repoId[] }` over the **lexical** normalized concepts (named concept → repos; what 2b/2c read to show "N repos touch X"). Note: this index is lexical-only because embeddings link repo *pairs* without producing discrete concept labels — so `conceptIndex` takes no matcher, while `deriveConceptLinks` is the hybrid repo-linker.

### ③ Embeddings path — provider-gated (the sharp matcher)

- **Capability:** extend the provider registry (`providers.js`) with embeddings support per provider — `{ embeddingsEndpoint, embeddingsModel }` for those that have one (OpenAI → `text-embedding-3-small`; Google → `text-embedding-004`; most OpenAI-compatible → their `/embeddings`); none for Anthropic and any without an endpoint. A helper `providerSupportsEmbeddings(id)`.
- **Call:** new `callEmbeddings(texts)` in `background.js` — an OpenAI-compatible `/embeddings` POST using the configured provider's key + model, wrapped in the same hard timeout as `callAI`. Returns `number[][]` aligned to `texts`. Errors degrade to `null` vectors (→ lexical fallback), never breaking the deep dive.
- **When:** on deep-dive completion, if `providerSupportsEmbeddings(configured)`, embed each atom's `name + ' — ' + purpose` and store the vectors; else store `vectors: null`.

## Architecture (files)

- **Create** `concepts.js` — pure model (normalize, cosine, matchers, `deriveConceptLinks`, `conceptIndex`). One responsibility: concept indexing/linking.
- **Create** `tests/concepts.test.js`.
- **Modify** `store/idb.js` — v6→v7, add `'concepts'` store.
- **Modify** `store.js` — `getConcepts` / `getAllConcepts` / `setConcepts` (CRUD) + a store test (`tests/store-concepts.test.js`).
- **Modify** `providers.js` — embeddings capability metadata + `providerSupportsEmbeddings`.
- **Modify** `background.js` — persist atoms on deep-dive completion; `callEmbeddings`; embed-on-deep-dive (provider-gated, best-effort).

## Testing

- **vitest (pure):** `concepts.js` — `cosineSimilarity` (orthogonal=0, identical=1, length-mismatch=0), `normalizeConcept`, `lexicalMatcher` (shared-key linking + near-dup merge), `embeddingMatcher` (links above threshold using hand-built vectors), `deriveConceptLinks` hybrid selection (both-have-vectors → embedding; else lexical), `conceptIndex` shape.
- **vitest + fake-indexeddb:** concepts CRUD round-trip; v7 store creation.
- **Provider/AI:** `callEmbeddings` tested with a mocked `global.fetch` (mirrors `tests/fetcher.test.js`), incl. the error→null path; `providerSupportsEmbeddings` table tests.
- Existing suite green; `eslint .` 0 errors; HTML gate passes; `node --check` on touched files.

## Constraints

- Zero-build, zero-dep, vanilla ES modules. Embeddings via the BYO-key provider; vectors in IDB; cosine local — **no hosted backend**.
- `background.js`/AI changes are scoped to the embeddings path only; the existing scan/deep-dive/lens contracts are untouched.
- Mono Ink etc. apply once 2b adds UI (none here).

## Acceptance criteria

- [ ] After a deep dive, the repo's atoms are persisted to the `concepts` store (best-effort; failure never breaks the scan).
- [ ] With an embeddings-capable provider configured, atom vectors are computed + cached; with Anthropic (or any without an endpoint), `vectors` is `null` and the lexical matcher is used.
- [ ] `deriveConceptLinks` links repos by shared concepts and reports the shared concept labels; hybrid selection uses embeddings only when both repos have vectors, else lexical.
- [ ] `concepts.js` is fully unit-tested (cosine, normalize, both matchers, hybrid selection, index); concepts persistence tested with fake-indexeddb; `callEmbeddings` tested against a mocked fetch incl. the error→null fallback.
- [ ] No hosted backend added; the embeddings call is the only new provider call; existing scan/lens contracts unchanged.
- [ ] All existing tests pass + new tests; `eslint .` 0 errors; HTML gate passes.

## Resolved decisions

- Slice = 2a substrate; matcher = hybrid (embeddings + lexical fallback, per-repo); build lexical-first then embeddings.
- Atoms persisted to a new `concepts` IDB store (v7), keyed by raw repoId, CRUD-only store API.
- Embeddings via an OpenAI-compatible `/embeddings` call in `background.js`, provider-gated; vectors local; cosine local.
- No UI in 2a (deferred to 2b).
