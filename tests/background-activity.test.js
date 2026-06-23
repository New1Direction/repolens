import { describe, it, expect } from 'vitest';
import { anyLensInFlight, lensActivitySignature } from '../src/background-activity.js';

describe('anyLensInFlight', () => {
  it('is false for empty / settled / non-object entries', () => {
    expect(anyLensInFlight(null)).toBe(false);
    expect(anyLensInFlight(undefined)).toBe(false);
    expect(anyLensInFlight({})).toBe(false);
    expect(anyLensInFlight({ deepDive: { status: 'done' } })).toBe(false);
    expect(anyLensInFlight({ synergies: { status: 'error' } })).toBe(false);
  });

  it('detects an in-flight Deep Dive at every stage', () => {
    for (const s of ['fetching', 'atoms', 'lineage', 'feynman']) {
      expect(anyLensInFlight({ deepDive: { status: s } })).toBe(true);
    }
  });

  it('detects each simple status slot while running (the post-scan freeze class)', () => {
    for (const slot of [
      'synergies',
      'combinator',
      'versus',
      'sktpg',
      'docsQuality',
      'maintenance',
      'fitsStack',
    ]) {
      expect(anyLensInFlight({ [slot]: { status: 'running' } })).toBe(true);
      expect(anyLensInFlight({ [slot]: { status: 'done' } })).toBe(false);
    }
  });

  it('detects an in-flight framework-lens run (systems/ideate/prioritize)', () => {
    const busy = { systems: { runs: { firstprinciples: { status: 'running' } } } };
    expect(anyLensInFlight(busy)).toBe(true);
    const allDone = {
      systems: { runs: { a: { status: 'done' }, b: { status: 'error' } } },
    };
    expect(anyLensInFlight(allDone)).toBe(false);
    // One busy among several settled still counts.
    const mixed = { ideate: { runs: { a: { status: 'done' }, b: { status: 'running' } } } };
    expect(anyLensInFlight(mixed)).toBe(true);
  });

  it('detects an Ask question that is still thinking, but not a settled one', () => {
    expect(anyLensInFlight({ askRepo: { pending: { status: 'thinking' } } })).toBe(true);
    expect(anyLensInFlight({ askRepo: { pending: { status: 'error' } } })).toBe(false);
    expect(anyLensInFlight({ askRepo: { pending: null, history: [{ q: 'x' }] } })).toBe(false);
  });

  it('ignores the top-level scan (handled separately on load/reload)', () => {
    // A loading scan must NOT be treated as on-demand lens work here.
    expect(anyLensInFlight({ loading: true, status: 'fetching' })).toBe(false);
  });
});

describe('lensActivitySignature', () => {
  it('is empty when nothing is in flight', () => {
    expect(lensActivitySignature({})).toBe('');
    expect(lensActivitySignature({ deepDive: { status: 'done' } })).toBe('');
  });

  it('changes as a flow progresses, so the tab can tell progress from a stall', () => {
    const atoms = lensActivitySignature({ deepDive: { status: 'atoms' } });
    const lineage = lensActivitySignature({ deepDive: { status: 'lineage' } });
    expect(atoms).not.toBe('');
    expect(atoms).not.toBe(lineage); // progress -> watchdog resets
  });

  it('is stable (order-independent) for the same set of in-flight work', () => {
    const a = lensActivitySignature({
      synergies: { status: 'running' },
      versus: { status: 'running' },
    });
    const b = lensActivitySignature({
      versus: { status: 'running' },
      synergies: { status: 'running' },
    });
    expect(a).toBe(b);
  });

  it('agrees with anyLensInFlight', () => {
    const entry = { combinator: { status: 'running' } };
    expect(lensActivitySignature(entry) !== '').toBe(anyLensInFlight(entry));
  });
});
