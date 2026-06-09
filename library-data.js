// Pure helpers for the Library Home triage grid: turn a saved analysis payload into a row,
// and sort/filter rows. No DOM, no chrome — unit-tested.

import { deriveFit, firstSentence } from './verdict.js';

/** A saved analysis payload → a compact library row (fit chip, health, category, caps, langs). */
export function libraryRow(payload) {
  const p = payload || {};
  const repoId = p.repoId || '';
  // Only repos saved with the triage fields can get a real fit verdict; older/trimmed
  // payloads are "Unrated" rather than a misleading default.
  const hasTriage = !!(
    (p.health && p.health.score) ||
    (p.red_flags && p.red_flags.length) ||
    (p.pros && p.pros.length) ||
    (p.cons && p.cons.length)
  );
  return {
    repoId,
    name: repoId.split('/').pop() || repoId,
    fit: hasTriage ? deriveFit(p) : { level: 'unrated', label: 'Unrated', why: 'Re-scan for a fit verdict' },
    health: p.health?.score ?? 0,
    category: p.category || '',
    capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
    languages: (p.languages || []).slice(0, 3),
    blurb: p.description || firstSentence(p.eli5) || '',
    savedAt: p.saved_at || '',
  };
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR, MONTH = 30 * DAY, YEAR = 365 * DAY;

/**
 * Compact "scanned N ago" label from an ISO timestamp. `now` is injectable for
 * deterministic tests. Returns '' for missing/unparseable input; future stamps
 * (clock skew) clamp to "just now" rather than showing a negative age.
 */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return '';
  const ms = now - t;
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  if (ms < MONTH) return `${Math.floor(ms / DAY)}d ago`;
  if (ms < YEAR) return `${Math.floor(ms / MONTH)}mo ago`;
  return `${Math.floor(ms / YEAR)}y ago`;
}

const FIT_RANK = { strong: 0, solid: 1, care: 2, risky: 3, unrated: 4 };

/** Return a NEW sorted array. by: 'fit' (default) | 'health' | 'name'. */
export function sortRows(rows, by) {
  const r = [...rows];
  if (by === 'health') {
    return r.sort((a, b) => b.health - a.health || a.name.localeCompare(b.name));
  }
  if (by === 'name') {
    return r.sort((a, b) => a.repoId.localeCompare(b.repoId));
  }
  // 'fit': strong → risky, then health desc, then name
  return r.sort(
    (a, b) =>
      (FIT_RANK[a.fit.level] ?? 9) - (FIT_RANK[b.fit.level] ?? 9) ||
      b.health - a.health ||
      a.name.localeCompare(b.name)
  );
}

export function filterRows(rows, { query = '', capability = '' } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.repoId.toLowerCase().includes(q)) return false;
    if (capability && !row.capabilities.includes(capability)) return false;
    return true;
  });
}

/** Sorted unique capabilities across all rows (for the filter chips). */
export function allCapabilities(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const c of row.capabilities) set.add(c);
  }
  return [...set].sort();
}
