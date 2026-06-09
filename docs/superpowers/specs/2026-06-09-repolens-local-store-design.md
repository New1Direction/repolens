# RepoLens Local Store — Removing the VelesDB Dependency (Design)

**Date:** 2026-06-09
**Status:** Proposed — awaiting review
**Goal:** Make RepoLens persist everything itself, in-browser, so it can be released publicly (including the Chrome Web Store) with zero setup — no external database, no daemon to run. All existing features keep working. The VelesDB name is removed from the product.

---

## 1. Why

RepoLens currently stores every analysis in a local **VelesDB** server (`localhost:9090`): a vector collection `repos` and a graph collection `repos_graph`. That was a build-time shortcut. For a public release it's a blocker — you cannot ask Web Store users to download and run a database daemon, and the dependency carries another project's branding.

### What RepoLens actually uses VelesDB for

Investigation of `velesdb.js` (the only client; imported by 5 files: `background.js`, `options.js`, `library.js`, `output-tab.js`, `graph.js`) shows three jobs, none of which need a real database:

1. **Document store** — save a repo's analysis payload keyed by `hashRepoId`. The stored `vector` is a hardcoded dummy `[0.0]`; **no vector/embedding search is performed.**
2. **Text search** — `findSimilar` and `searchLibrary` issue `/search/text` with queries like `"<language> <category>"`. Both already degrade to `[]` on any failure, so they are non-critical.
3. **Graph** — `repos_graph` stores nodes and edges; `getEgoGraph` reads a node's edges (both directions) plus neighbor payloads for the Connections tab. Reads degrade to `null`.

All of this can be re-implemented inside the extension with **IndexedDB** (browser-native, no permission beyond the `storage` already in the manifest) plus a little client-side JavaScript.

---

## 2. Architecture

### 2.1 Repository pattern with a swappable backend

A single storage contract, with IndexedDB as the default (and only, for now) implementation. This is the seam that covers "might want interop/sync later": a future remote/sync backend implements the same contract without touching any UI file.

```
StorageBackend (contract)
├── repos:  saveRepo(payload) · getRepo(id) · allRepos()
└── graph:  upsertNode(id, payload) · addEdge(edge) · nodeEdges(id) · getNodePayload(id)

IdbBackend  — IndexedDB implementation (default, this spec)
RemoteBackend — future (out of scope): sync / server / doc-system push
```

### 2.2 Module layout (all under `store/`, new)

- `store/idb.js` — minimal IndexedDB helper: open the `repolens` DB (version 1) with object stores `repos` (keyPath `id`), `nodes` (keyPath `id`), `edges` (keyPath `id`); promise-wrapped `get` / `put` / `getAll` / `del`.
- `store/search.js` — pure client-side ranker `rankRepos(rows, query, { excludeId, topK })`: tokenize the query and score each row by overlap across `language`, `category`, `tags`, `name`, and `eli5`. No DOM, no IndexedDB → unit-tested in isolation.
- `store/egograph.js` — pure `buildEgoGraph(centerId, repoId, edges, nodePayloads)` returning `{ center, edges, neighbors }`, identical in shape to today's `getEgoGraph`. No I/O → unit-tested.
- `store.js` — **the public module that replaces `velesdb.js`.** Exposes the same function names the app already calls, wiring `IdbBackend` + `search` + `egograph` together.

### 2.3 Public API (replaces `velesdb.js` exports)

Function **names stay the same** so consumers change minimally; the `velesdbUrl` first argument is **dropped** (there is no server). The plan enumerates every call site across the 5 files.

