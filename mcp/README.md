# RepoLens MCP server

Let your AI agent audit dependencies before it installs or recommends them.

RepoLens MCP runs locally over stdio. Your agent gets structured JSON, and the MCP
server also writes a self-contained **local HTML report** and opens it in your
browser by default — so users get the full RepoLens visual verdict, not just a
block of text in chat.

## Why agents need this

Coding agents constantly choose packages from README text, stars, or stale blog
posts. RepoLens gives the agent a dependency due-diligence tool:

> “Should I use this repo, what are the risks, and what should I try first?”

## Tools

- `scan_repo` — verdict-first report: fit, health, pros, cons, red flags,
  capabilities, bottom line.
- `deep_dive` — plain-English architecture explanation, weak spots, assumptions,
  self-test questions, atoms + lineage.
- `blueprint_scene` — graph-shaped architecture map with nodes/edges/positions.

Every tool accepts:

```json
{
  "repo": "honojs/hono",
  "report": true,
  "openReport": true
}
```

- `report` defaults to `true` and writes a local `.html` file.
- `openReport` defaults to `true` and opens that file in the browser.
- Set `openReport: false` if the agent should only return the report path.
- Set `report: false` for pure JSON/tool-only usage.

The returned JSON includes:

```json
{
  "report": {
    "path": "/tmp/repolens-mcp-reports/honojs-hono-scan_repo-....html",
    "url": "file:///tmp/repolens-mcp-reports/honojs-hono-scan_repo-....html",
    "opened": true
  }
}
```

## Setup

After npm publish, the intended one-command path is:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx repolens-mcp
```

From a repo checkout today:

```bash
cd mcp
npm install
export ANTHROPIC_API_KEY=sk-ant-...       # one provider key is required
export GITHUB_TOKEN=ghp_...               # optional; lifts GitHub 60/hr → 5000/hr
node server.js                            # speaks MCP over stdio
```

Provider environment variables:

```bash
# Auto-pick order: Anthropic → OpenAI → OpenRouter → Google
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export OPENROUTER_API_KEY=sk-or-...
export GOOGLE_API_KEY=AIza...

# Optional model overrides
export ANTHROPIC_MODEL=claude-sonnet-4-6
export OPENAI_MODEL=gpt-4.1-mini
export OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
export GOOGLE_MODEL=gemini-2.5-flash

# Force one provider instead of auto-pick
export REPOLENS_MCP_PROVIDER=openai # anthropic | openai | openrouter | google
export REPOLENS_MCP_TIMEOUT_MS=60000
```

Optional report environment variables:

```bash
export REPOLENS_MCP_OPEN_REPORT=0          # never auto-open reports
export REPOLENS_MCP_REPORT_DIR=/tmp/reports # custom report directory
```

A `GITHUB_TOKEN` is strongly recommended for `blueprint_scene` and `deep_dive`:
each makes multiple GitHub calls and anonymous GitHub API limits are low.

## Claude Desktop config

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "repolens": {
      "command": "node",
      "args": ["/absolute/path/to/repolens/mcp/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

## Example prompts

```text
Use RepoLens to check whether I should use honojs/hono for an edge API.
```

```text
Before you add this dependency, run RepoLens scan_repo and open the report.
```

```text
Generate a RepoLens deep_dive for github.com/fastify/fastify and summarize the gaps.
```

```text
Use blueprint_scene on remix-run/remix so I can see how the repo is structured.
```

## Supported inputs

`scan_repo` supports all fetcher-backed RepoLens targets:

```text
honojs/hono
https://github.com/honojs/hono
github:honojs/hono
gitlab:inkscape/inkscape
https://gitlab.com/inkscape/inkscape
npm:react
https://www.npmjs.com/package/@modelcontextprotocol/sdk
pypi:fastapi
https://pypi.org/project/fastapi/
```

`deep_dive` and `blueprint_scene` accept the same inputs, but source-tree reads are
GitHub-deep today; non-GitHub targets degrade to README/metadata context.

## Current scope

- Local-only: no hosted backend, no RepoLens account.
- Provider support: Anthropic, OpenAI, OpenRouter, and Google via env keys.
- The Chrome extension still has the richest provider/platform UI; MCP is the
  agent-native path.

Planned next steps: publish `repolens-mcp` to npm and add a comparison tool.
