import { describe, it, expect } from 'vitest';
import { isDeepDiveInFlight, deepDiveLifecycleAction } from '../src/deep-dive-lifecycle.js';

describe('isDeepDiveInFlight', () => {
  it('treats the work stages as in-flight', () => {
    for (const s of ['fetching', 'atoms', 'lineage', 'feynman']) {
      expect(isDeepDiveInFlight(s)).toBe(true);
    }
  });

  it('treats settled / absent states as not in-flight', () => {
    expect(isDeepDiveInFlight('done')).toBe(false);
    expect(isDeepDiveInFlight('error')).toBe(false);
    expect(isDeepDiveInFlight(null)).toBe(false);
    expect(isDeepDiveInFlight(undefined)).toBe(false);
    expect(isDeepDiveInFlight('')).toBe(false);
  });
});

describe('deepDiveLifecycleAction', () => {
  // The bug: while Deep Dive runs in the MV3 service worker, nothing kept the worker
  // warm — so it was reaped during the rate-limit/backoff sleep before the second
  // ("lineage") model call and the status froze forever. Every in-flight stage must
  // request the keepalive, and a transition into one must (re)arm the stall watchdog.
  it('holds the keepalive for every in-flight stage (regression for the lineage freeze)', () => {
    for (const s of ['fetching', 'atoms', 'lineage', 'feynman']) {
      expect(deepDiveLifecycleAction(null, s).holdKeepalive).toBe(true);
    }
    // The exact stage the user got stuck on:
    expect(deepDiveLifecycleAction('atoms', 'lineage').holdKeepalive).toBe(true);
  });

  it('arms a fresh watchdog on a transition INTO an in-flight stage', () => {
    expect(deepDiveLifecycleAction(null, 'fetching')).toMatchObject({
      changed: true,
      resetWatchdog: true,
      clearWatchdog: false,
    });
    expect(deepDiveLifecycleAction('atoms', 'lineage')).toMatchObject({
      changed: true,
      resetWatchdog: true,
    });
  });

  it('does NOT reset the watchdog when the status is unchanged (unrelated storage writes)', () => {
    // renderDeepDive fires on every session-storage change, including other lenses.
    // A no-op transition must not keep postponing the stall detector forever.
    expect(deepDiveLifecycleAction('lineage', 'lineage')).toMatchObject({
      changed: false,
      resetWatchdog: false,
    });
    expect(deepDiveLifecycleAction('lineage', 'lineage').holdKeepalive).toBe(true);
  });

  it('clears the watchdog and releases the keepalive when Deep Dive settles', () => {
    expect(deepDiveLifecycleAction('feynman', 'done')).toMatchObject({
      changed: true,
      holdKeepalive: false,
      clearWatchdog: true,
      resetWatchdog: false,
    });
    expect(deepDiveLifecycleAction('lineage', 'error')).toMatchObject({
      holdKeepalive: false,
      clearWatchdog: true,
    });
  });
});
