#!/usr/bin/env node
// HotD RAG MCP server (entry).
//
// IMPORTANT: For the stdio transport, stdout is reserved exclusively for JSON-RPC
// frames. Several reused website modules (src/db/pool.js, src/lib/azure.js) call
// console.log at module-init time. We redirect console.log -> console.error BEFORE
// any of those modules load, then dynamic-import the actual server bootstrap.

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    transport: { type: 'string', default: 'stdio' },
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '7456' },
  },
  strict: false,
});

if (args.transport === 'stdio') {
  // Keep stdout clean for JSON-RPC; route all info logs to stderr.
  console.log = (...a) => console.error(...a);
  console.info = (...a) => console.error(...a);
  // Some downstream libs write to process.stdout directly. Last-resort guard:
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, enc, cb) => {
    const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    // JSON-RPC frames from the MCP SDK start with '{' (a JSON object). Anything
    // else gets diverted to stderr so it cannot corrupt the protocol stream.
    if (s.trimStart().startsWith('{')) {
      return origStdoutWrite(chunk, enc, cb);
    }
    return process.stderr.write(chunk, enc, cb);
  };
}

const { runServer } = await import('./serve.mjs');
await runServer(args);
