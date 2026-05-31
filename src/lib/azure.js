// ══════════════════════════════════════════════════════════════
// ── OpenAI + Local Asset Writer ───────────────────────────────
// Reads OpenAI key from OPENAI_API_KEY / OPENAI_KEY env var.
// Writes uploaded assets to the local filesystem at HOTD_CONTENT_DIR.
// Azure SDKs were removed in 3.9.0; provision the OpenAI key as a
// Kubernetes Secret and mount a writable PVC for asset uploads.
// ══════════════════════════════════════════════════════════════

let OpenAI;
try { OpenAI = require("openai"); } catch (_e) {}

// ── AI client (OpenAI, initialized async via initOpenAI) ──
let openaiClient = null;
let aiModel = process.env.AI_MODEL || "gpt-5.4-mini";

async function initOpenAI() {
  if (openaiClient) return;

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";

  if (OpenAI && apiKey) {
    openaiClient = new OpenAI({ apiKey });
    console.log(`  AI: OpenAI client initialized (model: ${aiModel})`);
  } else if (!OpenAI) {
    console.log("  AI: disabled (openai package not installed)");
  } else {
    console.log("  AI: disabled (no OPENAI_API_KEY / OPENAI_KEY in environment)");
  }
}

// ── Local filesystem asset writer ─────────────────────────────
const fs = require("fs");
const path = require("path");
const { HOTD_CONTENT_DIR, HOTD_UPLOADS_DIR } = require("../config");

async function uploadBlobToStorage(filename, dataBuffer, mimeType, container = "hotd-website-content", directory = "") {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Prefer the writable uploads PVC; fall back to HOTD_CONTENT_DIR for dev
  // installs that only mount the legacy content dir (and make it writable).
  const writeRoot = HOTD_UPLOADS_DIR || HOTD_CONTENT_DIR;
  if (!writeRoot) {
    throw new Error("Asset upload not configured: set HOTD_UPLOADS_DIR (writable PVC) or HOTD_CONTENT_DIR");
  }

  const dir = directory ? path.join(writeRoot, directory) : writeRoot;
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, dataBuffer);
  return directory ? `/hotd-content/${directory}/${safeName}` : `/hotd-content/${safeName}`;
}

module.exports = {
  uploadBlobToStorage,
  initOpenAI,
  get openaiClient() { return openaiClient; },
  get aiModel() { return aiModel; },
};
