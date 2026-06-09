import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { idbPut, idbGet, idbGetAll, idbDelete, idbClear } from '../store/idb.js';

describe('idb helper', () => {
  beforeEach(async () => {
    await idbClear('repos');
  });

  it('puts then gets a value by id', async () => {
    await idbPut('repos', { id: 1, payload: { repoId: 'a/b' } });
    const got = await idbGet('repos', 1);
    expect(got).toEqual({ id: 1, payload: { repoId: 'a/b' } });
  });

  it('getAll returns every row in the store', async () => {
    await idbPut('repos', { id: 1, payload: { repoId: 'a/b' } });
    await idbPut('repos', { id: 2, payload: { repoId: 'c/d' } });
    const all = await idbGetAll('repos');
    expect(all.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('put with an existing id overwrites (no duplicate row)', async () => {
    await idbPut('repos', { id: 7, payload: { v: 1 } });
    await idbPut('repos', { id: 7, payload: { v: 2 } });
    const all = await idbGetAll('repos');
    expect(all).toHaveLength(1);
    expect(all[0].payload.v).toBe(2);
  });

  it('delete removes one row; clear empties the store', async () => {
    await idbPut('repos', { id: 1, payload: {} });
    await idbPut('repos', { id: 2, payload: {} });
    await idbDelete('repos', 1);
    expect(await idbGet('repos', 1)).toBeUndefined();
    expect(await idbGetAll('repos')).toHaveLength(1);
    await idbClear('repos');
    expect(await idbGetAll('repos')).toHaveLength(0);
  });
});
