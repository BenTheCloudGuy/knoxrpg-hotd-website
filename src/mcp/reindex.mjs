// Reindex trigger for the MCP server.
// Spawns scripts/embed-pipeline.js with the requested source/mode.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PIPELINE = path.join(REPO_ROOT, 'scripts', 'embed-pipeline.js');

const ALLOWED_SOURCES = new Set([
  'npc', 'session', 'lore', 'artifact', 'character',
  'journal', 'handout', 'calendar', 'all',
]);
const ALLOWED_MODES = new Set(['full', 'incremental', 'dry-run']);
const TIMEOUT_MS = 5 * 60 * 1000;

export function triggerReindex({ source, mode }) {
  if (!ALLOWED_SOURCES.has(source)) {
    return Promise.reject(
      new Error(`source must be one of: ${[...ALLOWED_SOURCES].join(', ')}`)
    );
  }
  const effectiveMode = mode || 'incremental';
  if (!ALLOWED_MODES.has(effectiveMode)) {
    return Promise.reject(
      new Error(`mode must be one of: ${[...ALLOWED_MODES].join(', ')}`)
    );
  }

  const cliArgs = [];
  if (source !== 'all') cliArgs.push('--source', source);
  cliArgs.push('--mode', effectiveMode);

  return new Promise((resolve, reject) => {
    const child = spawn('node', [PIPELINE, ...cliArgs], {
      cwd: REPO_ROOT,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(
        `embed-pipeline timed out after ${TIMEOUT_MS / 1000}s (source=${source}, mode=${effectiveMode})`
      ));
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeout);
      // Truncate output to keep MCP responses manageable
      resolve({
        ok: code === 0,
        exitCode: code,
        source,
        mode: effectiveMode,
        stdoutTail: stdout.slice(-8000),
        stderrTail: stderr.slice(-2000),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
