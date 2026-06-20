// backup.js — pure transforms for exporting / importing a RepoLens library as a
// single portable JSON file. No IndexedDB, no chrome, no DOM: the IO glue lives
// in store.js / cache.js / the UI. This module only shapes and validates the
// envelope, so it is fully unit-testable and forward-compatible.
//
// The envelope is the natural completion of "your data, your machine": the whole
// library — analyzed repos, the semantic graph (nodes + edges) and the local
// scan cache — round-trips through one human-readable JSON file.

import { SNAPSHOT_CAP } from './snapshots.js';

export const BACKUP_FORMAT = 'repolens-backup';
export const BACKUP_VERSION = 2;

// Upper bounds on how much a single import may write, so a hostile or corrupt
// file can't pin the IndexedDB write lock or blow the storage quota. Anything
// past these is dropped with a surfaced warning (never silently).
export const MAX_ROWS = {
  repos: 5000,
  nodes: 20000,
  edges: 50000,
  cache: 5000,
  collections: 2000,
  decisions: 5000,
  snapshots: 5000,
  scenes: 2000,
};

// String caps stop a hostile backup from smuggling a tiny row count with huge
// values (e.g. a 1 MB repoId / note) that would pin the IDB lock or blow quota.
export const MAX_STRING_LENGTHS = {
  id: 512,
  repoId: 256,
  label: 128,
  scalar: 20_000,
};

// Per-repo snapshot ring-buffer cap — single source of truth in snapshots.js; each
// imported snapshots row is trimmed to its most recent SNAP_CAP entries.
const SNAP_CAP = SNAPSHOT_CAP;

