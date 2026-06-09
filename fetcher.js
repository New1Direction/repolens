async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

export async function fetchRepoData(platform, repoId) {
  if (platform === 'github') return fetchGitHub(repoId);
  if (platform === 'gitlab') return fetchGitLab(repoId);
  if (platform === 'npm')    return fetchNpm(repoId);
  if (platform === 'pypi')   return fetchPyPI(repoId);
  throw new Error(`Unsupported platform: ${platform}`);
}

// Normalise a {language: bytes} map into a top-5 [{name, pct}] composition.
function bytesToComposition(langs) {
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }));
}

async function fetchGitHub(repoId) {
  const [meta, readmeRes] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${repoId}`),
    fetch(`https://api.github.com/repos/${repoId}/readme`).catch(() => ({ ok: false }))
  ]);
  let readme = '';
  if (readmeRes.ok) {
    const readmeData = await readmeRes.json().catch(() => null);
    if (readmeData?.encoding === 'base64') {
      readme = atob(readmeData.content.replace(/\n/g, ''));
    }
  }
  // Language composition for the Tech Stack bar — best effort, never fatal.
  let languages = [];
  try {
    const langRes = await fetch(`https://api.github.com/repos/${repoId}/languages`);
    if (langRes && langRes.ok) languages = bytesToComposition(await langRes.json());
  } catch { /* leave empty; the bar falls back to the single language */ }
  if (!languages.length && meta.language) languages = [{ name: meta.language, pct: 100 }];

  return {
    platform: 'github', repoId, description: meta.description || '',
    language: meta.language || 'Unknown', license: meta.license?.spdx_id || 'Unknown',
    stars: meta.stargazers_count || 0, readme, languages, dependencies: [],
  };
}

async function fetchGitLab(repoId) {
  const encoded = encodeURIComponent(repoId);
  const meta = await fetchJson(`https://gitlab.com/api/v4/projects/${encoded}`);
  let readme = '';
  const readmeRes = await fetch(`https://gitlab.com/api/v4/projects/${encoded}/repository/files/README.md/raw?ref=HEAD`).catch(() => null);
  if (readmeRes?.ok) readme = await readmeRes.text();
  // GitLab's languages endpoint already returns percentages.
  let languages = [];
  try {
    const langRes = await fetch(`https://gitlab.com/api/v4/projects/${encoded}/languages`);
    if (langRes && langRes.ok) {
      const langs = await langRes.json();
      languages = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, pct]) => ({ name, pct: Math.round(pct) }));
    }
  } catch { /* best effort */ }
  if (!languages.length && meta.language) languages = [{ name: meta.language, pct: 100 }];

  return {
    platform: 'gitlab', repoId, description: meta.description || '',
    language: meta.language || 'Unknown', license: 'Unknown',
    stars: meta.star_count || 0, readme, languages, dependencies: [],
  };
}

async function fetchNpm(repoId) {
  const data = await fetchJson(`https://registry.npmjs.org/${repoId}`);
  const latest = data['dist-tags']?.latest;
  const deps = data.versions?.[latest]?.dependencies || {};
  const dependencies = Object.entries(deps).slice(0, 30).map(([name, version]) => ({ name, version: String(version) }));
  return {
    platform: 'npm', repoId, description: data.description || '', language: 'JavaScript',
    license: data.versions?.[latest]?.license || 'Unknown', stars: 0,
    readme: (data.readme || '').slice(0, 8000),
    languages: [{ name: 'JavaScript', pct: 100 }], dependencies,
  };
}

// PyPI requires_dist entries look like "numpy (>=1.20)", "requests>=2.0", or "x; extra=='dev'".
function parsePyDep(spec) {
  const head = spec.split(';')[0].trim();
  const m = head.match(/^([A-Za-z0-9._-]+)\s*(.*)$/);
  if (!m) return null;
  const version = (m[2] || '').replace(/[()]/g, '').trim();
  return { name: m[1], version };
}

async function fetchPyPI(repoId) {
  const data = await fetchJson(`https://pypi.org/pypi/${repoId}/json`);
  const info = data.info;
  const dependencies = (info.requires_dist || []).map(parsePyDep).filter(Boolean).slice(0, 30);
  return {
    platform: 'pypi', repoId, description: info.summary || '', language: 'Python',
    license: info.license || 'Unknown', stars: 0,
    readme: (info.description || '').slice(0, 8000),
    languages: [{ name: 'Python', pct: 100 }], dependencies,
  };
}
