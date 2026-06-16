#!/usr/bin/env node
// RepoLens MCP server (thin proof). Exposes one tool, `scan_repo`, that reads a
// GitHub repo's real source and returns RepoLens's verdict-first analysis as
// structured JSON. Local stdio transport, bring-your-own Anthropic key.
//
// The analysis pipeline is the extension's own modules, imported verbatim:
//   fetchRepoData -> buildPrompt -> (Anthropic) -> parseClaudeResponse
// The only MCP-specific piece is the env-key Anthropic call (see ./anthropic.js).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { fetchRepoData } from '../fetcher.js';
import { buildPrompt } from '../prompt.js';
import { parseClaudeResponse } from '../parser.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';

const SCAN_TOOL = {
  name: 'scan_repo',
  description:
    "Read a GitHub repo's real source and return RepoLens's verdict-first analysis: " +
    'overall fit, a health score, pros, cons, red flags, and capabilities. Use this when ' +
    'the user wants a structured read on whether to use a repository, not its README pitch.',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'A repo as owner/name or a GitHub URL' },
    },
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
      fit: { type: 'string', description: 'overall fit verdict' },
      health: { type: 'object', description: 'health score + signals' },
      pros: { type: 'array', items: { type: 'string' } },
      cons: { type: 'array', items: { type: 'string' } },
      red_flags: { type: 'array' },
      capabilities: { type: 'array', items: { type: 'string' } },
    },
    required: ['repoId', 'fit'],
  },
};

const server = new Server(
  { name: 'repolens', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [SCAN_TOOL] }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'scan_repo') {
    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const { platform, repoId } = parseRepoInput(req.params.arguments?.repo);
    const repoData = await fetchRepoData(platform, repoId);
    const text = await callAnthropic(buildPrompt(repoData));
    const analysis = parseClaudeResponse(text);
    const result = {
      repoId: repoData.repoId,
      platform,
      language: repoData.language,
      license: repoData.license,
      stars: repoData.stars,
      description: repoData.description,
      ...analysis,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `scan_repo failed: ${err.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
