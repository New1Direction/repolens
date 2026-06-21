import { describe, it, expect } from 'vitest';
import { emptyLens, withRun, setActive, runOf, ranFrameworks } from '../src/lens-runs.js';

describe('lens-runs', () => {
  it('emptyLens is an empty active + runs', () => {
    expect(emptyLens()).toEqual({ active: '', runs: {} });
  });

  it('withRun adds a framework run without mutating the input', () => {
    const a = emptyLens();
    const b = withRun(a, 'scamper', { status: 'running' });
    expect(b.runs.scamper).toEqual({ status: 'running' });
    expect(a.runs.scamper).toBeUndefined(); // input untouched
    expect(b).not.toBe(a);
  });

  it('withRun merges into an existing run and leaves siblings alone', () => {
    let lens = withRun(emptyLens(), 'scamper', { status: 'running' });
    lens = withRun(lens, 'triz', { status: 'done', result: { ok: 1 } });
    lens = withRun(lens, 'scamper', { status: 'done', result: { ok: 2 } });
    expect(lens.runs.scamper).toEqual({ status: 'done', result: { ok: 2 } });
    expect(lens.runs.triz).toEqual({ status: 'done', result: { ok: 1 } }); // untouched
  });

  it('withRun tolerates a null lens', () => {
    expect(withRun(null, 'x', { status: 'done' }).runs.x).toEqual({ status: 'done' });
  });

  it('setActive sets active immutably', () => {
    const a = emptyLens();
    const b = setActive(a, 'triz');
    expect(b.active).toBe('triz');
    expect(a.active).toBe('');
  });

  it('runOf returns the run or null', () => {
    const lens = withRun(emptyLens(), 'scamper', { status: 'done' });
    expect(runOf(lens, 'scamper')).toEqual({ status: 'done' });
    expect(runOf(lens, 'triz')).toBeNull();
    expect(runOf(null, 'x')).toBeNull();
  });

  it('ranFrameworks lists run keys', () => {
    let lens = withRun(emptyLens(), 'a', {});
    lens = withRun(lens, 'b', {});
    expect(ranFrameworks(lens).sort()).toEqual(['a', 'b']);
    expect(ranFrameworks(null)).toEqual([]);
  });
});