| Old (`velesdb.js`) | New (`store.js`) | Behavior |
|---|---|---|
| `saveAnalysis(url, analysis)` | `saveAnalysis(analysis)` | put into `repos` store by `hashRepoId`; best-effort graph node upsert |
| `saveRepo(url, analysis)` | `saveRepo(analysis)` | put the full payload (same fields as today, minus dummy vector) |
| `scrollPoints(url, opts)` | `scrollPoints(opts)` | `allRepos()` → `[{ id, payload }]` |
| `scrollLibrary(url, opts)` | `scrollLibrary(opts)` | `allRepos()` → trimmed rows (repoId/name/capabilities/eli5), deriving caps when absent |
| `findSimilar(url, q)` | `findSimilar(q)` | `rankRepos(allRepos, "<lang> <cat>", { excludeId, topK: 3 })` |
| `searchLibrary(url, q)` | `searchLibrary(q)` | `rankRepos(...)` → richer rows |
| `upsertNode(url, id, p)` | `upsertNode(id, p)` | put into `nodes` |
| `addEdge(url, edge)` | `addEdge(edge)` | put into `edges` (keyPath `id` = idempotent upsert) |
| `getEgoGraph(url, repoId)` | `getEgoGraph(repoId)` | read edges touching `hashRepoId`, gather neighbors, `buildEgoGraph(...)` |
| `pingVelesdb(url)` | *(removed)* | nothing to ping; callers that gated on it treat the store as always-ready |
| `initCollection` / `initGraphCollection` | *(removed)* | IndexedDB stores are created on DB open |
| `normalizeVelesdbUrl` / `alternateLocalUrl` / `DEFAULT_VELESDB_URL` | *(removed)* | no URLs |

`hashRepoId` moves into `store.js` unchanged (still the key derivation).

### 2.4 Settings (`options.js`, `options.html`)

- Remove the VelesDB URL field and its liveness/ping UI from the normal settings flow.
- Add a single, clearly-labeled one-time **"Import library from VelesDB"** action (see §3). It is the only place a VelesDB URL is entered, and only for migration.

### 2.5 Background (`background.js`)

- `saveAnalysis` / save flows drop `initCollection`, the alternate-port self-heal, and ping gating.
- Graph writes (`upsertNode` / `addEdge`) keep their best-effort wrapping — a graph hiccup must never fail the repo save.

---

## 3. Migration: one-time "Import from VelesDB"

So your existing library (the 67 repos and their analyses) is not lost.

- A dedicated module `migrate/velesdb-import.js` holds **only the read side** (`scrollPoints` against a user-supplied URL, default `http://localhost:9090`). This isolates the VelesDB name to a single optional file that can be deleted after you've migrated.
- Flow: user clicks Import → enters/confirms URL → module scrolls all points from the running VelesDB → each payload is written via `store.saveRepo` → progress + final count reported.
- **Scope:** repo payloads only. The Connections **graph is not migrated** (it rebuilds naturally as you use the app); this is called out in the UI so it isn't a surprise. Idempotent — re-running overwrites by `hashRepoId`, never duplicates.

---

## 4. Error handling

- Reads (`scrollPoints`, `findSimilar`, `searchLibrary`, `getEgoGraph`) degrade to `[]` / `null` exactly as today, so the UI stays graceful if IndexedDB is unavailable (e.g. private-mode quirks).
- `saveRepo` throws on failure (as today) so `background.js` can catch and surface it.
- Graph writes are best-effort and swallowed, matching current behavior.

---

## 5. Testing

- **Pure units (no I/O):** `rankRepos` (ordering, exclude, topK, empty query) and `buildEgoGraph` (center, both-direction edges, neighbor assembly) — straightforward vitest.
- **IndexedDB round-trips:** add `fake-indexeddb` as a devDependency; test `store.js` end-to-end in vitest — `saveRepo → scrollPoints`, `addEdge → getEgoGraph`, idempotent upsert by id.
- **Regression:** the existing 279 tests stay green; consumer-file edits are import/signature changes covered by their current tests.
- Target: maintain ≥80% coverage on the new `store/` modules.

---

## 6. Out of scope (YAGNI)

- Real vector/embedding similarity search (never used — dummy vector today).
- A remote/sync/server backend (the `StorageBackend` seam is left, but nothing is built).
- Migrating the Connections graph from VelesDB (repos migrate; edges rebuild through use).

---

## 7. Definition of done

- `velesdb.js` is removed; `store.js` + `store/*` provide all persistence via IndexedDB.
- All 5 consumer files compile and pass tests against the new API.
- A working one-time "Import from VelesDB" action in settings.
- No `localhost`/`127.0.0.1` host permission needed for persistence (it may remain only if the optional `repolens-runner` is still used for measured facts — a separate concern).
- The extension installs and fully works (analyze → save → Library → Connections) with **no external service running.**
