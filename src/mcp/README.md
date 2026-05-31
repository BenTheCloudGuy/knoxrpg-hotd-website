# HotD RAG MCP Server

A Model Context Protocol server that exposes the "Halls of the Damned" campaign RAG, lookup tools, Story Forge, and reindex pipeline to MCP-aware AI agents (Claude Desktop, VS Code Copilot, custom clients).

## What it exposes

| Tool                     | Type        | Purpose                                                                 |
| ------------------------ | ----------- | ----------------------------------------------------------------------- |
| `search_embeddings`      | RAG (raw)   | Hybrid pgvector + full-text search over `hotd_embeddings`               |
| `rag_status`             | Health      | Total/per-source chunk counts and freshness                             |
| `trigger_reindex`        | Pipeline    | Spawn `scripts/embed-pipeline.js` for a given source/mode               |
| `story_forge_generate`   | Generation  | RAG-augmented prose generation with 9 templates                         |
| `lookup_npc`             | Lookup      | Fuzzy NPC lookup by name                                                |
| `search_npcs`            | Lookup      | NPC search by location/status/keyword                                   |
| `get_session_log`        | Lookup      | Session summary by number or keyword                                    |
| `lookup_spell`           | D&D ref     | Spell lookup                                                            |
| `lookup_monster`         | D&D ref     | Monster lookup                                                          |
| `lookup_magic_item`      | D&D ref     | Magic item lookup                                                       |
| `lookup_artifact`        | Lookup      | Campaign artifact lookup                                                |
| `get_player_character`   | Lookup      | PC sheet by name                                                        |
| `get_handout`            | Lookup      | Handout by name/keyword                                                 |
| `get_calendar`           | Lookup      | Barovian calendar events                                                |
| `search_dnd_reference`   | RAG         | Semantic search over D&D rulebooks/DDB content                          |
| `search_campaign_lore`   | RAG         | Semantic search over campaign-only content                              |

`query_database` and `describe_table` from the website AI tool surface are deliberately NOT exposed. Use the typed lookups instead.

## Environment

The server reuses the website's libs (`src/db/pool.js`, `src/lib/rag.js`, `src/lib/ai-tools.js`, `src/lib/azure.js`). Required env vars:

```
PGHOST=localhost
PGPORT=30432
PGUSER=cortana
PGPASSWORD=...
PGDATABASE=dnd_website

# One of:
OPENAI_API_KEY=sk-...
# or for cluster/Arc nodes: managed identity + AZURE_KEYVAULT_NAME (set via Helm)

# HTTP transport only:
MCP_AUTH_TOKEN=...   # if unset, the HTTP transport is OPEN (use only on 127.0.0.1)
```

## Install

```bash
cd src && npm install
```

This installs `@modelcontextprotocol/sdk` alongside the website deps.

## Run

### stdio (for VS Code Copilot / Claude Desktop)

```bash
cd src && npm run mcp
# or
node src/mcp/server.mjs
```

### HTTP / SSE (for remote/cluster use)

```bash
cd src && npm run mcp:http
# or
node src/mcp/server.mjs --transport http --host 127.0.0.1 --port 7456
```

Endpoints:
- `GET /sse` — opens an SSE stream and assigns a sessionId
- `POST /messages?sessionId=<id>` — clients send JSON-RPC messages here
- `GET /healthz` — returns `{ ok: true, tools, transport }` (no auth required)

## Client config

### VS Code Copilot (`.vscode/mcp.json`)

```jsonc
{
  "servers": {
    "hotd-rag": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/src/mcp/server.mjs"],
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "30432",
        "PGUSER": "cortana",
        "PGPASSWORD": "REDACTED",
        "PGDATABASE": "dnd_website",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}"
      }
    }
  }
}
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows)

```jsonc
{
  "mcpServers": {
    "hotd-rag": {
      "command": "node",
      "args": ["/absolute/path/to/knoxrpg-hotd-website/src/mcp/server.mjs"],
      "env": {
        "PGHOST": "localhost",
        "PGPORT": "30432",
        "PGUSER": "cortana",
        "PGPASSWORD": "REDACTED",
        "PGDATABASE": "dnd_website",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Remote HTTP client

```bash
curl -N -H "Authorization: Bearer $MCP_AUTH_TOKEN" http://hotd-mcp.knoxrpg.com/sse
# then POST messages to /messages?sessionId=<id> with same header
```

## Notes

- The `trigger_reindex` tool spawns `scripts/embed-pipeline.js` as a child process with a 5-minute hard timeout. Output is truncated to the last 8 KB of stdout and 2 KB of stderr.
- The `story_forge_generate` tool runs the same logic as the website's `/api/dm-admin/story-forge/generate` endpoint, but in-process. The model is read from the `hotd_config.ai_model` row.
- All tools run in DM mode (`isDM = true`), so MCP callers get DM-only context. Treat the MCP server as a privileged interface and bind it to localhost or require `MCP_AUTH_TOKEN` for remote use.
- Helm deployment for the HTTP transport is not yet wired. To run it in the cluster, add a `Deployment + Service + Ingress` in `helm/hotd-website/templates/` and inject `MCP_AUTH_TOKEN` from a `Secret`.
