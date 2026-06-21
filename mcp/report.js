// Local HTML reports for RepoLens MCP.
// MCP clients get structured JSON, but humans should get the full RepoLens-style
// visual experience: a local, self-contained .html report opened in the browser.

import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const REPORT_DIR = 'repolens-mcp-reports';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slug = (value) =>
  String(value || 'repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'repo';

const arr = (x) => (Array.isArray(x) ? x : []);
const score = (data) => Number(data?.health?.score ?? data?.health ?? 0) || 0;

function reportPrefs(args = {}) {
  return {
    enabled: args.report !== false,
    open: args.openReport !== false && process.env.REPOLENS_MCP_OPEN_REPORT !== '0',
  };
}

function openInBrowser(filePath) {
  const url = pathToFileURL(filePath).href;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Opening is best-effort; the returned reportUrl/reportPath still lets the
    // agent/user open it manually.
  }
}

function chips(items = []) {
  return arr(items)
    .filter(Boolean)
    .slice(0, 12)
    .map((x) => `<span class="chip">${esc(x)}</span>`)
    .join('');
}

function list(items = [], empty = 'Nothing notable.') {
  const xs = arr(items).filter(Boolean);
  if (!xs.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul>${xs.map((x) => `<li>${esc(typeof x === 'string' ? x : x.title || x.text || JSON.stringify(x))}</li>`).join('')}</ul>`;
}

function riskList(items = []) {
  const xs = arr(items).filter(Boolean);
  if (!xs.length) return '<p class="muted">No major red flags in this scan.</p>';
  return xs
    .map((x) => {
      const title = x.title || x.risk || 'Risk';
      const text = x.text || x.evidence || x.mitigation || '';
      return `<article class="risk"><strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}</article>`;
    })
    .join('');
}

function section(title, body) {
  return `<section class="card"><h2>${esc(title)}</h2>${body}</section>`;
}

function scanBody(data) {
  const fit = data.fit || {};
  const health = score(data);
  const evidence = arr(data.evidence)
    .slice(0, 5)
    .map((e) => `<li><strong>${esc(e.claim || 'Evidence')}</strong>${e.why ? ` — ${esc(e.why)}` : ''}</li>`)
    .join('');
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">RepoLens MCP scan</p>
        <h1>${esc(data.repoId)}</h1>
        <p class="lede">${esc(data.bottom_line || data.description || 'Verdict-first dependency report.')}</p>
        <div class="meta">${esc(data.language || 'Unknown')} · ${esc(data.license || 'Unknown')} · ${Number(data.stars || 0).toLocaleString()} stars</div>
      </div>
      <div class="verdict ${esc(fit.level || 'solid')}">
        <span>${esc(fit.label || 'Verdict')}</span>
        <strong>${health || '—'}</strong>
        <small>${esc(fit.why || 'RepoLens fit score')}</small>
      </div>
    </section>
    <div class="grid two">
      ${section('Pros', list(data.pros, 'No clear pros returned.'))}
      ${section('Cons', list(data.cons, 'No clear cons returned.'))}
    </div>
    ${section('Risks & red flags', riskList(data.red_flags || data.risk_register))}
    ${section('Capabilities', `<div class="chips">${chips(data.capabilities || data.tags)}</div>`)}
    ${evidence ? section('Evidence', `<ul>${evidence}</ul>`) : ''}
    ${data.action_plan?.steps ? section('30-minute trial plan', list(data.action_plan.steps.map((s) => `${s.time ? `${s.time}: ` : ''}${s.title || s.action} — ${s.success || s.action || ''}`))) : ''}
  `;
}

