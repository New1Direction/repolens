import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildComparePrompt,
  parseComparisonResponse,
  runCompareRepos,
  validateCompareArgs,
} from '../mcp/compare-repos.js';

const scanA = {
  platform: 'github',
  repoId: 'honojs/hono',
  language: 'TypeScript',
  license: 'MIT',
  stars: 24000,
  description: 'Web framework',
  bottom_line: 'Best for edge APIs.',
  fit: { level: 'strong', label: 'Strong fit' },
  health: { score: 92 },
  pros: ['Edge-first'],
  cons: ['Smaller ecosystem'],
  capabilities: ['routing'],
};
const scanB = {
  platform: 'github',
  repoId: 'fastify/fastify',
  language: 'JavaScript',
  license: 'MIT',
  stars: 33000,
  description: 'Server framework',
  bottom_line: 'Best for Node services.',
  fit: { level: 'solid', label: 'Solid fit' },
  health: { score: 88 },
  pros: ['Mature'],
  cons: ['Less edge-native'],
  capabilities: ['routing'],
};

const comparisonJson = JSON.stringify({
  bottom_line: 'Pick Hono for edge APIs; pick Fastify for conventional Node services.',
  winner: { repoId: 'github:honojs/hono', rationale: 'It matches edge runtime constraints better.' },
  ranking: [
    { repoId: 'github:honojs/hono', rank: 1, fit: 'best', score: 94, why: 'Edge-first design.' },
    { repoId: 'github:fastify/fastify', rank: 2, fit: 'strong', score: 86, why: 'Excellent Node option.' },
  ],
  matrix: [
    {
      criterion: 'Use-case fit',
      winner: 'github:honojs/hono',
      notes: 'Edge matters most.',
      scores: [
        { repoId: 'github:honojs/hono', score: 5, note: 'Edge native.' },
        { repoId: 'github:fastify/fastify', score: 3, note: 'Node first.' },
      ],
    },
  ],
  choose_if: [{ repoId: 'github:honojs/hono', reasons: ['Choose for Workers'] }],
  risks: [{ repoId: 'github:fastify/fastify', risk: 'Runtime fit', mitigation: 'Prototype on target edge.' }],
  trial_plan: {
    goal: 'Run a route in both.',
    steps: ['Build hello world'],
    decision_rule: 'Pick lower friction.',
  },
});

describe('compare_repos helpers', () => {
  it('validates repo count', () => {
    expect(validateCompareArgs({ repos: ['a/b', 'c/d'] })).toEqual({ repos: ['a/b', 'c/d'], useCase: '' });
    expect(() => validateCompareArgs({ repos: ['a/b'] })).toThrow(/at least 2/);
    expect(() => validateCompareArgs({ repos: ['1/1', '2/2', '3/3', '4/4', '5/5', '6/6'] })).toThrow(
      /at most/
    );
  });

  it('builds a use-case-aware comparison prompt', () => {
    const prompt = buildComparePrompt([scanA, scanB], 'edge API');
    expect(prompt).toContain('edge API');
    expect(prompt).toContain('github:honojs/hono');
    expect(prompt).toContain('tradeoff');
  });

  it('parses and normalizes comparison JSON', () => {
    const out = parseComparisonResponse(comparisonJson, [scanA, scanB], 'edge API');
    expect(out.winner.repoId).toBe('github:honojs/hono');
    expect(out.ranking).toHaveLength(2);
    expect(out.matrix[0].criterion).toBe('Use-case fit');
    expect(out.trial_plan.steps).toEqual(['Build hello world']);
  });
});

describe('runCompareRepos (offline, mocked GitHub + model)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'sk-test' };
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('scans each repo, compares them, and skips report when requested', async () => {
    const scanJsonA = JSON.stringify({
      health: { score: 92 },
      red_flags: [],
      pros: ['Edge-first'],
      cons: [],
      bottom_line: 'Best for edge APIs.',
    });
    const scanJsonB = JSON.stringify({
      health: { score: 88 },
      red_flags: [],
      pros: ['Mature'],
      cons: ['Node-first'],
      bottom_line: 'Best for Node services.',
    });
    let modelCalls = 0;
    global.fetch = vi.fn((url, init) => {
      const u = String(url);
      if (u.includes('api.anthropic.com')) {
        modelCalls += 1;
        const body = JSON.parse(init.body);
        const prompt = body.messages[0].content;
        const text = prompt.includes('RepoLens scan summaries')
          ? comparisonJson
          : prompt.includes('honojs/hono')
            ? scanJsonA
            : scanJsonB;
        return Promise.resolve({ ok: true, json: async () => ({ content: [{ text }] }) });
      }
      if (u.includes('/readme') || u.includes('/languages')) return Promise.resolve({ ok: false });
      if (u.endsWith('/repos/honojs/hono')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            description: 'Edge framework',
            stargazers_count: 24,
            language: 'TypeScript',
            license: { spdx_id: 'MIT' },
          }),
        });
      }
      if (u.endsWith('/repos/fastify/fastify')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            description: 'Node framework',
            stargazers_count: 33,
            language: 'JavaScript',
            license: { spdx_id: 'MIT' },
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const out = await runCompareRepos({
      repos: ['honojs/hono', 'fastify/fastify'],
      useCase: 'edge API',
      report: false,
    });
    expect(modelCalls).toBe(3);
    expect(out.winner.repoId).toBe('github:honojs/hono');
    expect(out.repos).toHaveLength(2);
    expect(out.report).toBeUndefined();
  });
});
