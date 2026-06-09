import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initCollection, saveRepo, saveAnalysis, findSimilar, searchLibrary, hashRepoId, normalizeVelesdbUrl, pingVelesdb, alternateLocalUrl } from '../velesdb.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('normalizeVelesdbUrl', () => {
  it('defaults to localhost:9090 when empty', () => {
    expect(normalizeVelesdbUrl('')).toBe('http://localhost:9090');
  });
  it('defaults to localhost:9090 when undefined', () => {
    expect(normalizeVelesdbUrl(undefined)).toBe('http://localhost:9090');
  });
  it('strips trailing slashes', () => {
    expect(normalizeVelesdbUrl('http://localhost:8080/')).toBe('http://localhost:8080');
  });
});

describe('pingVelesdb', () => {
  it('returns true when /health responds ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await expect(pingVelesdb('http://localhost:8080')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/health', expect.any(Object));
  });
  it('returns false when server is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    await expect(pingVelesdb('http://localhost:8080')).resolves.toBe(false);
  });
});

describe('alternateLocalUrl', () => {
  it('swaps between the two common local ports', () => {
    expect(alternateLocalUrl('http://localhost:8080')).toBe('http://localhost:9090');
    expect(alternateLocalUrl('http://localhost:9090')).toBe('http://localhost:8080');
    expect(alternateLocalUrl('http://127.0.0.1:9090')).toBe('http://127.0.0.1:8080');
  });
  it('normalizes a trailing slash before swapping', () => {
    expect(alternateLocalUrl('http://localhost:8080/')).toBe('http://localhost:9090');
  });
  it('returns null for custom / non-local URLs', () => {
    expect(alternateLocalUrl('https://veles.example.com')).toBeNull();
    expect(alternateLocalUrl('http://localhost:3000')).toBeNull();
  });
});

describe('hashRepoId', () => {
  it('returns a positive integer', () => {
    expect(hashRepoId('facebook/react')).toBeGreaterThan(0);
    expect(Number.isInteger(hashRepoId('facebook/react'))).toBe(true);
  });
  it('returns different values for different inputs', () => {
    expect(hashRepoId('facebook/react')).not.toBe(hashRepoId('vuejs/vue'));
  });
  it('is deterministic', () => {
    expect(hashRepoId('facebook/react')).toBe(hashRepoId('facebook/react'));
  });
});

describe('initCollection', () => {
  it('creates the repos collection', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: 'Collection created' }) });
    await initCollection('http://localhost:8080');
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/v1/collections', expect.objectContaining({ method: 'POST' }));
  });
  it('does not throw if collection already exists (400)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'already exists' }) });
    await expect(initCollection('http://localhost:8080')).resolves.not.toThrow();
  });
  it('does not throw if collection already exists (409 Conflict)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'collection already exists' }) });
    await expect(initCollection('http://localhost:8080')).resolves.not.toThrow();
  });
});

describe('saveRepo', () => {
  it('POSTs the repo to VelesDB with a dummy vector', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: 'Points upserted' }) });
    await saveRepo('http://localhost:8080/', { repoId: 'facebook/react', category: 'UI Framework', tags: ['js'], eli5: 'test' });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/collections/repos/points',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.points[0].vector).toEqual([0.0]);
    expect(body.points[0].payload.repoId).toBe('facebook/react');
  });

  it('throws a helpful message when the server is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(saveRepo('http://localhost:8080', { repoId: 'x/y' }))
      .rejects.toThrow(/Cannot reach VelesDB/);
  });

  it('stores capabilities on the point payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await saveRepo('http://localhost:8080', { repoId: 'a/b', capabilities: ['vector-index', 'cli'] });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.points[0].payload.capabilities).toEqual(['vector-index', 'cli']);
  });
  it('defaults capabilities to [] when absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await saveRepo('http://localhost:8080', { repoId: 'a/b' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.points[0].payload.capabilities).toEqual([]);
  });
});

describe('saveAnalysis', () => {
  it('initializes the vector collection, saves the repo, then ensures the graph collection', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })  // initCollection (vector)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })  // saveRepo
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // initGraphCollection
    await saveAnalysis('http://localhost:8080', { repoId: 'facebook/react', eli5: 'test' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('still resolves when the graph collection init fails (graph is best-effort)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })   // initCollection
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })   // saveRepo
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }); // graph init fails
    await expect(saveAnalysis('http://localhost:8080', { repoId: 'x/y', eli5: 't' })).resolves.not.toThrow();
  });
});

describe('findSimilar', () => {
  it('queries VelesDB text search with language and category', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ id: 123, payload: { repoId: 'vuejs/vue' } }] }) });
    const results = await findSimilar('http://localhost:8080', { language: 'JavaScript', category: 'UI Framework', repoId: 'facebook/react' });
    expect(results).toHaveLength(1);
    expect(results[0].repoId).toBe('vuejs/vue');
  });
  it('returns empty array when VelesDB is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const results = await findSimilar('http://localhost:8080', { language: 'JavaScript', category: 'UI', repoId: 'x' });
    expect(results).toEqual([]);
  });
});

describe('searchLibrary', () => {
  it('returns library payloads (category/language/eli5) and excludes the current repo', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [
      { id: 1, payload: { repoId: 'facebook/react', category: 'UI Framework', language: 'JavaScript', eli5: 'self' } },
      { id: 2, payload: { repoId: 'reduxjs/redux', category: 'State', language: 'JavaScript', eli5: 'state' } },
    ] }) });
    const out = await searchLibrary('http://localhost:9090', { query: 'JavaScript', excludeRepoId: 'facebook/react' });
    expect(out).toEqual([{ repoId: 'reduxjs/redux', category: 'State', language: 'JavaScript', eli5: 'state' }]);
  });
  it('returns [] when VelesDB is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await searchLibrary('http://localhost:9090', { query: 'x' })).toEqual([]);
  });
});

