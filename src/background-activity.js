// Detect whether a session entry has any on-demand lens flow running in the MV3 background
// service worker, so the output tab can keep the worker warm for its full duration. Every
// post-scan lens (Deep Dive, Systems/Ideate/Prioritize, Synergies, Combinator, Versus,
// SKTPG, Docs Quality, Maintenance, Fits-Stack, Ask) fires AI work AFTER the scan keepalive
// is released — without this they share Deep Dive's "worker suspended mid-run → frozen
// forever" bug. The top-level scan is intentionally excluded: it is covered by the keepalive
// acquired in init() on page load, and every RERUN reloads the page.
//
// Pure + testable; the output tab wires the side effects (port connect/disconnect, timers).

import { isDeepDiveInFlight } from './deep-dive-lifecycle.js';

// Slots whose value is { status, ... }; in flight while status is set and not settled.
const STATUS_SLOTS = [
  'synergies',
  'combinator',
  'versus',
  'sktpg',
  'docsQuality',
  'maintenance',
  'fitsStack',
];
// Slots whose value is a lens-runs object { runs: { [framework]: { status } } }.
const LENS_RUN_SLOTS = ['systems', 'ideate', 'prioritize'];

function statusInFlight(status) {
  return !!status && status !== 'done' && status !== 'error';
}

/**
 * A compact, order-independent string of every in-flight slot's status. The output tab
 * compares successive signatures: a change means work PROGRESSED (reset the stall bound),
 * an unchanged non-empty signature means it may be STALLED.
 * @returns {string}
 */
export function lensActivitySignature(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const parts = [];

  const dd = entry.deepDive?.status;
  if (isDeepDiveInFlight(dd)) parts.push(`deepDive:${dd}`);

  for (const slot of STATUS_SLOTS) {
    const s = entry[slot]?.status;
    if (statusInFlight(s)) parts.push(`${slot}:${s}`);
  }

  for (const slot of LENS_RUN_SLOTS) {
    const runs = entry[slot]?.runs || {};
    for (const [fw, run] of Object.entries(runs)) {
      if (statusInFlight(run?.status)) parts.push(`${slot}.${fw}:${run.status}`);
    }
  }

  const ask = entry.askRepo?.pending?.status;
  if (statusInFlight(ask)) parts.push(`ask:${ask}`);

  return parts.sort().join('|');
}

/** True when any on-demand lens flow is running. */
export function anyLensInFlight(entry) {
  return lensActivitySignature(entry) !== '';
}
