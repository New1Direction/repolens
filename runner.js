// Talks to the local repolens-runner (deeper-scan daemon). Best-effort: every failure —
// runner offline, bad status, timeout — resolves to null so Deep Dive proceeds unchanged.

export const DEFAULT_RUNNER_URL = 'http://localhost:9191';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 90_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function normalizeRunnerUrl(url) {
  return (url || '').trim().replace(/\/+$/, '') || DEFAULT_RUNNER_URL;
}

/**
 * Liveness check for the runner. Returns { ok, docker, version } — `ok:false` when the runner
 * is offline or unhealthy (never throws). Used to surface a status pill in the UI.
 */
export async function pingRunner(runnerUrl) {
  const base = normalizeRunnerUrl(runnerUrl);
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: data.status === 'ok', docker: !!data.docker, version: data.version || '' };
  } catch {
    return { ok: false };
  }
}

/**
 * Scan a github/gitlab `owner/repo` via the runner. Returns the Facts object, or null for
 * unsupported platforms / bare ids / any runner failure (never throws).
 */
export async function scanRepo(runnerUrl, platform, repoId) {
  if (platform !== 'github' && platform !== 'gitlab') return null;
  const slash = (repoId || '').indexOf('/');
  if (slash < 1) return null;
  const owner = repoId.slice(0, slash);
  const repo = repoId.slice(slash + 1);
  const base = normalizeRunnerUrl(runnerUrl);

  try {
    const res = await fetch(`${base}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, owner, repo }),
    });
    if (!res.ok) return null;
    const { jobId } = await res.json();
    if (!jobId) return null;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const pr = await fetch(`${base}/scan/${jobId}`);
      if (!pr.ok) return null;
      const data = await pr.json();
      if (data.status === 'done') return data.facts || null;
      if (data.status === 'error') return null;
      await sleep(POLL_INTERVAL_MS);
    }
    return null; // timed out
  } catch {
    return null; // runner offline / network error → graceful
  }
}