const arr = (x) => (Array.isArray(x) ? x : []);
const shortString = (x, max = MAX_STRING_LENGTHS.scalar) => typeof x !== 'string' || x.length <= max;
const shortId = (x) => shortString(String(x ?? ''), MAX_STRING_LENGTHS.id);
const shortRepoId = (x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_STRING_LENGTHS.repoId;
const shortLabel = (x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_STRING_LENGTHS.label;
function stringsWithin(value, max = MAX_STRING_LENGTHS.scalar) {
  if (typeof value === 'string') return value.length <= max;
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every((v) => stringsWithin(v, max));
  return Object.values(value).every((v) => stringsWithin(v, max));
}
const rowHasRepo = (r) =>
  !!(
    r &&
    r.id != null &&
    shortId(r.id) &&
    r.payload &&
    shortRepoId(r.payload.repoId) &&
    stringsWithin(r.payload)
  );
const rowHasId = (r) =>
  !!(r && r.id != null && shortId(r.id) && r.payload != null && stringsWithin(r.payload));
const edgeOk = (e) =>
  !!(
    e &&
    e.id != null &&
    shortId(e.id) &&
    e.source != null &&
    shortId(e.source) &&
    e.target != null &&
    shortId(e.target) &&
    shortLabel(e.label) &&
    stringsWithin(e.properties || {})
  );
const cacheOk = (c) =>
  !!(
    c &&
    shortRepoId(c.repoId) &&
    typeof c.platform === 'string' &&
    shortString(c.platform, 64) &&
    stringsWithin(c)
  );
const collectionOk = (c) =>
  !!(
    c &&
    c.id != null &&
    shortId(c.id) &&
    c.payload &&
    typeof c.payload.name === 'string' &&
    shortString(c.payload.name, 120) &&
    stringsWithin(c.payload)
  );
const decisionOk = (d) =>
  !!(
    d &&
    d.id != null &&
    shortId(d.id) &&
    d.payload &&
    shortRepoId(d.payload.repoId) &&
    d.payload.decision &&
    stringsWithin(d.payload)
  );
const snapshotOk = (r) =>
  !!(
    r &&
    r.id != null &&
    shortId(r.id) &&
    shortRepoId(r.repoId) &&
    Array.isArray(r.snaps) &&
    stringsWithin(r.snaps)
  );
const sceneOk = (s) =>
  !!(
    s &&
    s.id &&
    shortString(s.id, MAX_STRING_LENGTHS.id) &&
    s.scope &&
    shortString(s.scope, 64) &&
    Array.isArray(s.nodes) &&
    Array.isArray(s.edges) &&
    stringsWithin(s)
  );

/** Empty normalized shape — the safe fallback when a file can't be parsed. */
function emptyValue() {
  return {
    repos: [],
    nodes: [],
    edges: [],
    cache: [],
    collections: [],
    decisions: [],
    snapshots: [],
    scenes: [],
  };
}

/**
 * Assemble a versioned backup envelope from already-gathered store rows.
 * `exportedAt` is injectable so the result is deterministic in tests.
 * @param {{ repos?: object[], nodes?: object[], edges?: object[], cache?: object[], exportedAt?: string }} [parts]
 * @returns {object}
 */
export function buildBackup({
  repos,
  nodes,
  edges,
  cache,
  collections,
  decisions,
  snapshots,
  scenes,
  exportedAt,
} = {}) {
  const r = arr(repos),
    n = arr(nodes),
    e = arr(edges),
    c = arr(cache),
    col = arr(collections),
    dec = arr(decisions),
    snap = arr(snapshots),
    sc = arr(scenes);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    counts: {
      repos: r.length,
      nodes: n.length,
      edges: e.length,
      cache: c.length,
      collections: col.length,
      decisions: dec.length,
      snapshots: snap.length,
      scenes: sc.length,
    },
    repos: r,
    nodes: n,
    edges: e,
    cache: c,
    collections: col,
    decisions: dec,
    snapshots: snap,
    scenes: sc,
  };
}

/**
 * Validate and normalize a parsed backup object. Never throws — returns
 * `{ ok, errors, value }` where `value` is always a safe normalized shape with
 * malformed rows dropped, so a partially-corrupt file still imports its good
 * rows once the caller decides to proceed.
 * @param {unknown} obj
 * @returns {{ ok: boolean, errors: string[], value: { repos: object[], nodes: object[], edges: object[], cache: object[] } }}
 */
export function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      errors: ['Not a RepoLens backup file (empty or not a JSON object).'],
      warnings: [],
      value: emptyValue(),
    };
  }
  if (obj.format !== BACKUP_FORMAT) {
    errors.push(`Unrecognized file — expected a "${BACKUP_FORMAT}" export.`);
  }
  const version = Number(obj.version);
  if (!Number.isFinite(version) || version < 1) {
    errors.push('Missing or invalid backup version.');
  } else if (version > BACKUP_VERSION) {
    errors.push(
      `This backup is from a newer RepoLens (format v${version}); update the extension to import it.`
    );
  }
  const warnings = [];
  const clamp = (key, list) => {
    if (list.length > MAX_ROWS[key]) {
      warnings.push(`Backup has ${list.length} ${key}; importing the first ${MAX_ROWS[key]}.`);
      return list.slice(0, MAX_ROWS[key]);
    }
    return list;
  };
  // Filter a row list, surfacing how many malformed rows were dropped (never silent).
  const filterWarn = (key, list, ok) => {
    const kept = list.filter(ok);
    const dropped = list.length - kept.length;
    if (dropped > 0)
      warnings.push(
        `Backup has ${dropped} invalid ${key} row${dropped === 1 ? '' : 's'}; skipping ${dropped === 1 ? 'it' : 'them'}.`
      );
    return kept;
  };
  const value = {
    repos: clamp('repos', filterWarn('repo', arr(obj.repos), rowHasRepo)),
    nodes: clamp('nodes', filterWarn('node', arr(obj.nodes), rowHasId)),
    edges: clamp('edges', filterWarn('edge', arr(obj.edges), edgeOk)),
    cache: clamp('cache', filterWarn('cache', arr(obj.cache), cacheOk)),
    collections: clamp('collections', filterWarn('collection', arr(obj.collections), collectionOk)),
    decisions: clamp('decisions', filterWarn('decision', arr(obj.decisions), decisionOk)),
    snapshots: clamp(
      'snapshots',
      filterWarn('snapshot', arr(obj.snapshots), snapshotOk).map((r) => ({
        ...r,
        // Trim to the cap and coerce each snap's flags to an array — a corrupt/hostile
        // file may carry a non-array `flags` that would later throw in snapshotTrend.
        snaps: arr(r.snaps)
          .slice(-SNAP_CAP)
          .map((s) => (s && typeof s === 'object' ? { ...s, flags: arr(s.flags) } : s)),
      }))
    ),
    scenes: clamp('scenes', filterWarn('scene', arr(obj.scenes), sceneOk)),
  };
  return { ok: errors.length === 0, errors, warnings, value };
}

/**
 * Count the importable rows in a parsed backup (recomputed from the actual rows,
 * not the file's self-reported `counts`, which are untrusted).
 * @param {unknown} obj
 * @returns {{ repos: number, nodes: number, edges: number, cache: number }}
 */
export function summarizeBackup(obj) {
  const { value } = validateBackup(obj);
  return {
    repos: value.repos.length,
    nodes: value.nodes.length,
    edges: value.edges.length,
    cache: value.cache.length,
    collections: value.collections.length,
    decisions: value.decisions.length,
    snapshots: value.snapshots.length,
    scenes: value.scenes.length,
  };
}

/**
 * A stable, filesystem-safe filename for a backup, dated YYYY-MM-DD.
 * @param {string} [isoDate] ISO timestamp; defaults to now.
 * @returns {string}
 */
export function backupFilename(isoDate) {
  const day = String(isoDate || new Date().toISOString()).slice(0, 10);
  return `repolens-backup-${day}.json`;
}
