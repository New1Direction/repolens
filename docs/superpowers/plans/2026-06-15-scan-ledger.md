# Scan Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a versioned, capped history of every repo scan and surface each repo's trajectory (a health sparkline on library cards + a "History" strip on the Verdict tab).

**Architecture:** A new additive IndexedDB store (`snapshots`, one record per repo holding a capped `snaps[]` array). All logic lives in a new pure module `snapshots.js` (no DOM/chrome); `store.js` adds thin IndexedDB wrappers and seeds a snapshot on every `saveRepo`. The UI reads snapshots (batched for the library) and draws an inline-SVG sparkline. Snapshots round-trip through the existing backup envelope.

**Tech Stack:** Vanilla ES modules (no build step), IndexedDB (promise-wrapped in `store/idb.js`), Vitest + `fake-indexeddb` for tests.

**Spec:** `docs/superpowers/specs/2026-06-15-scan-ledger-design.md`

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `snapshots.js` | Pure ledger logic: `toSnapshot`, `appendSnapshot`, `snapshotTrend`, `sparkline` | **create** |
| `tests/snapshots.test.js` | Unit tests for the above | **create** |
| `diff-analysis.js` | Reuse its `FIT_ORDER` (export it) | modify (1 line) |
| `store/idb.js` | Add the `snapshots` object store (v3→v4) | modify |
| `store.js` | `appendScanSnapshot`, `listSnapshots`, `listAllSnapshots`; call from `saveRepo`; backup wiring | modify |
| `backup.js` | Include `snapshots` in the envelope; bump `BACKUP_VERSION` | modify |
| `library.js` | Batch-load snapshots in `init()`; draw the card sparkline | modify |
| `output-tab.js` | `renderHistory(d)` — the Verdict "History" strip | modify |
| `output-tab.html` | A `<div id="scan-history">` host for the strip | modify |