function deepDiveBody(data) {
  const atoms = arr(data.atoms).slice(0, 12);
  const links = arr(data.lineage?.links).slice(0, 16);
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">RepoLens MCP deep dive</p>
        <h1>${esc(data.repoId)}</h1>
        <p class="lede">${esc(data.explanation || 'Plain-English architecture explanation.')}</p>
        ${data.degraded ? '<p class="warn">README-only fallback: source tree was unavailable.</p>' : ''}
      </div>
    </section>
    <div class="grid two">
      ${section('Gaps', list(data.gaps, 'No major gaps named.'))}
      ${section('Assumptions', list(data.assumptions, 'No major assumptions named.'))}
    </div>
    ${section(
      'Core atoms',
      atoms.length
        ? atoms
            .map(
              (a) =>
                `<article class="atom"><strong>${esc(a.name || a.id)}</strong><p>${esc(a.purpose || a.kind || '')}</p><small>${esc(arr(a.files).slice(0, 3).join(', '))}</small></article>`
            )
            .join('')
        : '<p class="muted">No atoms returned.</p>'
    )}
    ${section('Lineage', links.length ? list(links.map((l) => `${l.from} → ${l.to}: ${l.relation || l.rel || 'relates'}`)) : '<p class="muted">No lineage links returned.</p>')}
    ${section(
      'Self-test questions',
      list(
        arr(data.questions).map((q) => `${q.q} — ${q.a}`),
        'No self-test questions returned.'
      )
    )}
  `;
}

function compareBody(data) {
  const ranking = arr(data.ranking);
  const repos = arr(data.repos);
  const repoById = new Map(repos.map((r) => [`${r.platform}:${r.repoId}`, r]));
  const winner = data.winner || {};
  const matrix = arr(data.matrix).slice(0, 8);
  const choose = arr(data.choose_if);
  const risks = arr(data.risks);
  const rankCards = ranking
    .map((r) => {
      const repo = repoById.get(r.repoId) || {};
      return `<article class="rank"><div class="rank-num">#${esc(r.rank || '')}</div><div><strong>${esc(r.repoId)}</strong><p>${esc(r.why || repo.description || '')}</p><small>${esc(repo.language || 'Unknown')} · ${esc(repo.license || 'Unknown')} · score ${esc(r.score || '—')}</small></div></article>`;
    })
    .join('');
  const matrixRows = matrix
    .map((m) => {
      const scores = arr(m.scores)
        .map(
          (s) => `<li><strong>${esc(s.repoId)}</strong> — ${esc(s.score ?? '—')}: ${esc(s.note || '')}</li>`
        )
        .join('');
      return `<article class="matrix"><h3>${esc(m.criterion || 'Criterion')}</h3><p><strong>Winner:</strong> ${esc(m.winner || 'tie')}</p><p>${esc(m.notes || '')}</p>${scores ? `<ul>${scores}</ul>` : ''}</article>`;
    })
    .join('');
  const chooseRows = choose
    .map(
      (c) =>
        `<article class="atom"><strong>${esc(c.repoId)}</strong>${list(c.reasons, 'No choose-if guidance returned.')}</article>`
    )
    .join('');
  const riskRows = risks
    .map(
      (r) =>
        `<article class="risk"><strong>${esc(r.repoId)} — ${esc(r.risk || 'Risk')}</strong><p>${esc(r.mitigation || '')}</p></article>`
    )
    .join('');
  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">RepoLens MCP comparison</p>
        <h1>${esc(winner.repoId || ranking[0]?.repoId || 'Comparison')}</h1>
        <p class="lede">${esc(data.bottom_line || winner.rationale || 'Dependency comparison report.')}</p>
        <div class="meta">Use case: ${esc(data.useCase || 'General production adoption')}</div>
      </div>
      <div class="verdict strong">
        <span>Default pick</span>
        <strong>✓</strong>
        <small>${esc(winner.rationale || 'Best fit by RepoLens comparison')}</small>
      </div>
    </section>
    ${section('Ranking', rankCards || '<p class="muted">No ranking returned.</p>')}
    ${section('Tradeoff matrix', matrixRows || '<p class="muted">No matrix returned.</p>')}
    <div class="grid two">
      ${section('Choose-if guidance', chooseRows || '<p class="muted">No choose-if guidance returned.</p>')}
      ${section('Risks to de-risk', riskRows || '<p class="muted">No risks returned.</p>')}
    </div>
    ${data.trial_plan ? section('Bake-off trial plan', `<p>${esc(data.trial_plan.goal || '')}</p>${list(data.trial_plan.steps, 'No steps returned.')}<p><strong>Decision rule:</strong> ${esc(data.trial_plan.decision_rule || '')}</p>`) : ''}
  `;
}

function blueprintBody(data) {
  const nodes = arr(data.nodes);
  const edges = arr(data.edges);
  const minX = Math.min(0, ...nodes.map((n) => Number(n.x) || 0));
  const minY = Math.min(0, ...nodes.map((n) => Number(n.y) || 0));
  const maxX = Math.max(900, ...nodes.map((n) => (Number(n.x) || 0) + 180));
  const maxY = Math.max(500, ...nodes.map((n) => (Number(n.y) || 0) + 90));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const svgEdges = edges
    .map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return '';
      const x1 = (Number(a.x) || 0) - minX + 90;
      const y1 = (Number(a.y) || 0) - minY + 35;
      const x2 = (Number(b.x) || 0) - minX + 90;
      const y2 = (Number(b.y) || 0) - minY + 35;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
    })
    .join('');
  const svgNodes = nodes
    .map((n) => {
      const x = (Number(n.x) || 0) - minX;
      const y = (Number(n.y) || 0) - minY;
      return `<g transform="translate(${x},${y})"><rect width="180" height="70" rx="16"/><text x="16" y="28">${esc(n.label || n.id)}</text><text class="sub" x="16" y="50">${esc(n.kind || n.layer || '')}</text></g>`;
    })
    .join('');
  return `
    <section class="hero-card"><div><p class="eyebrow">RepoLens MCP blueprint</p><h1>${esc(data.repoId || data.title || 'Blueprint')}</h1><p class="lede">Architecture map generated from RepoLens atoms and lineage.</p></div></section>
    <section class="card"><h2>Blueprint canvas</h2><svg class="blueprint" viewBox="0 0 ${maxX - minX + 40} ${maxY - minY + 40}"><g transform="translate(20,20)">${svgEdges}${svgNodes}</g></svg></section>
    <div class="grid two">${section(
      'Nodes',
      list(
        nodes.map((n) => `${n.label || n.id} — ${n.ref?.purpose || n.kind || ''}`),
        'No nodes returned.'
      )
    )}${section(
      'Edges',
      list(
        edges.map((e) => `${e.from} → ${e.to}: ${e.rel}`),
        'No edges returned.'
      )
    )}</div>
  `;
}

function jsonBlock(data) {
  return `<details class="card"><summary>Raw structured JSON</summary><pre>${esc(JSON.stringify(data, null, 2))}</pre></details>`;
}

export function buildReportHtml({
  kind = 'scan',
  title = 'RepoLens MCP report',
  repoId: _repoId = '',
  data = {},
} = {}) {
  const body =
    kind === 'deep_dive'
      ? deepDiveBody(data)
      : kind === 'blueprint_scene'
        ? blueprintBody(data)
        : kind === 'compare_repos'
          ? compareBody(data)
          : scanBody(data);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark;--bg:#070b12;--panel:#0d1420;--panel2:#111b2a;--text:#eef5ff;--muted:#8fa0b8;--line:#243247;--blue:#6ea8ff;--cyan:#22d3ee;--green:#36d399;--amber:#fbbf24;--red:#fb7185}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top left,#14213c 0,#070b12 36rem),var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:34px 20px 56px}.top{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:20px}.brand{font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan)}.stamp{color:var(--muted);font-size:13px}.hero-card,.card{border:1px solid var(--line);background:linear-gradient(180deg,rgba(17,27,42,.94),rgba(10,16,26,.94));box-shadow:0 24px 80px rgba(0,0,0,.35);border-radius:26px;padding:24px;margin:16px 0}.hero-card{display:flex;justify-content:space-between;gap:22px;align-items:stretch}.eyebrow{margin:0 0 8px;color:var(--cyan);font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}h1{font-size:clamp(34px,5vw,64px);line-height:.95;margin:0 0 14px}h2{font-size:18px;margin:0 0 14px}.lede{font-size:18px;color:#dbeafe;max-width:760px}.meta,.muted,.stamp,small{color:var(--muted)}.verdict{min-width:210px;border:1px solid var(--line);border-radius:22px;background:#07111f;padding:18px;display:flex;flex-direction:column;justify-content:center}.verdict span{color:var(--cyan);font-weight:800}.verdict strong{font-size:58px;line-height:1}.verdict.strong strong{color:var(--green)}.verdict.solid strong{color:var(--blue)}.verdict.care strong{color:var(--amber)}.verdict.risky strong{color:var(--red)}.grid{display:grid;gap:16px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.chip{display:inline-flex;border:1px solid #21466c;background:#0a2540;color:#b9e6ff;border-radius:999px;padding:6px 10px;margin:4px;font-weight:700;font-size:12px}ul{padding-left:20px;margin:0}li+li{margin-top:8px}.risk,.atom,.rank,.matrix{border:1px solid #26364b;background:var(--panel2);border-radius:18px;padding:14px;margin:10px 0}.risk strong{color:var(--amber)}.rank{display:flex;gap:14px;align-items:flex-start}.rank-num{font-size:24px;font-weight:900;color:var(--cyan);min-width:48px}.matrix h3{margin:0 0 8px}.warn{color:var(--amber);font-weight:800}.blueprint{width:100%;min-height:520px;border-radius:18px;background:#08111f;border:1px solid var(--line)}.blueprint line{stroke:#3b82f6;stroke-width:2;opacity:.7}.blueprint rect{fill:#0f2033;stroke:#31537a;stroke-width:1.5}.blueprint text{fill:#f8fbff;font-weight:800;font-size:13px}.blueprint text.sub{fill:#93a4bc;font-weight:600;font-size:11px}summary{cursor:pointer;font-weight:800}pre{white-space:pre-wrap;overflow:auto;background:#050912;border:1px solid var(--line);border-radius:16px;padding:16px;color:#cbd5e1}@media(max-width:800px){.hero-card,.grid.two{grid-template-columns:1fr;display:grid}.verdict{min-width:0}}
</style>
</head>
<body><main class="wrap"><div class="top"><div class="brand">RepoLens</div><div class="stamp">MCP local report · ${esc(new Date().toLocaleString())}</div></div>${body}${jsonBlock(data)}</main></body></html>`;
}

export async function attachHtmlReport(kind, repoId, data, args = {}) {
  const prefs = reportPrefs(args);
  if (!prefs.enabled) return data;
  const dir = process.env.REPOLENS_MCP_REPORT_DIR || join(tmpdir(), REPORT_DIR);
  await mkdir(dir, { recursive: true });
  const filename = `${slug(repoId)}-${kind}-${Date.now()}.html`;
  const reportPath = join(dir, filename);
  const title = `RepoLens — ${repoId} (${kind.replace(/_/g, ' ')})`;
  await writeFile(reportPath, buildReportHtml({ kind, title, repoId, data }), 'utf8');
  const report = { path: reportPath, url: pathToFileURL(reportPath).href, opened: prefs.open };
  if (prefs.open) openInBrowser(reportPath);
  return { ...data, report };
}
