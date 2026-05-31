// HotD RAG MCP server (transport bootstrap).
//
// Exports runServer({transport, host, port}). Called by server.mjs after stdout
// safety setup. Do NOT add module-init side effects that touch stdout.

import { createServer } from 'node:http';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { mcpToolList, dispatchTool } from './tools.mjs';
import { makeBearerAuth } from './auth.mjs';

export async function runServer(args) {
  const server = new Server(
    { name: 'hotd-rag', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolList }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: toolArgs } = req.params;
    try {
      const result = await dispatchTool(name, toolArgs);
      const text = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${err.message}` }],
      };
    }
  });

  if (args.transport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[hotd-rag-mcp] stdio transport ready (${mcpToolList.length} tools)`);
    return;
  }

  if (args.transport === 'http' || args.transport === 'sse') {
    const port = parseInt(args.port, 10);
    const host = args.host;
    const authCheck = makeBearerAuth(process.env.MCP_AUTH_TOKEN);

    const transports = new Map();

    const httpServer = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, tools: mcpToolList.length, transport: 'http' }));
        return;
      }

      if (!authCheck(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: provide Bearer MCP_AUTH_TOKEN' }));
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/sse')) {
        const transport = new SSEServerTransport('/messages', res);
        transports.set(transport.sessionId, transport);
        res.on('close', () => transports.delete(transport.sessionId));
        try {
          await server.connect(transport);
        } catch (err) {
          console.error('[hotd-rag-mcp] SSE connect error:', err);
        }
        return;
      }

      if (req.method === 'POST' && req.url.startsWith('/messages')) {
        const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId ? transports.get(sessionId) : null;
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No active SSE session for sessionId' }));
          return;
        }
        try {
          await transport.handlePostMessage(req, res);
        } catch (err) {
          console.error('[hotd-rag-mcp] message dispatch error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(port, host, () => {
      console.log(`[hotd-rag-mcp] HTTP/SSE listening on http://${host}:${port}`);
      console.log(`[hotd-rag-mcp] tools: ${mcpToolList.length}`);
      console.log(`[hotd-rag-mcp] endpoints: GET /sse, POST /messages?sessionId=..., GET /healthz`);
      console.log(`[hotd-rag-mcp] auth: ${process.env.MCP_AUTH_TOKEN ? 'Bearer token REQUIRED' : 'OPEN (no MCP_AUTH_TOKEN set)'}`);
    });
    return;
  }

  console.error(`Unknown transport: ${args.transport}. Use 'stdio' or 'http'.`);
  process.exit(2);
}
