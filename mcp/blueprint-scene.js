// blueprint_scene tool: a laid-out nodes/edges graph of how a repo is built —
// ready for a <DependencyGraph>-style component.
//
// Pipeline (extension modules, verbatim): fetchRepoData + fetchSource ->
// atoms prompt/parse -> lineage prompt/parse -> buildBlueprintScene. Two model
// calls (atoms, then lineage); the optional "feynman" plain-English layer is
// skipped since the scene only needs atoms + lineage. `facts` is null here —
// the extension's local "runner" (measured metrics) isn't part of a headless MCP.

import { fetchRepoData } from '../src/fetcher.js';
import {
  fetchSource,
  buildAtomsPrompt,
  parseAtoms,
  buildLineagePrompt,
  parseLineage,
} from '../src/deepdive.js';
import { buildBlueprintScene } from '../src/blueprint-adapter.js';
import { parseRepoInput } from './repo-input.js';
import { callAnthropic } from './anthropic.js';
import { ghOpts } from './github-auth.js';
import { attachHtmlReport } from './report.js';

export const BLUEPRINT_TOOL = {
  name: 'blueprint_scene',
  description:
    'Map how a GitHub repo is built and return a laid-out graph: nodes (its key parts) and ' +
    'edges (how they relate), with positions. Use this to visualize a repository as a ' +
    'dependency / architecture diagram. Heavier than scan_repo (reads source, two model calls).',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'A repo as owner/name or a GitHub URL' },
      report: { type: 'boolean', description: 'Write a local HTML report. Default: true.' },
      openReport: {
        type: 'boolean',
        description: 'Open the local HTML report in the browser. Default: true.',
      },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  // Mirrors the real scene object returned by buildBlueprintScene (scene.js +
  // repair-graph.js): engine-shaped nodes/edges, not a {source,target} graph.
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      scope: { type: 'string' },
      repoId: { type: 'string' },
      title: { type: 'string' },
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            kind: { type: 'string', description: 'subsystem|module|concept|entrypoint|data' },
            layer: { type: ['string', 'null'] },
            x: { type: 'number' },
            y: { type: 'number' },
            pinned: { type: 'boolean' },
            ref: {
              type: 'object',
              description: 'root = lineage root (load-bearing); plus purpose + files',
              properties: {
                root: { type: 'boolean' },
                purpose: { type: ['string', 'null'] },
                files: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['id', 'label', 'kind', 'x', 'y'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            rel: { type: 'string', description: 'depends-on|enables|triggers|derives-from' },
            note: { type: ['string', 'null'] },
            userDrawn: { type: 'boolean' },
          },
          required: ['id', 'from', 'to', 'rel'],
        },
      },
      annotations: { type: 'array' },
      camera: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' }, zoom: { type: 'number' } },
      },
      source: { type: 'object', description: 'lens + timestamps' },
      report: {
        type: 'object',
        description: 'Local HTML report path/url opened for the user.',
        properties: { path: { type: 'string' }, url: { type: 'string' }, opened: { type: 'boolean' } },
      },
    },
    required: ['id', 'nodes', 'edges'],
  },
};

export async function runBlueprintScene(args) {
  const { platform, repoId } = parseRepoInput(args?.repo);
  const opts = ghOpts();
  const repoData = await fetchRepoData(platform, repoId, opts);
  const source = await fetchSource(platform, repoId, opts);
  const { atoms } = parseAtoms(await callAnthropic(buildAtomsPrompt(repoData, source, null)));
  const lineage = parseLineage(await callAnthropic(buildLineagePrompt(atoms)));
  const result = buildBlueprintScene({ deepDive: { atoms, lineage }, repoId, title: repoId });
  return attachHtmlReport('blueprint_scene', repoId, result, args);
}
