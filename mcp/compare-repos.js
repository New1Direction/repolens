import { fetchRepoData } from '../src/fetcher.js';
import { buildPrompt } from '../src/prompt.js';
import { parseClaudeResponse } from '../src/parser.js';
import { deriveFit } from '../src/verdict.js';
import { parseRepoInput } from './repo-input.js';
import { callModel } from './model.js';
import { ghOpts } from './github-auth.js';
import { attachHtmlReport } from './report.js';

const MAX_REPOS = 5;

export const COMPARE_TOOL = {
  name: 'compare_repos',
  description:
    'Compare 2-5 GitHub/GitLab/npm/PyPI repos or packages for a concrete use case. ' +
    'Returns a winner, ranking, tradeoff matrix, choose-if guidance, and risk comparison. ' +
    'Use this before an agent installs or recommends a dependency.',
  inputSchema: {
    type: 'object',
    properties: {
      repos: {
        type: 'array',
        minItems: 2,
        maxItems: MAX_REPOS,
        items: { type: 'string' },
        description: 'Repos/packages to compare: owner/name, platform:name, or GitHub/GitLab/npm/PyPI URLs.',
      },
      useCase: {
        type: 'string',
        description: 'The specific job/constraints to compare against, e.g. edge API on Cloudflare Workers.',
      },
      report: { type: 'boolean', description: 'Write a local HTML comparison report. Default: true.' },
      openReport: {
        type: 'boolean',
        description: 'Open the local HTML comparison report in the browser. Default: true.',
      },
    },
    required: ['repos'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      useCase: { type: 'string' },
      bottom_line: { type: 'string' },
      winner: {
        type: 'object',
        properties: { repoId: { type: 'string' }, rationale: { type: 'string' } },
      },
      ranking: { type: 'array' },
      matrix: { type: 'array' },
      choose_if: { type: 'array' },
      risks: { type: 'array' },
      repos: { type: 'array' },
      report: {
        type: 'object',
        description: 'Local HTML report path/url opened for the user.',
        properties: { path: { type: 'string' }, url: { type: 'string' }, opened: { type: 'boolean' } },
      },
    },
    required: ['winner', 'ranking', 'repos'],
  },
};

const strings = (xs, max = 6) =>
  Array.isArray(xs)
    ? xs
        .map(String)
        .filter((s) => s.trim())
        .slice(0, max)
    : [];

function displayRepo(scan) {
  return `${scan.platform}:${scan.repoId}`;
}

export function buildComparePrompt(scans, useCase = '') {
  const summaries = scans.map((s, i) => ({
    index: i + 1,
    repoId: displayRepo(s),
    description: s.description || '',
    language: s.language || 'Unknown',
    license: s.license || 'Unknown',
    stars: s.stars || 0,
    fit: s.fit,
    bottom_line: s.bottom_line,
    recommendation: s.recommendation,
    confidence: s.confidence,
    health: s.health,
    pros: strings(s.pros, 6),
    cons: strings(s.cons, 6),
    risks: Array.isArray(s.risk_register) ? s.risk_register.slice(0, 5) : [],
    red_flags: Array.isArray(s.red_flags) ? s.red_flags.slice(0, 5) : [],
    compare_hooks: s.compare_hooks || '',
    capabilities: strings(s.capabilities, 8),
    category: s.category || '',
    tech_stack: s.tech_stack || {},
  }));

  return `You are a senior staff engineer choosing between dependencies for another experienced developer.

Use case / decision context: ${useCase || 'No specific use case provided; compare for general production adoption.'}

You are given RepoLens scan summaries. Treat them as evidence, not marketing. Pick a winner only when the evidence supports it. If the best answer is situational, still name the default choice and explain where another repo wins.

RepoLens scan summaries:
${JSON.stringify(summaries, null, 2)}

Return ONLY a valid JSON object. No markdown fences.

{
  "bottom_line": "Two decisive sentences naming the default pick and the main tradeoff.",
  "winner": { "repoId": "platform:owner/name or platform:package", "rationale": "Why this is the best default for the use case." },
  "ranking": [{ "repoId": "platform:owner/name", "rank": 1, "fit": "best | strong | situational | risky", "score": 90, "why": "Specific reason for this rank." }],
  "matrix": [{ "criterion": "Use-case fit | API ergonomics | ecosystem | maintenance | operational risk | migration cost", "winner": "repoId or tie", "notes": "What matters for this criterion.", "scores": [{ "repoId": "platform:owner/name", "score": 1, "note": "Short evidence-backed note." }] }],
  "choose_if": [{ "repoId": "platform:owner/name", "reasons": ["Choose this when...", "Avoid it when..."] }],
  "risks": [{ "repoId": "platform:owner/name", "risk": "Concrete risk", "mitigation": "How to de-risk before adoption." }],
  "trial_plan": { "goal": "What the user should know after a short bake-off.", "steps": ["Concrete step 1", "Concrete step 2", "Concrete step 3"], "decision_rule": "Rule for choosing after the trial." }
}`;
}

