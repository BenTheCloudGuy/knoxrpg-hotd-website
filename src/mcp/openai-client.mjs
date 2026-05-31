// OpenAI client factory for the MCP server.
// Tries the website's Azure-aware init (Key Vault) first, then falls back to OPENAI_API_KEY.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let cachedClient = null;

export async function getOpenAIClient() {
  if (cachedClient) return cachedClient;

  // Try website's Azure-aware initializer (handles Key Vault + managed identity)
  try {
    const azure = require('../lib/azure.js');
    if (typeof azure.initOpenAI === 'function') {
      await azure.initOpenAI();
      if (azure.openaiClient) {
        cachedClient = azure.openaiClient;
        return cachedClient;
      }
    }
  } catch (_err) {
    // Fall through to env-var path
  }

  if (process.env.OPENAI_API_KEY) {
    const { default: OpenAI } = await import('openai');
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return cachedClient;
  }

  throw new Error(
    'OpenAI client unavailable: set OPENAI_API_KEY env var or configure Azure Key Vault (AZURE_KEYVAULT_NAME + managed identity)'
  );
}
