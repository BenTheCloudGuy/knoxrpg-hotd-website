// ══════════════════════════════════════════════════════════════
// ── OpenAI + Storage Client ───────────────────────────────────
// Initializes OpenAI SDK from OPENAI_API_KEY env var (Cortana).
// Also handles file uploads to local storage or Azure Blob.
// ══════════════════════════════════════════════════════════════

const { credential } = require("../db/pool");
const { STORAGE_ACCOUNT_NAME } = require("../config");

let BlobServiceClient;
try { ({ BlobServiceClient } = require("@azure/storage-blob")); } catch (_e) { /* optional */ }

let OpenAI;
try { OpenAI = require("openai"); } catch (_e) {}

// ── AI client (OpenAI, initialized async via initOpenAI) ──
let openaiClient = null;
let aiModel = process.env.AI_MODEL || "gpt-5.4-mini";

async function initOpenAI() {
  if (openaiClient) return;

  const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || "";
  if (OpenAI && apiKey) {
    openaiClient = new OpenAI({ apiKey });
    console.log(`  AI: OpenAI client initialized (model: ${aiModel})`);
  } else {
    console.log("  AI: disabled (no OpenAI key found)");
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