import { upsertNode, addEdge, getEgoGraph, initGraphCollection } from '../velesdb.js';

describe('initGraphCollection', () => {
  it('POSTs a graph-typed collection create for repos_graph', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await initGraphCollection('http://localhost:9090');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9090/v1/collections',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: 'repos_graph', collection_type: 'graph' });
  });
  it('does not throw when it already exists (409 / 400)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'exists' }) });
    await expect(initGraphCollection('http://localhost:9090')).resolves.not.toThrow();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'exists' }) });
    await expect(initGraphCollection('http://localhost:9090')).resolves.not.toThrow();
  });
});

describe('upsertNode', () => {
  it('PUTs the payload to the graph-collection node payload route', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await upsertNode('http://localhost:9090', 7, { name: 'react', analyzed: true });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9090/v1/collections/repos_graph/graph/nodes/7/payload',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.payload.name).toBe('react');
  });
  it('throws on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(upsertNode('http://localhost:9090', 7, {})).rejects.toThrow(/upsertNode failed/);
  });
});

describe('addEdge', () => {
  it('POSTs the deterministic edge to the edges route', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await addEdge('http://localhost:9090', { id: 42, source: 1, target: 2, label: 'COMPARED_TO', properties: { verdict: 'x' } });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9090/v1/collections/repos_graph/graph/edges',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ id: 42, source: 1, target: 2, label: 'COMPARED_TO' });
    expect(body.properties.verdict).toBe('x');
  });
  it('throws on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(addEdge('http://localhost:9090', { id: 1, source: 1, target: 2, label: 'X' })).rejects.toThrow(/addEdge failed/);
  });
});

describe('getEgoGraph', () => {
  it('returns center, edges and neighbor payloads', async () => {
    const centerId = hashRepoId('facebook/react');
    global.fetch = vi.fn((url) => {
      if (url.includes('/edges')) {
        return Promise.resolve({ ok: true, json: async () => ({ edges: [
          { id: '5', source: String(centerId), target: '999', label: 'ALTERNATIVE_TO', properties: {} },
        ], count: 1 }) });
      }
      if (url.includes('/999/payload')) {
        return Promise.resolve({ ok: true, json: async () => ({ node_id: '999', payload: { name: 'vue', analyzed: false } }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    const g = await getEgoGraph('http://localhost:9090', 'facebook/react');
    expect(g.center).toMatchObject({ id: String(centerId), repoId: 'facebook/react', name: 'react' });
    expect(g.edges).toEqual([{ source: String(centerId), target: '999', label: 'ALTERNATIVE_TO' }]);
    expect(g.neighbors).toEqual([{ id: '999', name: 'vue', analyzed: false, repoId: null, kind: 'repo', pitch: '' }]);
  });
  it('returns null when the edges request is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect(await getEgoGraph('http://localhost:9090', 'x/y')).toBeNull();
  });
  it('returns null when VelesDB is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await getEgoGraph('http://localhost:9090', 'x/y')).toBeNull();
  });
  it('exposes kind and pitch for idea neighbours', async () => {
    const centerId = hashRepoId('facebook/react');
    global.fetch = vi.fn((url) => {
      if (url.includes('/edges')) {
        return Promise.resolve({ ok: true, json: async () => ({ edges: [
          { id: '9', source: String(centerId), target: '500', label: 'COMBINES', properties: {} },
        ] }) });
      }
      if (url.includes('/500/payload')) {
        return Promise.resolve({ ok: true, json: async () => ({ node_id: '500', payload: { kind: 'idea', title: 'Self-tuning search', pitch: 'fine-tunes itself' } }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    const g = await getEgoGraph('http://localhost:9090', 'facebook/react');
    expect(g.neighbors[0]).toMatchObject({ id: '500', name: 'Self-tuning search', kind: 'idea', pitch: 'fine-tunes itself', repoId: null });
  });
});

import { scrollLibrary } from '../velesdb.js';

describe('scrollLibrary', () => {
  it('returns tagged rows from the points payloads', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ points: [
      { id: 1, payload: { repoId: 'o/vec', eli5: 'index', capabilities: ['vector-index'] } },
    ] }) });
    const rows = await scrollLibrary('http://localhost:9090');
    expect(rows).toEqual([{ repoId: 'o/vec', name: 'vec', capabilities: ['vector-index'], eli5: 'index' }]);
  });
  it('derives capabilities for repos saved before tagging existed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ points: [
      { id: 2, payload: { repoId: 'o/cli', category: 'CLI Tool', eli5: '' } },
    ] }) });
    const rows = await scrollLibrary('http://localhost:9090');
    expect(rows[0].capabilities).toContain('cli');
  });
  it('returns [] when VelesDB is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await scrollLibrary('http://localhost:9090')).toEqual([]);
  });
});

import { scrollPoints } from '../velesdb.js';

describe('scrollPoints', () => {
  it('returns raw {id, payload} points for the backfill', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ points: [
      { id: 7, payload: { repoId: 'o/x', category: 'CLI Tool', eli5: 'a cli', capabilities: [] } },
    ] }) });
    const pts = await scrollPoints('http://localhost:9090');
    expect(pts).toEqual([{ id: 7, payload: { repoId: 'o/x', category: 'CLI Tool', eli5: 'a cli', capabilities: [] } }]);
  });
  it('returns [] when unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('refused'));
    expect(await scrollPoints('http://localhost:9090')).toEqual([]);
  });
});
