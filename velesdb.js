import { deriveCapabilities } from './taxonomy.js';

const COLLECTION = 'repos';
const DUMMY_VECTOR = [0.0];
// VelesDB's own default is 8080, but this machine runs it on 9090 (8080 is in use).
// Single source of truth for the default — imported by background/options/output-tab.
export const DEFAULT_VELESDB_URL = 'http://localhost:9090';
const PING_TIMEOUT_MS = 4_000;

export function normalizeVelesdbUrl(url) {
  const trimmed = (url || '').trim() || DEFAULT_VELESDB_URL;
  return trimmed.replace(/\/+$/, '');
}

/**
 * The other common local port for VelesDB: the server's own default is 8080,
 * but it's frequently run on 9090. If a save fails on one, we retry the other
 * and self-heal the stored setting. Returns null for non-local / custom URLs.
 */
export function alternateLocalUrl(url) {
  const u = normalizeVelesdbUrl(url);
  if (/^https?:\/\/(localhost|127\.0\.0\.1):8080$/.test(u)) return u.replace(':8080', ':9090');
  if (/^https?:\/\/(localhost|127\.0\.0\.1):9090$/.test(u)) return u.replace(':9090', ':8080');
  return null;
}

async function velesdbFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch {
    const base = url.replace(/\/v1\/.*$/, '').replace(/\/health$/, '');
    throw new Error(`Cannot reach VelesDB at ${base} — is the server running?`);
  }
}

/** Quick liveness check — GET /health with a short timeout. */
export async function pingVelesdb(velesdbUrl) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function hashRepoId(repoId) {
  let hash = 5381;
  for (let i = 0; i < repoId.length; i++) {
    hash = ((hash << 5) + hash) + repoId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

export async function initCollection(velesdbUrl) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const res = await velesdbFetch(`${base}/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COLLECTION, dimension: 1, metric: 'cosine' }),
  });
  // 409 Conflict (and legacy 400) mean the collection already exists — that's fine,
  // initCollection is idempotent and runs before every save.
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`VelesDB initCollection failed: ${err.error ?? res.status}`);
  }
}

export async function saveRepo(velesdbUrl, analysis) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const point = {
    id: hashRepoId(analysis.repoId),
    vector: DUMMY_VECTOR,
    payload: {
      repoId:        analysis.repoId,
      platform:      analysis.platform     ?? '',
      language:      analysis.language     ?? '',
      license:       analysis.license      ?? '',
      stars:         analysis.stars        ?? 0,
      category:      analysis.category     ?? '',
      tags:          analysis.tags         ?? [],
      saved_at:      new Date().toISOString(),
      eli5:          analysis.eli5         ?? '',
      compare_hooks: analysis.compare_hooks ?? '',
      capabilities:  analysis.capabilities  ?? [],
      // Triage fields for the Library Home (fit chip + card). Kept compact.
      health:        analysis.health       ?? null,
      red_flags:     analysis.red_flags     ?? [],
      pros:          analysis.pros         ?? [],
      cons:          analysis.cons         ?? [],
      languages:     analysis.languages     ?? []
    }
  };
  const res = await velesdbFetch(`${base}/v1/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [point] }),
  });
  if (!res.ok) throw new Error(`VelesDB saveRepo failed: ${res.status}`);
}

export async function saveAnalysis(velesdbUrl, analysis) {
  await initCollection(velesdbUrl);
  await saveRepo(velesdbUrl, analysis);
  // Ensure the sibling graph collection exists for the Connections tab. Best-effort:
  // a graph hiccup must never fail the vector save (the important part).
  try { await initGraphCollection(velesdbUrl); } catch { /* graph is additive — ignore */ }
}

export async function findSimilar(velesdbUrl, { language, category, repoId }) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  try {
    const query = `${language} ${category}`.trim();
    const res = await fetch(`${base}/v1/collections/${COLLECTION}/search/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: 5 })
    });
    if (!res.ok) return [];
    const { results } = await res.json();
    return (results ?? [])
      .filter(r => r.payload?.repoId !== repoId)
      .slice(0, 3)
      .map(r => ({ repoId: r.payload.repoId, eli5: r.payload.eli5, compare_hooks: r.payload.compare_hooks }));
  } catch {
    return [];
  }
}

/**
 * Broad library pull used to seed the Synergies pass — repos in the same
 * ecosystem (queried by language) that the user has already saved. Returns
 * richer payload fields than findSimilar and excludes the current repo.
 */
export async function searchLibrary(velesdbUrl, { query, topK = 12, excludeRepoId }) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  try {
    const res = await fetch(`${base}/v1/collections/${COLLECTION}/search/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: (query || '').trim(), top_k: topK })
    });
    if (!res.ok) return [];
    const { results } = await res.json();
    return (results ?? [])
      .map(r => r.payload)
      .filter(p => p && p.repoId && p.repoId !== excludeRepoId)
      .map(p => ({ repoId: p.repoId, category: p.category || '', language: p.language || '', eli5: p.eli5 || '' }));
  } catch {
    return [];
  }
}