Notes carried from the spec into this plan:
- **Trigger:** every scan. **Metric:** health. **Cap:** 30/repo (ring buffer).
- **Seeding (refines the spec's "backfill on read"):** seed the *prior* scan into the ledger at scan time, inside `appendScanSnapshot`, using the old payload `saveRepo` already reads. This is strictly better than read-time backfill — no write-on-read side effect, and an existing repo's first re-scan yields a real 2-point trend instead of one dead point. `listSnapshots` therefore stays a pure read.
- **Trend computation (refines the spec's "reuse `diffAnalyses`"):** `snapshotTrend` computes deltas directly rather than feeding snapshots through `diffAnalyses`. Reason: snapshots store the already-*derived* `fit` and flag *titles* (no severity), so `diffAnalyses`' `_fitLevel` would re-derive fit from lossy data and get it wrong. Direct computation uses the stored fit and is simpler and correct. The one thing reused is `FIT_ORDER` (now exported from `diff-analysis.js`), so the constant isn't copied a fourth time.

---

### Task 1: Pure `snapshots.js` module + tests

**Files:**
- Create: `snapshots.js`
- Create: `tests/snapshots.test.js`
- Modify: `diff-analysis.js:4` (export `FIT_ORDER`)

- [ ] **Step 1: Export `FIT_ORDER` from `diff-analysis.js`**

Change line 4 from `const FIT_ORDER = ['strong', 'solid', 'care', 'risky'];` to:

```js
export const FIT_ORDER = ['strong', 'solid', 'care', 'risky'];
```

(Avoids a 4th copy of the constant; the rest of `diff-analysis.js` is unchanged.)

- [ ] **Step 2: Write the failing tests** — `tests/snapshots.test.js`

```js
import { describe, it, expect } from 'vitest';
import { toSnapshot, appendSnapshot, snapshotTrend, sparkline, SNAPSHOT_CAP } from '../snapshots.js';

describe('toSnapshot', () => {
  it('trims a payload to the snapshot shape, normalizing health and flags', () => {
    const snap = toSnapshot(
      { repoId: 'a/b', health: 88, stars: 1200, red_flags: [{ title: 'No tests' }, { title: '' }], saved_at: '2026-06-01T00:00:00.000Z' },
      '2026-06-01T00:00:00.000Z'
    );
    expect(snap).toEqual({
      ts: '2026-06-01T00:00:00.000Z',
      health: 88,
      fit: 'strong',
      stars: 1200,
      flags: ['No tests'],
      version: null,
    });
  });
  it('accepts health as a { score } object and defaults ts to saved_at', () => {
    const snap = toSnapshot({ repoId: 'a/b', health: { score: 60 }, stars: 0, red_flags: [], saved_at: '2026-06-02T00:00:00.000Z' });
    expect(snap.health).toBe(60);
    expect(snap.ts).toBe('2026-06-02T00:00:00.000Z');
    expect(snap.fit).toBe('care'); // 60, 0 flags
  });
  it('yields null health when absent', () => {
    expect(toSnapshot({ repoId: 'a/b', red_flags: [] }, '2026-06-01T00:00:00.000Z').health).toBeNull();
  });
});

describe('appendSnapshot', () => {
  it('appends immutably and never mutates the input', () => {
    const a = [{ ts: '1' }];
    const out = appendSnapshot(a, { ts: '2' });
    expect(out).toHaveLength(2);
    expect(a).toHaveLength(1);
  });
  it('keeps only the most recent `cap`', () => {
    const many = Array.from({ length: SNAPSHOT_CAP }, (_, i) => ({ ts: String(i) }));
    const out = appendSnapshot(many, { ts: 'new' }, SNAPSHOT_CAP);
    expect(out).toHaveLength(SNAPSHOT_CAP);
    expect(out[0].ts).toBe('1');
    expect(out[out.length - 1].ts).toBe('new');
  });
  it('handles a non-array prev', () => {
    expect(appendSnapshot(undefined, { ts: 'x' })).toEqual([{ ts: 'x' }]);
  });
});

describe('snapshotTrend', () => {
  const snaps = [
    { ts: '2026-06-01T00:00:00.000Z', health: 72, fit: 'care', stars: 100, flags: ['No tests', 'Stale'] },
    { ts: '2026-06-11T00:00:00.000Z', health: 91, fit: 'strong', stars: 150, flags: ['No tests'] },
  ];
  it('returns null for <2 points', () => {
    expect(snapshotTrend([])).toBeNull();
    expect(snapshotTrend([snaps[0]])).toBeNull();
  });
  it('computes health delta, fit direction, flag diffs and day span', () => {
    const t = snapshotTrend(snaps);
    expect(t.count).toBe(2);
    expect(t.healthDelta).toBe(19);
    expect(t.fitFrom).toBe('care');
    expect(t.fitTo).toBe('strong');
    expect(t.fitDirection).toBe('up');
    expect(t.flagsResolved).toEqual(['Stale']);
    expect(t.flagsNew).toEqual([]);
    expect(t.daysSpan).toBe(10);
    expect(t.series).toHaveLength(2);
  });
});

describe('sparkline', () => {
  it('returns null for <2 plottable points', () => {
    expect(sparkline([{ health: 5 }])).toBeNull();
    expect(sparkline([{ health: null }, { health: null }])).toBeNull();
  });
  it('builds an svg polyline scaled to the box', () => {
    const svg = sparkline([{ health: 0 }, { health: 50 }, { health: 100 }], { width: 100, height: 20 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    // min=0 → y=height(20); max=100 → y=0; x spans 0..100
    expect(svg).toContain('0.0,20.0');
    expect(svg).toContain('100.0,0.0');
  });
});
```

- [ ] **Step 3: Run the tests, verify they FAIL**

Run: `npx vitest run tests/snapshots.test.js`
Expected: FAIL — "Failed to resolve import '../snapshots.js'".

- [ ] **Step 4: Implement `snapshots.js`**

```js
// snapshots.js — pure helpers for the Scan Ledger: turn a repo payload into a
// trimmed snapshot, maintain a capped per-repo history, and derive a trend +
// sparkline. No DOM, no chrome, no IndexedDB — fully unit-testable.

import { deriveFit } from './verdict.js';
import { FIT_ORDER } from './diff-analysis.js';

export const SNAPSHOT_CAP = 30;

/** Normalize a payload's health (number or { score }) to a finite number or null. */
function snapHealth(payload) {
  const h = payload && payload.health;
  const n = Number(h && typeof h === 'object' ? h.score : h);
  return Number.isFinite(n) ? n : null;
}

/**
 * Trim a repo payload to a Snapshot. `ts` is injectable for deterministic tests;
 * it defaults to the payload's saved_at, then now.
 * @returns {{ ts:string, health:number|null, fit:string, stars:number, flags:string[], version:string|null }}
 */
export function toSnapshot(payload, ts) {
  const health = snapHealth(payload);
  const fit = deriveFit({
    health: { score: health },
    red_flags: (payload && payload.red_flags) || [],
    pros: (payload && payload.pros) || [],
    cons: (payload && payload.cons) || [],
  }).level;
  return {
    ts: ts || (payload && payload.saved_at) || new Date().toISOString(),
    health,
    fit,
    stars: Number(payload && payload.stars) || 0,
    flags: ((payload && payload.red_flags) || []).map((f) => f && f.title).filter(Boolean),
    version: (payload && payload.version) || null,
  };
}

/** Append a snapshot immutably, keeping only the most recent `cap`. */
export function appendSnapshot(snaps, snap, cap = SNAPSHOT_CAP) {
  const next = [...(Array.isArray(snaps) ? snaps : []), snap];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Direction of a fit change: 'up' (improved), 'down' (worse), 'same'. Lower index = better. */
function fitDirection(from, to) {
  const a = FIT_ORDER.indexOf(from);
  const b = FIT_ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 'same';
  return b < a ? 'up' : 'down';
}

/**
 * Derive a trend from a snapshot list (oldest→newest). Returns null if <2 points.
 * @returns {null | { count, series, first, latest, healthDelta, fitFrom, fitTo,
 *   fitDirection, flagsResolved, flagsNew, daysSpan }}
 */
export function snapshotTrend(snaps) {
  const list = (Array.isArray(snaps) ? snaps : []).filter((s) => s && s.ts);
  if (list.length < 2) return null;
  const first = list[0];
  const latest = list[list.length - 1];
  const series = list.map((s) => ({ ts: s.ts, health: s.health, fit: s.fit, stars: s.stars }));
  const healthDelta =
    first.health != null && latest.health != null ? latest.health - first.health : null;
  const firstFlags = new Set(first.flags || []);
  const latestFlags = new Set(latest.flags || []);
  return {
    count: list.length,
    series,
    first,
    latest,
    healthDelta,
    fitFrom: first.fit,
    fitTo: latest.fit,
    fitDirection: fitDirection(first.fit, latest.fit),
    flagsResolved: [...firstFlags].filter((t) => !latestFlags.has(t)),
    flagsNew: [...latestFlags].filter((t) => !firstFlags.has(t)),
    daysSpan: Math.max(0, Math.round((Date.parse(latest.ts) - Date.parse(first.ts)) / 86_400_000)),
  };
}

/**
 * Build an inline-SVG sparkline string from a trend series. Plots `metric`
 * (default 'health'), skipping null points. Returns null if <2 plottable points.
 */
export function sparkline(series, { metric = 'health', width = 120, height = 32, stroke = 'currentColor' } = {}) {
  const all = Array.isArray(series) ? series : [];
  const pts = all.map((s, i) => ({ i, v: Number(s && s[metric]) })).filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const n = all.length;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * width);
  const y = (v) => height - ((v - min) / span) * height;
  const coords = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const last = pts[pts.length - 1];
  return (
    `<svg class="rl-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" aria-hidden="true">` +
    `<polyline points="${coords.join(' ')}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="2.4" fill="${stroke}"/>` +
    `</svg>`
  );
}
```

- [ ] **Step 5: Run the tests, verify they PASS**

Run: `npx vitest run tests/snapshots.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add snapshots.js tests/snapshots.test.js diff-analysis.js
git commit -m "feat(ledger): pure snapshots module (toSnapshot/appendSnapshot/snapshotTrend/sparkline)"
```

---

### Task 2: Add the `snapshots` IndexedDB store (v3 → v4)

**Files:**
- Modify: `store/idb.js:5-9`

- [ ] **Step 1: Bump the schema**

Replace the version/comment/STORES block (lines 5-9) with:

```js
// v2 added the 'collections' store. v3 added the 'decisions' store. v4 added the
// 'snapshots' store (the Scan Ledger). Each upgrade is additive — onupgradeneeded
// creates any store in STORES that doesn't already exist, so existing data survives.
const DB_VERSION = 4;
const STORES = ['repos', 'nodes', 'edges', 'collections', 'decisions', 'snapshots'];
```

- [ ] **Step 2: Verify nothing broke**

Run: `npx vitest run tests/idb.test.js tests/store.test.js`
Expected: PASS (existing IndexedDB tests still green — the change is purely additive).

- [ ] **Step 3: Commit**

```bash
git add store/idb.js
git commit -m "feat(ledger): add 'snapshots' object store (idb v3->v4, additive)"
```

---

### Task 3: `store.js` wrappers + `saveRepo` hook

**Files:**
- Modify: `store.js` (import; `saveRepo`; three new functions)
- Modify: `tests/store.test.js` (new cases)

- [ ] **Step 1: Write the failing tests** — append to `tests/store.test.js`

```js
import { appendScanSnapshot, listSnapshots, listAllSnapshots, saveRepo } from '../store.js';

