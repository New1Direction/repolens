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

```bash
cd mcp
npm install
export ANTHROPIC_API_KEY=sk-ant-...       # required
export ANTHROPIC_MODEL=claude-sonnet-4-6  # optional override
export ANTHROPIC_TIMEOUT_MS=60000         # optional; hard per-call timeout (default 60s)
export GITHUB_TOKEN=ghp_...               # optional; lifts GitHub 60/hr → 5000/hr
node server.js                            # speaks MCP over stdio
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

## Current scope

- GitHub input only: `owner/name` or a GitHub URL.
- Anthropic provider only via `ANTHROPIC_API_KEY`.
- Local-only: no hosted backend, no RepoLens account.
- The Chrome extension still has the broader provider/platform UX; MCP is the
  agent-native path.

Planned next steps: publish as `repolens-mcp`, add OpenAI/OpenRouter/Gemini env
providers, and extend `scan_repo` to npm/PyPI/GitLab inputs.
