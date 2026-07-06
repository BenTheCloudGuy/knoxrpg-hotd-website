# HotD FoundryVTT MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the Halls of the Damned FoundryVTT server API to MCP-aware AI clients
(VS Code Copilot, Claude Desktop).

## Tools

| Tool              | Works today | Purpose                                                                 |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| `foundry_status`  | ✅          | `GET /api/status` — active world, game system, versions, users, uptime |
| `foundry_health`  | ✅          | Root-URL reachability: up/down, HTTP status, latency                    |
| `foundry_api_get` | ✅ (host-locked) | Authenticated GET against any absolute path on the configured Foundry host |

`foundry_api_get` fixes the host to `FOUNDRY_URL`; only the **path** is
argument-controlled (no scheme, no `..`), so it cannot be used for SSRF.

## Deeper game-data access (actors, scenes, journals)

Stock FoundryVTT only exposes `/api/status` as machine-readable. To read/write
game documents, install a REST-API relay module in Foundry (e.g. a
`foundryvtt-rest-api` style module), set `FOUNDRY_API_TOKEN`, and call the
module's endpoints through `foundry_api_get` (or add typed tools in
[tools.mjs](tools.mjs)). This is owned by the **Summoner** agent.

## Environment

```
FOUNDRY_URL=https://hotd-foundry.knoxrpg.com   # default
FOUNDRY_API_TOKEN=...                           # optional, for a REST relay module
```

## Install & run

```bash
cd foundryvtt/mcp && npm install
npm run mcp        # stdio transport
```

## VS Code client config

Registered in [.vscode/mcp.json](../../.vscode/mcp.json) as the `hotd-foundry`
server. Reload the MCP servers in VS Code after first install.
