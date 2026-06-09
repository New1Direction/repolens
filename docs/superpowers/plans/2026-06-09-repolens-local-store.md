# RepoLens Local Store — Implementation Plan

> **For agentic workers:** TDD, bite-sized steps, frequent commits. Steps use `- [ ]` checkboxes.

**Goal:** Replace the VelesDB server dependency with an in-extension IndexedDB store of the same shape, so RepoLens works with zero setup and can ship publicly.

**Architecture:** New `store.js` (+ `store/idb.js`, `store/search.js`, `store/egograph.js`) replaces `velesdb.js`, keeping the same exported function names minus the `velesdbUrl` argument. A one-time `migrate/velesdb-import.js` reads an existing VelesDB to backfill the new store.

**Tech Stack:** Vanilla ES modules, IndexedDB, Vitest + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-06-09-repolens-local-store-design.md`

---

## Task 1: Test harness — fake-indexeddb

**Files:** Modify `package.json`; verify `vitest.config.js`.

- [ ] Add `fake-indexeddb` to devDependencies; `npm install`.
- [ ] Tests that touch IndexedDB begin with `import 'fake-indexeddb/auto';` (registers a global `indexedDB`).
- [ ] Run `npx vitest run` → still 279 passing (no behavior change yet).

---

## Task 2: `store/idb.js` — promise-wrapped IndexedDB helper

**Files:** Create `store/idb.js`; Test `tests/idb.test.js`.

Single DB `repolens` v1 with stores `repos`, `nodes`, `edges`, each `keyPath: 'id'`.

```js
// store/idb.js
const DB_NAME = 'repolens';
const DB_VERSION = 1;
const STORES = ['repos', 'nodes', 'edges'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idbPut = (store, value) => run(store, 'readwrite', (os) => os.put(value));
export const idbGet = (store, id) => run(store, 'readonly', (os) => os.get(id));
export const idbGetAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const idbDelete = (store, id) => run(store, 'readwrite', (os) => os.delete(id));
export const idbClear = (store) => run(store, 'readwrite', (os) => os.clear());
```

- [ ] **Test:** put then get returns the value; getAll returns all; clear empties; delete removes one.
- [ ] Run `npx vitest run tests/idb.test.js` → PASS.
- [ ] Commit.

---

## Task 3: `store/search.js` — pure client-side ranker

**Files:** Create `store/search.js`; Test `tests/store-search.test.js`.

```js
// store/search.js
const STOP = new Set(['', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is']);

export function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t && !STOP.has(t));
}

/** Rank repo payloads by token overlap with `query`. Returns the matching payloads, best first. */
export function rankRepos(rows, query, { excludeId = null, topK = 3 } = {}) {
  const q = new Set(tokens(query));
  if (!q.size) return [];
  const scored = [];
  for (const r of rows) {
    if (!r || !r.repoId) continue;
    if (excludeId && r.repoId === excludeId) continue;
    const hay = new Set(
      tokens([r.language, r.category, (r.tags || []).join(' '), (r.capabilities || []).join(' '),
        r.repoId, r.eli5].join(' '))
    );
    let score = 0;
    for (const t of q) if (hay.has(t)) score++;
    if (score > 0) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.r);
}
```

- [ ] **Test:** ranks higher overlap first; `excludeId` drops self; `topK` caps; empty query → `[]`; no match → `[]`.
- [ ] Run → PASS. Commit.

---

## Task 4: `store/egograph.js` — pure ego-graph builder

**Files:** Create `store/egograph.js`; Test `tests/store-egograph.test.js`.

Mirrors the assembly currently in `velesdb.js#getEgoGraph` (same output shape).

```js
// store/egograph.js
export function buildEgoGraph(centerId, repoId, edges, nodePayloads = {}) {
  const centerKey = String(centerId);
  const norm = edges.map((e) => ({ source: String(e.source), target: String(e.target), label: e.label }));
  const neighborIds = [...new Set(norm.flatMap((e) => [e.source, e.target]).filter((id) => id !== centerKey))];
  const neighbors = neighborIds.map((id) => {
    const p = nodePayloads[id] || {};
    const isIdea = p.kind === 'idea';
    return {
      id,
      name: isIdea ? (p.title || 'idea') : (p.name || p.repoId || id),
      analyzed: !!p.analyzed,
      repoId: p.repoId || null,
      kind: p.kind || 'repo',
      pitch: p.pitch || '',
    };
  });
  return { center: { id: centerKey, repoId, name: repoId.split('/').pop() || repoId }, edges: norm, neighbors };
}
```

- [ ] **Test:** both-direction edges counted; center excluded from neighbors; idea vs repo naming; empty edges → empty neighbors.
- [ ] Run → PASS. Commit.

---

## Task 5: `store.js` — public API (replaces velesdb.js)

**Files:** Create `store.js`; Test `tests/store.test.js` (begins with `import 'fake-indexeddb/auto';`).

Exports the same names the app calls, minus `velesdbUrl`. Carries `hashRepoId` (copied verbatim from velesdb.js). Persists the same payload `saveRepo` builds today (including triage fields `health/red_flags/pros/cons/languages` and `saved_at`), minus the dummy vector.

Key functions: `hashRepoId`, `saveRepo`, `saveAnalysis`, `scrollPoints`, `scrollLibrary` (derives caps via `taxonomy.deriveCapabilities` when absent), `findSimilar`, `searchLibrary`, `upsertNode`, `addEdge`, `getEgoGraph`. Reads degrade to `[]`/`null` on error (try/catch); `saveRepo` throws.

`getEgoGraph(repoId)`: `centerKey = String(hashRepoId(repoId))`; read all `edges`, keep those touching `centerKey`; fetch each neighbor's `nodes` payload; return `buildEgoGraph(...)`. Wrap in try/catch → `null`.

- [ ] **Test (fake-indexeddb):** `saveRepo` → `scrollPoints` round-trip preserves payload + triage fields; `addEdge` → `getEgoGraph` returns the neighbor; idempotent upsert by id (two puts same id → one row); `findSimilar`/`searchLibrary` return ranked rows.
- [ ] Run → PASS. Commit.

---

## Task 6: Swap light consumers — graph.js, library.js, output-tab.js

**Files:** Modify `graph.js`, `library.js`, `output-tab.js`.

- [ ] `graph.js`: `import { hashRepoId } from './store.js';` (was `./velesdb.js`). No other change.
- [ ] `library.js`: import `scrollPoints` from `./store.js`; in `init()` drop the `velesdbUrl` storage read and call `await scrollPoints()` with no arg. Keep the empty-state copy (reword "VelesDB isn't reachable" → "nothing's been analyzed yet").
- [ ] `output-tab.js`: `import { findSimilar, getEgoGraph } from './store.js';` (drop `DEFAULT_VELESDB_URL`). At the 4 call sites (lines ~227, 268, 865, 1331) drop the `velesdbUrl` arg; remove the `velesdbUrl`/`DEFAULT_VELESDB_URL` resolution (~1266).
- [ ] Run `npx vitest run` → green. Commit.

---

## Task 7: Rework background.js — drop the velesdbUrl plumbing

**Files:** Modify `background.js`.

Transformation rules (apply at every site found in the coupling map):
- [ ] Import from `./store.js`: `saveAnalysis, searchLibrary, upsertNode, addEdge, scrollLibrary, scrollPoints, saveRepo`. Remove `normalizeVelesdbUrl`, `alternateLocalUrl`.
- [ ] Delete every `const velesdbUrl = ...` / `normalizeVelesdbUrl(...)` read and the storage `velesdbUrl` lookups.
- [ ] Drop the `velesdbUrl` first argument from all store calls: `saveAnalysis(data)`, `saveRepo(meta)`, `scrollPoints()`, `scrollLibrary()`, `searchLibrary({...})`, `upsertNode(id, p)`, `addEdge(edge)`.
- [ ] Remove the alternate-port self-heal block in `runAnalysis` (the `alternateLocalUrl` retry + re-save). A single `await saveAnalysis(data)` replaces it.
- [ ] Internal helpers `linkRepos`/`pinIdea` that took a `velesdbUrl` param: drop the param and its call-site argument.
- [ ] Run `npx vitest run` → green (background.js has no direct unit tests; rely on the suite + `node --check background.js`). Commit.

---

## Task 8: `migrate/velesdb-import.js` + options.js Import action

**Files:** Create `migrate/velesdb-import.js`; Modify `options.js`, `options.html`.

- [ ] `migrate/velesdb-import.js`: a read-only `importFromVelesdb(url, onProgress)` that POSTs `/v1/collections/repos/points/scroll` (the only VelesDB call left), then `saveRepo(payload)` into the new store for each point; returns `{ imported, failed }`. This is the single file that still references a VelesDB URL.
- [ ] `options.js`: remove `normalizeVelesdbUrl`/`pingVelesdb`/`DEFAULT_VELESDB_URL` import and the VelesDB-URL settings field/ping handler. Add an "Import library from VelesDB" button + a URL input (default `http://localhost:9090`) wired to `importFromVelesdb`, showing progress + final count.
- [ ] `options.html`: replace the VelesDB-URL settings row with the one-time Import control (clearly labeled "one-time migration").
- [ ] Run `npx vitest run` → green. Commit.

---

## Task 9: Remove velesdb.js + final verification

**Files:** Delete `velesdb.js`; Test `tests/velesdb.test.js` (delete or port).

- [ ] Confirm no remaining `from './velesdb.js'` imports: `grep -rn "velesdb.js" --include=*.js .` returns only `migrate/` HTTP path strings (not imports).
- [ ] Delete `velesdb.js`. Delete/port its test (`tests/velesdb.test.js`) — the store now owns this behavior (Tasks 2-5).
- [ ] `node --check` each modified `.js`; `npx vitest run` → all green; coverage ≥80% on `store/`.
- [ ] Manifest: keep `http://localhost/*` + `http://127.0.0.1/*` (still needed for the optional runner and the one-time import). No change required.
- [ ] Commit. Update README (remove "Powered by VelesDB" framing; note zero-setup storage).

---

## Self-review checklist
- Every `velesdb.js` export is either reimplemented in `store.js` or intentionally removed (ping/init/url helpers).
- No consumer still passes a `velesdbUrl`.
- Reads degrade gracefully; `saveRepo` still throws so callers can surface errors.
- Existing 279 tests + new `store/` tests all green.
