#!/usr/bin/env node
// HotD FoundryVTT MCP server.
//
// Exposes the FoundryVTT server API (hotd-foundry.knoxrpg.com by default) to
// MCP-aware clients (VS Code Copilot, Claude Desktop). stdio transport only;
// stdout is reserved for JSON-RPC frames, so all logging goes to stderr.
//
// Config (env):
//   FOUNDRY_URL        base URL (default https://hotd-foundry.knoxrpg.com)
//   FOUNDRY_API_TOKEN  optional bearer token for a REST-relay module

import { parseArgs } from 'node:util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { mcpToolList, dispatchTool } from './tools.mjs';
import { foundryBaseUrl } from './foundry-client.mjs';

const { values: args } = parseArgs({
  options: { transport: { type: 'string', default: 'stdio' } },
  strict: false,
});

const server = new Server(
  { name: 'hotd-foundry', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolList }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: toolArgs } = req.params;
  try {
    const result = await dispatchTool(name, toolArgs || {});
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] };
  }
});

if (args.transport !== 'stdio') {
  console.error(`[hotd-foundry-mcp] only the stdio transport is supported (got --transport ${args.transport}).`);
  process.exit(2);
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hotd-foundry-mcp] stdio ready (${mcpToolList.length} tools) -> ${foundryBaseUrl()}`);