describe('scan ledger', () => {
  it('saveRepo records a snapshot and re-scan appends a second point', async () => {
    await saveRepo({ repoId: 'led/one', health: 70, stars: 10, red_flags: [] });
    await saveRepo({ repoId: 'led/one', health: 90, stars: 20, red_flags: [] });
    const snaps = await listSnapshots('led/one');
    expect(snaps.length).toBe(2);
    expect(snaps[0].health).toBe(70);
    expect(snaps[1].health).toBe(90);
  });

  it('caps history at 30 (ring buffer)', async () => {
    for (let i = 0; i < 35; i++) {
      await appendScanSnapshot({ repoId: 'led/cap', health: i, stars: 0, red_flags: [], saved_at: `2026-06-01T00:00:${String(i).padStart(2, '0')}.000Z` });
    }
    const snaps = await listSnapshots('led/cap');
    expect(snaps.length).toBe(30);
    expect(snaps[snaps.length - 1].health).toBe(34);
  });

  it('seeds the prior scan into the ledger on first re-scan of an existing repo', async () => {
    // A repo scanned before the ledger existed has a repos payload but no snapshots.
    // appendScanSnapshot must record that prior state (prevPayload) before the new one.
    const prev = { repoId: 'led/seed', health: 40, stars: 1, red_flags: [], saved_at: '2026-05-01T00:00:00.000Z' };
    const next = { repoId: 'led/seed', health: 80, stars: 2, red_flags: [], saved_at: '2026-06-01T00:00:00.000Z' };
    await appendScanSnapshot(next, prev);
    const snaps = await listSnapshots('led/seed');
    expect(snaps.map((s) => s.health)).toEqual([40, 80]);
  });

  it('listAllSnapshots returns a Map keyed by repoId', async () => {
    await saveRepo({ repoId: 'led/map', health: 60, stars: 0, red_flags: [] });
    const map = await listAllSnapshots();
    expect(map.has('led/map')).toBe(true);
    expect(Array.isArray(map.get('led/map'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run tests/store.test.js`
Expected: FAIL — `appendScanSnapshot`/`listSnapshots`/`listAllSnapshots` are not exported.

- [ ] **Step 3: Implement in `store.js`**

Add to the imports near the top (after the existing `./store/egograph.js` import on line 10):

```js
import { toSnapshot, appendSnapshot, SNAPSHOT_CAP } from './snapshots.js';
```

In `saveRepo`, the function already reads `existing` (line 26). Add the ledger write at the end of the function, immediately after `await idbPut('repos', { id: hashRepoId(analysis.repoId), payload });` (line 50):

```js
  await appendScanSnapshot(payload, existing?.payload);
```

Then add these three functions in the `// ─── repos` section (e.g. after `saveRepo`):

```js
/**
 * Append a snapshot for a repo's current payload (best-effort — a ledger write
 * must never fail a scan). `prevPayload` (the repo's previous state, which saveRepo
 * already reads) seeds one prior point the first time, so an existing repo's first
 * re-scan yields a real 2-point trend instead of losing its history.
 */
export async function appendScanSnapshot(payload, prevPayload) {
  if (!payload || !payload.repoId) return;
  try {
    const id = hashRepoId(payload.repoId);
    const rec = await idbGet('snapshots', id).catch(() => null);
    let snaps = rec && Array.isArray(rec.snaps) ? rec.snaps : [];
    if (!snaps.length && prevPayload && prevPayload.saved_at) {
      snaps = [toSnapshot(prevPayload)];
    }
    snaps = appendSnapshot(snaps, toSnapshot(payload), SNAPSHOT_CAP);
    await idbPut('snapshots', { id, repoId: payload.repoId, snaps });
  } catch {
    /* the ledger is additive; a write failure must not break the scan */
  }
}

/** A repo's snapshot history (oldest→newest). Best-effort — [] on failure. */
export async function listSnapshots(repoId) {
  try {
    const rec = await idbGet('snapshots', hashRepoId(repoId));
    return rec && Array.isArray(rec.snaps) ? rec.snaps : [];
  } catch {
    return [];
  }
}

/** All snapshot histories as a Map(repoId → snaps[]) for batch rendering. */
export async function listAllSnapshots() {
  try {
    const rows = await idbGetAll('snapshots');
    return new Map((rows || []).filter((r) => r && r.repoId).map((r) => [r.repoId, r.snaps || []]));
  } catch {
    return new Map();
  }
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/store.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite green**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add store.js tests/store.test.js
git commit -m "feat(ledger): record + read snapshots in store.js, seed prior scan on saveRepo"
```

---

### Task 4: Backup round-trip for `snapshots`

**Files:**
- Modify: `backup.js` (version, MAX_ROWS, emptyValue, buildBackup, validateBackup, summarizeBackup)
- Modify: `store.js` (`exportStores`, `importStores`)
- Modify: `tests/backup.test.js`, `tests/store-backup.test.js` (new cases)

- [ ] **Step 1: Write the failing tests** — append to `tests/backup.test.js`

```js
import { buildBackup, validateBackup, BACKUP_VERSION } from '../backup.js';

describe('backup: snapshots', () => {
  const snapRow = { id: 1, repoId: 'a/b', snaps: [{ ts: '2026-06-01T00:00:00.000Z', health: 80, fit: 'solid', stars: 1, flags: [] }] };

  it('buildBackup includes snapshots and counts them', () => {
    const b = buildBackup({ snapshots: [snapRow], exportedAt: '2026-06-15T00:00:00.000Z' });
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.snapshots).toHaveLength(1);
    expect(b.counts.snapshots).toBe(1);
  });

  it('validateBackup keeps well-formed snapshot rows and drops malformed ones', () => {
    const { value } = validateBackup({
      format: 'repolens-backup',
      version: BACKUP_VERSION,
      snapshots: [snapRow, { id: 2 }, { repoId: 'x', snaps: [] }],
    });
    expect(value.snapshots).toHaveLength(1);
    expect(value.snapshots[0].repoId).toBe('a/b');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx vitest run tests/backup.test.js`
Expected: FAIL — `b.snapshots` is undefined / `value.snapshots` is undefined.

- [ ] **Step 3: Edit `backup.js`**

Bump the version (line 11):

```js
export const BACKUP_VERSION = 2;
```

Add a snapshots bound to `MAX_ROWS` (line 16) — append `, snapshots: 5000` inside the object:

```js
export const MAX_ROWS = { repos: 5000, nodes: 20000, edges: 50000, cache: 5000, collections: 2000, decisions: 5000, snapshots: 5000 };
```

Add a validator next to the others (after line 24):

```js
const snapshotOk = (r) => !!(r && r.id != null && r.repoId && Array.isArray(r.snaps));
```

In `emptyValue()` (line 28) add `snapshots: []`:

```js
  return { repos: [], nodes: [], edges: [], cache: [], collections: [], decisions: [], snapshots: [] };
```

In `buildBackup` (lines 37-50) add `snapshots` to the destructure, the `arr()` line, `counts`, and the body:

```js
export function buildBackup({ repos, nodes, edges, cache, collections, decisions, snapshots, exportedAt } = {}) {
  const r = arr(repos), n = arr(nodes), e = arr(edges), c = arr(cache), col = arr(collections), dec = arr(decisions), snap = arr(snapshots);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    counts: { repos: r.length, nodes: n.length, edges: e.length, cache: c.length, collections: col.length, decisions: dec.length, snapshots: snap.length },
    repos: r, nodes: n, edges: e, cache: c, collections: col, decisions: dec, snapshots: snap,
  };
}
```

In `validateBackup`'s `value` object (lines 83-90) add the snapshots line:

```js
    snapshots: clamp('snapshots', arr(obj.snapshots).filter(snapshotOk)),
```

In `summarizeBackup` (line 102) add `, snapshots: value.snapshots.length` to the returned object.

- [ ] **Step 4: Run, verify PASS**

Run: `npx vitest run tests/backup.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the IndexedDB I/O in `store.js`**

In `exportStores` (lines 234-243): add `idbGetAll('snapshots')` to the `Promise.all` and include it in the destructure + returned object:

```js
export async function exportStores() {
  const [repos, nodes, edges, collections, decisions, snapshots] = await Promise.all([
    idbGetAll('repos'),
    idbGetAll('nodes'),
    idbGetAll('edges'),
    idbGetAll('collections'),
    idbGetAll('decisions'),
    idbGetAll('snapshots'),
  ]);
  return { repos: repos || [], nodes: nodes || [], edges: edges || [], collections: collections || [], decisions: decisions || [], snapshots: snapshots || [] };
}
```

In `importStores` (lines 254-265): add `snapshots = []` to the params, the `replace` clear, the validRows line, and the write loop:

```js
export async function importStores({ repos = [], nodes = [], edges = [], collections = [], decisions = [], snapshots = [] } = {}, { mode = 'merge' } = {}) {
  if (mode === 'replace') {
    await Promise.all([idbClear('repos'), idbClear('nodes'), idbClear('edges'), idbClear('collections'), idbClear('decisions'), idbClear('snapshots')]);
  }
  const vr = validRows(repos), vn = validRows(nodes), ve = validRows(edges), vc = validRows(collections), vd = validRows(decisions), vs = validRows(snapshots);
  for (const row of vr) await idbPut('repos', row);
  for (const row of vn) await idbPut('nodes', row);
  for (const row of ve) await idbPut('edges', row);
  for (const row of vc) await idbPut('collections', row);
  for (const row of vd) await idbPut('decisions', row);
  for (const row of vs) await idbPut('snapshots', row);
  return { repos: vr.length, nodes: vn.length, edges: ve.length, collections: vc.length, decisions: vd.length, snapshots: vs.length };
}
```

Also add `idbClear('snapshots')` to the `clearLibrary()` `Promise.all` (line 269).

- [ ] **Step 6: Confirm the export/import HANDLERS pass snapshots through**

The library export handler is around `library.js:861` (`const [stores, cached] = await Promise.all([exportStores(), listCached()...])`). Open it and confirm `buildBackup` is called by spreading the stores object (e.g. `buildBackup({ ...stores, cache })`). Because `exportStores` now returns `snapshots`, a spread flows it through with no further change. If the handler enumerates fields explicitly instead of spreading, add `snapshots: stores.snapshots`. Likewise, find the import handler (it calls `importStores(...)` with `validateBackup(parsed).value`) and confirm it passes the whole `value` (which now includes `snapshots`). If it destructures explicitly, add `snapshots`.

- [ ] **Step 7: Round-trip test** — append to `tests/store-backup.test.js`

```js
import { saveRepo, exportStores, importStores, clearLibrary, listSnapshots } from '../store.js';

it('snapshots survive an export → clear → import round-trip', async () => {
  await saveRepo({ repoId: 'rt/one', health: 70, stars: 0, red_flags: [] });
  await saveRepo({ repoId: 'rt/one', health: 85, stars: 0, red_flags: [] });
  const dump = await exportStores();
  expect(dump.snapshots.length).toBe(1);
  await clearLibrary();
  expect(await listSnapshots('rt/one')).toEqual([]);
  await importStores(dump, { mode: 'replace' });
  const snaps = await listSnapshots('rt/one');
  expect(snaps.map((s) => s.health)).toEqual([70, 85]);
});
```

- [ ] **Step 8: Run, verify PASS + full suite**

Run: `npx vitest run tests/backup.test.js tests/store-backup.test.js && npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backup.js store.js tests/backup.test.js tests/store-backup.test.js library.js
git commit -m "feat(ledger): round-trip snapshots through the backup envelope (v2)"
```

---

### Task 5: Library card health sparkline

**Files:**
- Modify: `library.js` (import; module Map; load in `init()`; render in `card()`)

No unit test (DOM/SW shell, per repo norm); the `snapshotTrend`/`sparkline` math is already covered in Task 1. Verify manually.

- [ ] **Step 1: Import the helpers + store loader**

Add to the `library-data.js` import line area (top of file). Extend the existing `./store.js` import (line 6) to include `listAllSnapshots`, and add a new import for the pure helpers:

```js
import { listAllSnapshots } from './store.js'; // add to the existing store.js import list
import { snapshotTrend, sparkline } from './snapshots.js';
```

(Practically: append `listAllSnapshots` to the destructured names already imported from `./store.js` on line 6, and add the `snapshots.js` import below the `library-data.js` import on line 11.)

- [ ] **Step 2: Add a module-level snapshot map**

Next to `let allRows = [];` (line 44), add:

```js
let snapsByRepo = new Map(); // repoId → snaps[] (batch-loaded once in init)
```

- [ ] **Step 3: Batch-load snapshots in `init()`**

`init()` starts at line 2300 and builds rows at lines 2349-2351. Immediately before `const savedRows = points.map((p) => libraryRow(p.payload));` (line 2349), add:

```js
  snapsByRepo = await listAllSnapshots();
```

- [ ] **Step 4: Render the sparkline in `card()`**

In `card(r)`, just before the closing `</div>` of `.lc-meta` is built — i.e. insert a new line in the returned template right after the `.lc-meta` closing `</div>` (after line 155) and before the `${tags || boardDots ...}` line (156):

```js
    ${(() => {
      const trend = snapshotTrend(snapsByRepo.get(r.repoId) || []);
      if (!trend) return '';
      const svg = sparkline(trend.series, { metric: 'health', width: 96, height: 22 });
      if (!svg) return '';
      const sign = trend.healthDelta > 0 ? '+' : '';
      const delta = trend.healthDelta != null ? `${sign}${trend.healthDelta}` : '';
      return `<div class="lc-spark fit-${trend.fitTo}">${svg}<span class="lc-spark-cap">${delta ? `<b>${delta}</b> · ` : ''}${trend.count} scans${trend.daysSpan ? ` · ${trend.daysSpan}d` : ''}</span></div>`;
    })()}
```

- [ ] **Step 5: Add the sparkline styles** — append to `library.html` inside its `<style>` block (use the existing fit-token colors and `--text-faint`):

```css
.lc-spark { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--text-faint); }
.lc-spark.fit-strong { color: var(--ok-ink, #2f7d34); }
.lc-spark.fit-solid  { color: var(--accent, #2f5fae); }
.lc-spark.fit-care   { color: var(--warn-ink, #b8902a); }
.lc-spark.fit-risky  { color: var(--bad-ink, #b4322a); }
.lc-spark .rl-spark { flex-shrink: 0; }
.lc-spark-cap { font-size: 11px; color: var(--text-faint); }
.lc-spark-cap b { color: var(--text); }
@media (prefers-reduced-motion: reduce) { .lc-spark .rl-spark { transition: none; } }
```

(Confirm the exact fit-token variable names by grepping `library.html` / `themes.css` for `--ok-ink` etc.; the `color:` on `.rl-spark` inherits to its `stroke="currentColor"`.)

- [ ] **Step 6: Verify manually (load the unpacked extension)**

Run: `npm test` (sanity — should still be green).
Then load the extension and open the Library: scan a repo twice (or import a backup that has ≥2 snapshots for a repo); the card shows a tinted sparkline + `+Δ · N scans · Nd`. Cards with <2 scans show nothing.

- [ ] **Step 7: Commit**

```bash
git add library.js library.html
git commit -m "feat(ledger): health sparkline on library cards"
```

---

### Task 6: Verdict tab "History" strip

**Files:**
- Modify: `output-tab.html` (host div + styles)
- Modify: `output-tab.js` (import; `renderHistory`; call from `renderPage`)

- [ ] **Step 1: Add the host element** — in `output-tab.html`, add an empty host where the verdict landing renders (next to `#highlights`):

```html
<div id="scan-history"></div>
```

(Grep `output-tab.html` for `id="highlights"` and place `#scan-history` directly after that element so the strip sits with the verdict landing.)

- [ ] **Step 2: Import the helpers in `output-tab.js`**

Confirm whether `output-tab.js` already imports from `./store.js` (grep). Add:

```js
import { listSnapshots } from './store.js';
import { snapshotTrend, sparkline } from './snapshots.js';
```

- [ ] **Step 3: Add `renderHistory` and call it from `renderPage`**

In `renderPage(d)` (line 715), add a call after `renderHighlights(d);`:

```js
  renderHistory(d);
```

Add the function near `renderHighlights` (after line 713):

```js
async function renderHistory(d) {
  const host = document.getElementById('scan-history');
  if (!host || !d || !d.repoId) return;
  const trend = snapshotTrend(await listSnapshots(d.repoId));
  if (!trend) { host.innerHTML = ''; return; }
  const svg = sparkline(trend.series, { metric: 'health', width: 160, height: 30 }) || '';
  const sign = trend.healthDelta > 0 ? '+' : '';
  const healthLine = trend.series.map((s) => (s.health == null ? '–' : s.health)).join(' → ');
  const fitLine = trend.series.map((s) => esc(s.fit)).join(' → ');
  const arrow = trend.fitDirection === 'up' ? '↑' : trend.fitDirection === 'down' ? '↓' : '';
  const resolved = trend.flagsResolved.length ? `−${trend.flagsResolved.length} resolved` : '';
  const added = trend.flagsNew.length ? `+${trend.flagsNew.length} new` : '';
  const flags = [resolved, added].filter(Boolean).join(' · ') || 'no flag changes';
  host.innerHTML = `<div class="sh-card sh-fit-${esc(trend.fitTo)}">
    <div class="sh-head">History · ${trend.count} scans${trend.daysSpan ? ` · ${trend.daysSpan}d` : ''}</div>
    <div class="sh-row"><span class="sh-k">Health</span><span class="sh-v">${svg} ${esc(healthLine)} ${trend.healthDelta != null ? `<b>(${sign}${trend.healthDelta})</b>` : ''}</span></div>
    <div class="sh-row"><span class="sh-k">Fit</span><span class="sh-v">${fitLine} <span class="sh-arrow">${arrow}</span></span></div>
    <div class="sh-row"><span class="sh-k">Flags</span><span class="sh-v">${esc(flags)}</span></div>
  </div>`;
}
```

(`esc` is already imported in `output-tab.js` — confirm via grep; it is used throughout. `svg`/`healthLine` are built from app-derived numbers/enums, not user free-text, but flags/fit are escaped.)

- [ ] **Step 4: Add the styles** — append to `output-tab.html`'s `<style>` block:

```css
.sh-card { border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin: 16px 0; background: var(--surface); }
.sh-head { font: 600 11px ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 8px; }
.sh-row { display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center; padding: 5px 0; border-top: 1px solid var(--border-2); font-size: 13px; }
.sh-k { font: 600 10px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
.sh-v { color: var(--text-sub); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sh-v b { color: var(--text); }
.sh-card.sh-fit-strong .rl-spark { color: var(--ok-ink, #2f7d34); }
.sh-card.sh-fit-solid  .rl-spark { color: var(--accent, #2f5fae); }
.sh-card.sh-fit-care   .rl-spark { color: var(--warn-ink, #b8902a); }
.sh-card.sh-fit-risky  .rl-spark { color: var(--bad-ink, #b4322a); }
.sh-arrow { color: var(--ok-ink, #2f7d34); font-weight: 700; }
```

- [ ] **Step 5: Verify manually**

Open a repo's result tab for a repo with ≥2 scans: a "History" strip appears under the verdict landing with the health sparkline, the health/fit progressions, and flag changes. A repo with <2 scans shows nothing.

- [ ] **Step 6: Full suite + lint, then commit**

Run: `npm test && npm run lint`
Expected: tests PASS, lint 0 errors.

```bash
git add output-tab.html output-tab.js
git commit -m "feat(ledger): History strip on the Verdict tab"
```

---

## Done criteria

- `npm test` green (snapshots + store + backup cases added).
- `npm run lint` 0 errors.
- Re-scanning a repo twice shows a health sparkline on its library card and a History strip on its Verdict tab; a single scan shows neither.
- A library export/import preserves snapshot history.
- Existing data and all prior tests are unaffected (additive migration).
