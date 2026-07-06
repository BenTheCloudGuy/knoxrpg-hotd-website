// Tool definitions + dispatch for the HotD FoundryVTT MCP server.
//
// The tools that work against a stock FoundryVTT install are `foundry_status`
// and `foundry_health`. Deeper game-data access (actors, scenes, journals)
// requires installing a REST-API relay module in Foundry and setting
// FOUNDRY_API_TOKEN; once that exists, call those endpoints via `foundry_api_get`.

import { foundryGet, foundryBaseUrl } from './foundry-client.mjs';

export const mcpToolList = [
  {
    name: 'foundry_status',
    description:
      'Fetch the FoundryVTT server status (GET /api/status): whether a world is active, the game system + versions, connected users, and uptime.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'foundry_health',
    description:
      'Reachability check for the FoundryVTT server root URL: up/down, HTTP status, and response latency in ms.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'foundry_api_get',
    description:
      'Authenticated GET against an absolute path on the configured FoundryVTT host (fixed by FOUNDRY_URL). Use for endpoints exposed by an installed REST-API relay module, e.g. "/api/status" or "/modules/<relay>/actors". The host cannot be changed via arguments.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path beginning with "/", e.g. /api/status',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

export async function dispatchTool(name, args = {}) {
  switch (name) {
    case 'foundry_status': {
      const r = await foundryGet('/api/status');
      if (!r.ok) throw new Error(`Foundry /api/status returned HTTP ${r.status} (${r.url})`);
      return r.body;
    }
    case 'foundry_health': {
      try {
        const r = await foundryGet('/');
        return { base: foundryBaseUrl(), up: r.ok, httpStatus: r.status, latencyMs: r.latencyMs };
      } catch (err) {
        return { base: foundryBaseUrl(), up: false, error: err.message };
      }
    }
    case 'foundry_api_get': {
      if (!args || typeof args.path !== 'string') throw new Error('path (string) is required');
      return await foundryGet(args.path);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
