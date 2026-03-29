const { credential } = require("../db/pool");
const { STORAGE_ACCOUNT_NAME, KEY_VAULT_URL, OPENAI_KV_SECRET_NAME } = require("../config");

let BlobServiceClient;
try { ({ BlobServiceClient } = require("@azure/storage-blob")); } catch (_e) { /* optional in dev */ }

let SecretClient;
try { ({ SecretClient } = require("@azure/keyvault-secrets")); } catch (_e) { /* optional in dev */ }

let OpenAI;
try { OpenAI = require("openai").default || require("openai"); } catch (_e) {}

// ── Key Vault client ───────────────────────────────────────────
let kvClient = null;
if (SecretClient && credential) {
  try {
    kvClient = new SecretClient(KEY_VAULT_URL, credential);
    console.log(`  Key Vault: client initialized → ${KEY_VAULT_URL}`);
  } catch (err) {
    console.warn("  WARN: Key Vault client init failed:", err.message);
  }
} else {
  console.log("  Key Vault: disabled (no SDK or credential)");
}

// ── AI client (Ollama or OpenAI, initialized async via initOpenAI) ──
let openaiClient = null;
let aiModel = process.env.AI_MODEL || "llama3";

async function initOpenAI() {
  if (openaiClient) return;

  // Prefer Ollama (OpenAI-compatible API)
  const ollamaHost = process.env.OLLAMA_HOST || "";
  if (OpenAI && ollamaHost) {
    openaiClient = new OpenAI({ baseURL: `${ollamaHost}/v1`, apiKey: "ollama" });
    console.log(`  AI: Ollama client initialized → ${ollamaHost} (model: ${aiModel})`);
    return;
  }

  // Fall back to OpenAI via Key Vault or env var
  let apiKey = "";
  if (kvClient) {
    try {
      const secret = await kvClient.getSecret(OPENAI_KV_SECRET_NAME);
      apiKey = secret.value || "";
      if (apiKey) console.log(`  AI: OpenAI key loaded from Key Vault (${OPENAI_KV_SECRET_NAME})`);
    } catch (err) {
      console.warn(`  AI: Key Vault fetch failed (${OPENAI_KV_SECRET_NAME}):`, err.message);
    }
  }
  if (!apiKey) {
    apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || "";
    if (apiKey) console.log("  AI: OpenAI key loaded from environment variable");
  }
  if (OpenAI && apiKey) {
    openaiClient = new OpenAI({ apiKey });
    aiModel = "gpt-4o-mini";
    console.log("  AI: OpenAI client initialized");
  } else {
    console.log("  AI: disabled (no Ollama host or OpenAI key)");
  }
}

// ── Blob upload ────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const { HOTD_CONTENT_DIR } = require("../config");

async function uploadBlobToStorage(filename, dataBuffer, mimeType, container = "hotd-website-content", directory = "") {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Local filesystem upload when HOTD_CONTENT_DIR is configured
  if (HOTD_CONTENT_DIR && container === "hotd-website-content") {
    const dir = directory ? path.join(HOTD_CONTENT_DIR, directory) : HOTD_CONTENT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, dataBuffer);
    return directory ? `/hotd-content/${directory}/${safeName}` : `/hotd-content/${safeName}`;
  }

  if (!BlobServiceClient || !credential) {
    throw new Error("Azure Storage SDK or credential not available");
  }
  const blobServiceClient = new BlobServiceClient(
    `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    credential
  );
  const containerClient = blobServiceClient.getContainerClient(container);
  const blobName = directory ? `${directory}/${safeName}` : safeName;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(dataBuffer, {
    blobHTTPHeaders: { blobContentType: mimeType },
    overwrite: true
  });
  return blockBlobClient.url;
}

module.exports = {
  uploadBlobToStorage,
  initOpenAI,
  get openaiClient() { return openaiClient; },
  get aiModel() { return aiModel; },
};
