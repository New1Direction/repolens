import { describe, it, expect } from 'vitest';
import { SCAN_EXPLAINERS, explainerFor } from '../src/explainers.js';

const SCAN_TAB_IDS = [10, 11, 12, 13, 14, 16, 17, 18];
const CORE_TAB_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15];

describe('SCAN_EXPLAINERS', () => {
  it('has a complete entry for every scan/lens tab id', () => {
    for (const id of SCAN_TAB_IDS) {
      const e = SCAN_EXPLAINERS[id];
      expect(e, `missing explainer for tab ${id}`).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.bestFor).toBeTruthy();
      expect(e.skipIf).toBeTruthy();
      expect(e.cost).toBeTruthy();
    }
  });
  it('has no entries for core tabs', () => {
    for (const id of CORE_TAB_IDS) expect(SCAN_EXPLAINERS[id]).toBeUndefined();
  });
});

describe('explainerFor', () => {
  it('returns the entry for a scan tab id (number or string key)', () => {
    expect(explainerFor(10).title).toBe('Deep Dive');
    expect(explainerFor('10').title).toBe('Deep Dive');
  });
  it('returns null for core and unknown tab ids', () => {
    expect(explainerFor(0)).toBeNull();
    expect(explainerFor(999)).toBeNull();
  });
});
