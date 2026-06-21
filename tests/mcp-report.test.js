import { describe, it, expect } from 'vitest';
import { buildReportHtml, attachHtmlReport } from '../mcp/report.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scan = {
  repoId: 'owner/repo',
  language: 'TypeScript',
  license: 'MIT',
  stars: 12,
  bottom_line: 'Use it for edge APIs.',
  fit: { level: 'solid', label: 'Solid fit', why: 'Health 80' },
  health: { score: 80 },
  pros: ['Fast'],
  cons: ['Young'],
  red_flags: [{ title: 'Churn', text: 'Dependencies move quickly.' }],
  capabilities: ['routing'],
};

describe('MCP local HTML reports', () => {
  it('renders a self-contained RepoLens scan report', () => {
    const html = buildReportHtml({ kind: 'scan_repo', repoId: 'owner/repo', data: scan });
    expect(html).toContain('RepoLens MCP scan');
    expect(html).toContain('owner/repo');
    expect(html).toContain('Solid fit');
    expect(html).toContain('Raw structured JSON');
    expect(html).not.toContain('<script');
  });

  it('renders a visual comparison report', () => {
    const html = buildReportHtml({
      kind: 'compare_repos',
      data: {
        useCase: 'edge API',
        bottom_line: 'Pick Hono.',
        winner: { repoId: 'github:honojs/hono', rationale: 'Edge-first.' },
        ranking: [{ repoId: 'github:honojs/hono', rank: 1, score: 94, why: 'Edge-first.' }],
        matrix: [{ criterion: 'Use-case fit', winner: 'github:honojs/hono', notes: 'Best fit.' }],
      },
    });
    expect(html).toContain('RepoLens MCP comparison');
    expect(html).toContain('Tradeoff matrix');
    expect(html).toContain('github:honojs/hono');
  });

  it('writes a report and can skip browser opening for agent/tests', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repolens-report-test-'));
    const prev = process.env.REPOLENS_MCP_REPORT_DIR;
    process.env.REPOLENS_MCP_REPORT_DIR = dir;
    try {
      const out = await attachHtmlReport('scan_repo', 'owner/repo', scan, { openReport: false });
      expect(out.report.opened).toBe(false);
      expect(out.report.path).toContain(dir);
      expect(out.report.url).toMatch(/^file:/);
    } finally {
      if (prev === undefined) delete process.env.REPOLENS_MCP_REPORT_DIR;
      else process.env.REPOLENS_MCP_REPORT_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('can be disabled per tool call', async () => {
    await expect(attachHtmlReport('scan_repo', 'owner/repo', scan, { report: false })).resolves.toBe(scan);
  });
});