function extractJson(rawText) {
  const text = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in comparison response');
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeRanking(raw, scans) {
  const ids = new Set(scans.map(displayRepo));
  const rows = Array.isArray(raw) ? raw : [];
  const normalized = rows
    .filter((r) => r && ids.has(String(r.repoId || '')))
    .map((r, i) => ({
      repoId: String(r.repoId),
      rank: Number(r.rank) || i + 1,
      fit: ['best', 'strong', 'situational', 'risky'].includes(r.fit) ? r.fit : 'situational',
      score: Math.max(0, Math.min(100, Number(r.score) || 0)),
      why: String(r.why || ''),
    }))
    .sort((a, b) => a.rank - b.rank);
  if (normalized.length) return normalized;
  return scans
    .map((s, i) => ({
      repoId: displayRepo(s),
      rank: i + 1,
      fit: i === 0 ? 'best' : 'situational',
      score: Number(s.health?.score) || 0,
      why: s.bottom_line || s.description || 'Ranked by available RepoLens health/fit evidence.',
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1, fit: i === 0 ? 'best' : r.fit }));
}

export function parseComparisonResponse(rawText, scans, useCase = '') {
  const data = extractJson(rawText);
  const ranking = normalizeRanking(data.ranking, scans);
  const winnerId = String(data.winner?.repoId || ranking[0]?.repoId || displayRepo(scans[0]));
  return {
    useCase: useCase || 'General production adoption',
    bottom_line: String(data.bottom_line || ranking[0]?.why || ''),
    winner: {
      repoId: winnerId,
      rationale: String(data.winner?.rationale || ranking[0]?.why || ''),
    },
    ranking,
    matrix: Array.isArray(data.matrix) ? data.matrix.slice(0, 8) : [],
    choose_if: Array.isArray(data.choose_if)
      ? data.choose_if
          .filter((x) => x && x.repoId)
          .slice(0, scans.length)
          .map((x) => ({ repoId: String(x.repoId), reasons: strings(x.reasons, 5) }))
      : [],
    risks: Array.isArray(data.risks)
      ? data.risks
          .filter((x) => x && x.repoId)
          .slice(0, 10)
          .map((x) => ({
            repoId: String(x.repoId),
            risk: String(x.risk || ''),
            mitigation: String(x.mitigation || ''),
          }))
      : [],
    trial_plan: {
      goal: String(data.trial_plan?.goal || ''),
      steps: strings(data.trial_plan?.steps, 6),
      decision_rule: String(data.trial_plan?.decision_rule || ''),
    },
  };
}

export function validateCompareArgs(args = {}) {
  if (!Array.isArray(args.repos)) throw new Error('compare_repos requires repos: ["owner/name", ...]');
  const repos = args.repos.map((r) => String(r || '').trim()).filter(Boolean);
  if (repos.length < 2) throw new Error('compare_repos needs at least 2 repos');
  if (repos.length > MAX_REPOS) throw new Error(`compare_repos supports at most ${MAX_REPOS} repos`);
  return { repos, useCase: String(args.useCase || '').trim() };
}

export async function scanForComparison(repo) {
  const { platform, repoId } = parseRepoInput(repo);
  const repoData = await fetchRepoData(platform, repoId, ghOpts());
  const analysis = parseClaudeResponse(await callModel(buildPrompt(repoData)));
  return {
    repoId: repoData.repoId,
    platform,
    language: repoData.language,
    license: repoData.license,
    stars: repoData.stars,
    description: repoData.description,
    ...analysis,
    fit: deriveFit(analysis),
  };
}

export async function runCompareRepos(args) {
  const { repos, useCase } = validateCompareArgs(args);
  const scans = await Promise.all(repos.map(scanForComparison));
  const comparison = parseComparisonResponse(
    await callModel(buildComparePrompt(scans, useCase)),
    scans,
    useCase
  );
  const result = { ...comparison, repos: scans };
  const reportId = comparison.ranking.map((r) => r.repoId).join('-vs-');
  return attachHtmlReport('compare_repos', reportId, result, args);
}
