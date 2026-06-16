# Scan Ledger — Design

**Date:** 2026-06-15
**Status:** Approved in brainstorm → ready for implementation plan
**Scope (v1):** "Foundation + visible trajectory"

## Goal

RepoLens's stated direction is _"evaluations compound,"_ but `saveRepo` overwrites
the latest analysis on every re-scan and keeps only a single `prevFitLevel`, so the
existing `diffAnalyses()` engine can only ever compare two points. **Scan Ledger**
persists a versioned history of every scan per repo and surfaces each repo's
trajectory — turning the one-shot explainer into a longitudinal monitor, and laying
the substrate that later unlocks drift/regret alerts and decision-replay.

## Non-goals (v1)

- Drift/regret alerts wired to real history (deferred — the ledger is their substrate).
- Decision-replay, portfolio-level views (deferred).
- Editing/annotating past snapshots.
- No new network calls, no new permissions, no backend. 100% client-side.

## Confirmed decisions

- **Trigger:** record a snapshot on **every** successful scan (it's a _scan_ ledger).
- **Sparkline metric:** **health** over time.
- **Retention:** ring buffer, **30 snapshots/repo**, drop oldest.
- **Storage shape:** one record per repo holding a `snaps` array.

## Data model

New IndexedDB object store `snapshots`, keyed by `id` (same convention as every
existing store). **One record per repo:**

```
{
  id:     <repoHash>,   // hashRepoId(repoId) — the same hash store.js uses for 'repos'
  repoId: string,
  snaps:  Snapshot[]    // oldest → newest, max 30
}

Snapshot = {
  ts:      string,        // ISO timestamp; equals the scan's saved_at
  health:  number | null, // health score (0–100)
  fit:     'strong' | 'solid' | 'care' | 'risky' | 'unrated',
  stars:   number,
  flags:   string[],      // red_flag titles at scan time
  version: string | null  // repo HEAD sha / package version if known, else null
}
```

Rationale for one-record-per-repo: trivial retention (trim the array), a single
`idbGet` to read a repo's history, and far fewer rows than per-snapshot records.
`saveRepo` is the only writer and scans are serialized through the AI queue, so the
read-modify-write has no real race.

## Migration

`store/idb.js`: bump `DB_VERSION` 3 → 4 and add `'snapshots'` to `STORES`. The
existing `onupgradeneeded` creates any missing store, so all existing data survives
untouched — identical to the v1→v2 (`collections`) and v2→v3 (`decisions`) upgrades.

**Backfill:** a repo scanned before this feature has no `snapshots` record. On first
`listSnapshots`, if there's no record but the repo has a stored payload, synthesize a
single snapshot from that payload and persist it — so existing users see one point
immediately and the next scan adds the second.

## Pure logic — new `snapshots.js` (no DOM / no chrome)

- `toSnapshot(payload)` → `Snapshot` — extract the trimmed fields from a repo payload.
  Fit comes from `deriveFit(payload)?.level` (the same helper `store.js` already uses
  to compute `prevFitLevel`), so the ledger's fit matches the rest of the app.
- `appendSnapshot(snaps, snap, cap = 30)` → `Snapshot[]` — immutable: append, then
  keep only the last `cap`.
- `snapshotTrend(snaps)` → `{ series, first, latest, healthDelta, fitDirection,
  flagsResolved, flagsNew, daysSpan }`. Reuses `diffAnalyses()` for the first-vs-latest
  fit/flag deltas by adapting each snapshot to the shape it expects (`ts` → `cachedAt`).
  `series` is `[{ ts, health, fit, stars }]`.
- `sparkline(series, { metric = 'health', width, height })` → an SVG points/path
  **string** (string builder, like `graph.js` / `diagram.js` — no chart library).
  Returns `null` if fewer than 2 usable points.

`store.js` gains thin, non-pure wrappers that do the IndexedDB I/O and call the pure
helpers:

- `appendScanSnapshot(payload)` — invoked by `saveRepo` after the `repos` write: read
  the repo's `snapshots` record, `appendSnapshot(toSnapshot(payload))`, `idbPut`.
- `listSnapshots(repoId)` — `idbGet`, with the backfill above.

## Data flow

1. Scan completes → `saveRepo(analysis)` writes the `repos` payload **(unchanged)**,
   then calls `appendScanSnapshot(payload)`.
2. Library renders → snapshots are **batch-loaded once** via a single
   `idbGetAll('snapshots')` into a `Map` (avoid N per-card round-trips); `card(r)`
   pulls its series → `snapshotTrend` → `sparkline` → inline SVG.
3. Verdict tab renders → builds the History strip from the same `snapshotTrend`.

## UI surface (read-only)

- **Library card** (`library.js card()`): a tiny inline-SVG **health** sparkline,
  stroke tinted by the current fit token, with a `+Δ / N days` caption. Hidden if
  `<2` points. Static under `prefers-reduced-motion`.
- **Verdict tab** (`output-tab.js`): a compact **"History"** section — health
  sparkline + the series numbers, fit progression (`care → solid → strong ↑`), and
  flags resolved/new. Hidden if `<2` points. Rendered through the existing
  `html` / `esc` escaping path.

## Backup / export

`store.js` `exportStores` / `importStores`: include `snapshots`. Bump
`BACKUP_VERSION`. On import, clamp each repo's `snaps` to the 30-cap and validate
shape, failing safe like the existing bounded import.

## Testing

- `tests/snapshots.test.js` (new): `toSnapshot`; `appendSnapshot` (append + trim +
  immutability); `snapshotTrend` (deltas, empty/single input, fit direction);
  `sparkline` (point math, `<2` → `null`).
- Store tests (`fake-indexeddb`): `appendScanSnapshot` appends + caps at 30;
  `listSnapshots` backfills from the payload when empty; export/import round-trips
  snapshots and clamps on import.
- UI rendering stays untested (repo norm); the pure view-model builders that feed it
  are covered.

## Files

- **New:** `snapshots.js`, `tests/snapshots.test.js`
- **Edit:** `store/idb.js` (migration), `store.js` (append/list/backup),
  `library.js` (card sparkline + batched load), `output-tab.js` (History strip),
  `backup.js` (version bump + import clamp)

## Risks / mitigations

- **Quota:** 30 × ~200 B × N repos ≈ a few MB worst case — negligible for IndexedDB.
- **Read-modify-write race:** scans are serialized, single writer — acceptable.
- **Library perf:** batch-load snapshots once into a `Map` at load, never per-card.
