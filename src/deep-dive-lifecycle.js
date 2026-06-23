// Deep Dive lifecycle — pure decisions for the output tab's keepalive + stall watchdog.
//
// Deep Dive runs a long, multi-stage pipeline (source fetch → atoms → lineage → feynman)
// inside the MV3 background service worker. MV3 suspends an idle worker after ~30s, and the
// keepalive port that protects the initial scan is released the moment that scan finishes —
// long before Deep Dive is triggered on demand. With nothing keeping the worker warm, it is
// reaped during a provider rate-limit/backoff sleep (most reliably before the 2nd model call,
// "Mapping causal lineage"), freezing `deepDive.status` with no error and no recovery.
//
// The output tab fixes this by (a) holding the keepalive for every in-flight stage and
// (b) arming a stall watchdog so a frozen run surfaces an actionable error instead of
// spinning forever. This module keeps the *decisions* pure so they are unit-testable; the
// tab wires the side effects (port connect/disconnect, setTimeout, DOM).

const IN_FLIGHT = new Set(['fetching', 'atoms', 'lineage', 'feynman']);

/** A Deep Dive status that represents active background work (not settled / not absent). */
export function isDeepDiveInFlight(status) {
  return IN_FLIGHT.has(status);
}

/**
 * Decide what the keepalive + watchdog should do given a status transition.
 *
 * @param {string|null|undefined} prevStatus - last observed deepDive.status
 * @param {string|null|undefined} nextStatus - newly observed deepDive.status
 * @returns {{
 *   changed: boolean,        // did the status actually change?
 *   holdKeepalive: boolean,  // desired keepalive state (true while work is in flight)
 *   resetWatchdog: boolean,  // (re)arm a fresh stall timer — only on a transition INTO a stage
 *   clearWatchdog: boolean,  // disarm the stall timer — once settled (done/error/absent)
 * }}
 */
export function deepDiveLifecycleAction(prevStatus, nextStatus) {
  const changed = prevStatus !== nextStatus;
  const inFlight = isDeepDiveInFlight(nextStatus);
  return {
    changed,
    holdKeepalive: inFlight,
    // Reset only on a real transition so unrelated session-storage writes (other lenses
    // re-render Deep Dive too) can't keep postponing the stall detector indefinitely.
    resetWatchdog: changed && inFlight,
    clearWatchdog: !inFlight,
  };
}