/**
 * Load the whole library as tagged rows for the Combinator. Repos saved before
 * capability-tagging existed get their tags derived on the fly. Offline → [].
 */
export async function scrollLibrary(velesdbUrl, { limit = 500 } = {}) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  try {
    const res = await fetch(`${base}/v1/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, with_payload: true }),
    });
    if (!res.ok) return [];
    const { points = [] } = await res.json();
    return points.map(pt => {
      const p = pt.payload || {};
      if (!p.repoId) return null;
      const caps = Array.isArray(p.capabilities) && p.capabilities.length ? p.capabilities : deriveCapabilities(p);
      return { repoId: p.repoId, name: p.repoId.split('/').pop() || p.repoId, capabilities: caps, eli5: p.eli5 || '' };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/** Raw points ({ id, payload }) for the re-tagging backfill, which must preserve the full payload. */
export async function scrollPoints(velesdbUrl, { limit = 500 } = {}) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  try {
    const res = await fetch(`${base}/v1/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, with_payload: true }),
    });
    if (!res.ok) return [];
    const { points = [] } = await res.json();
    return points.filter(pt => pt && pt.payload && pt.payload.repoId).map(pt => ({ id: pt.id, payload: pt.payload }));
  } catch {
    return [];
  }
}

// ─── Graph engine: semantic edges for the Connections tab ─────────────────────
// Graph data lives in its OWN collection. VelesDB collections are typed — a name is
// vector OR graph, never both — and the vector `repos` collection rejects graph ops
// with 409. `repos_graph` is a sibling graph-typed collection, keyed by the same
// hashRepoId node ids so it lines up conceptually with the vector points.
// Writes (upsertNode/addEdge) throw like saveRepo so callers can decide; the
// background orchestrator wraps them best-effort. Reads (getEgoGraph) swallow
// failures and return null, like findSimilar.
const GRAPH_COLLECTION = 'repos_graph';

/** Idempotently create the graph-typed collection. 400/409 = already exists (fine). */
export async function initGraphCollection(velesdbUrl) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const res = await velesdbFetch(`${base}/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: GRAPH_COLLECTION, collection_type: 'graph' }),
  });
  if (!res.ok && res.status !== 409 && res.status !== 400) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`VelesDB initGraphCollection failed: ${err.error ?? res.status}`);
  }
}

export async function upsertNode(velesdbUrl, nodeId, payload) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const res = await velesdbFetch(`${base}/v1/collections/${GRAPH_COLLECTION}/graph/nodes/${nodeId}/payload`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`VelesDB upsertNode failed: ${res.status}`);
}

export async function addEdge(velesdbUrl, { id, source, target, label, properties = {} }) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const res = await velesdbFetch(`${base}/v1/collections/${GRAPH_COLLECTION}/graph/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, source, target, label, properties }),
  });
  if (!res.ok) throw new Error(`VelesDB addEdge failed: ${res.status}`);
}

/**
 * Ring-1 ego-graph for one repo. Resolves the center id via hashRepoId, pulls its
 * edges (both directions), then each neighbor's payload (name/analyzed/repoId).
 * Server serializes ids as strings — everything is normalized to strings here.
 * Returns { center, edges, neighbors } or null on any failure (offline state).
 */
export async function getEgoGraph(velesdbUrl, repoId) {
  const base = normalizeVelesdbUrl(velesdbUrl);
  const centerId = hashRepoId(repoId);
  const centerKey = String(centerId);
  try {
    const res = await fetch(`${base}/v1/collections/${GRAPH_COLLECTION}/graph/nodes/${centerId}/edges?direction=both`);
    if (!res.ok) return null;
    const { edges = [] } = await res.json();
    const norm = edges.map(e => ({ source: String(e.source), target: String(e.target), label: e.label }));
    const neighborIds = [...new Set(norm.flatMap(e => [e.source, e.target]).filter(id => id !== centerKey))];
    const neighbors = await Promise.all(neighborIds.map(async (id) => {
      try {
        const r = await fetch(`${base}/v1/collections/${GRAPH_COLLECTION}/graph/nodes/${id}/payload`);
        const p = (r.ok ? (await r.json()).payload : null) || {};
        const isIdea = p.kind === 'idea';
        return {
          id,
          name: isIdea ? (p.title || 'idea') : (p.name || p.repoId || id),
          analyzed: !!p.analyzed,
          repoId: p.repoId || null,
          kind: p.kind || 'repo',
          pitch: p.pitch || '',
        };
      } catch {
        return { id, name: id, analyzed: false, repoId: null, kind: 'repo', pitch: '' };
      }
    }));
    return {
      center: { id: centerKey, repoId, name: repoId.split('/').pop() || repoId },
      edges: norm,
      neighbors,
    };
  } catch {
    return null;
  }
}
