// scan_repo tool: verdict-first analysis of a GitHub repo.
// Pipeline (extension modules, verbatim): fetchRepoData -> buildPrompt -> (Anthropic) -> parseClaudeResponse.

import { fetchRepoData } from '../src/fetcher.js';
import { buildPrompt } from '../src/prompt.js';
import { parseClaudeResponse } from '../src/parser.js';
import { deriveFit } from '../src/verdict.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';
import { ghOpts } from './github-auth.js';

export const SCAN_TOOL = {
  name: 'scan_repo',
  description:
    "Read a GitHub repo's real source and return RepoLens's verdict-first analysis: " +
    'overall fit, a health score, pros, cons, red flags, and capabilities. Use this when ' +
    'the user wants a structured read on whether to use a repository, not its README pitch.',
  inputSchema: {
    type: 'object',
    properties: { repo: { type: 'string', description: 'A repo as owner/name or a GitHub URL' } },
    required: ['repo'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      repoId: { type: 'string' },
      platform: { type: 'string' },
      language: { type: 'string' },
      license: { type: 'string' },
      stars: { type: 'number' },
      description: { type: 'string' },
      fit: {
        type: 'object',
        description: 'Overall fit verdict, derived from health score, red flags, and pros/cons.',
        properties: {
          level: { type: 'string', enum: ['strong', 'solid', 'care', 'risky'] },
          label: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['level', 'label'],
      },
      bottom_line: { type: 'string', description: 'One-line takeaway.' },
      health: { type: 'object', description: 'health score + signals' },
      pros: { type: 'array', items: { type: 'string' } },
      cons: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array' },
      capabilities: { type: 'array', items: { type: 'string' } },
    },
    required: ['repoId', 'fit'],
  },
};

/**
 * Assemble the tool result from fetched repo data + parsed analysis. Pure (no
 * network/model) so the fit derivation is unit-testable. `fit` is derived here
 * because parseClaudeResponse does not produce it — the extension computes it
 * separately via deriveFit at render time.
 */
export function buildScanResult(platform, repoData, analysis) {
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

export async function runScanRepo(args) {
  const { platform, repoId } = parseRepoInput(args?.repo);
  const repoData = await fetchRepoData(platform, repoId, ghOpts());
  const analysis = parseClaudeResponse(await callAnthropic(buildPrompt(repoData)));
  return buildScanResult(platform, repoData, analysis);
}
