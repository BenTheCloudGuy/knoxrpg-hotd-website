// ══════════════════════════════════════════════════════════════
// ── AZURE KEY VAULT ACCESS (shared) ───────────────────────────
// A thin, admin-only helper for reading/writing Key Vault secrets,
// keys, and certificates from the HOTD Website (DMCC) pod. Auth is
// a service-principal ClientSecretCredential sourced from env (the
// SP creds are injected via the `hotd-website-azure-sp` k8s secret;
// see helm/hotd-website/templates + values.yaml).
//
// The RAG backend (`dnd-rag`) does NOT use this — Key Vault
// orchestration belongs to the website/DMCC layer only.
//
// Env (any of the aliases):
//   AZURE_KEYVAULT_NAME | KEYVAULT_NAME        (vault short name)
//   AZURE_CLIENT_ID
//   AZURE_CLIENT_SECRET | AZURE_SECRET
//   AZURE_TENANT_ID     | AZURE_TENANT
//
// SECURITY: never log secret/key/cert material. Callers (admin
// endpoints) decide what is returned to the client. All routes that
// use this MUST be behind requireAdmin.
// ══════════════════════════════════════════════════════════════

let identity, secretsSdk, keysSdk, certsSdk;
try {
  identity = require("@azure/identity");
  secretsSdk = require("@azure/keyvault-secrets");
  keysSdk = require("@azure/keyvault-keys");
  certsSdk = require("@azure/keyvault-certificates");
} catch (_) { /* SDKs absent → isConfigured() false */ }

function config() {
  return {
    vault: process.env.AZURE_KEYVAULT_NAME || process.env.KEYVAULT_NAME || "",
    clientId: process.env.AZURE_CLIENT_ID || "",
    clientSecret: process.env.AZURE_CLIENT_SECRET || process.env.AZURE_SECRET || "",
    tenantId: process.env.AZURE_TENANT_ID || process.env.AZURE_TENANT || "",
  };
}

function vaultName() { return config().vault; }
function vaultUrl(name) { return `https://${name}.vault.azure.net`; }

function isConfigured() {
  const c = config();
  return !!(identity && secretsSdk && c.vault && c.clientId && c.clientSecret && c.tenantId);
}

let _cred = null;
function credential() {
  if (!identity || !secretsSdk) throw new Error("Azure Key Vault SDK not installed");
  const c = config();
  if (!c.vault || !c.clientId || !c.clientSecret || !c.tenantId) {
    throw new Error("Key Vault not configured (need AZURE_KEYVAULT_NAME/CLIENT_ID/CLIENT_SECRET/TENANT_ID)");
  }
  if (!_cred) _cred = new identity.ClientSecretCredential(c.tenantId, c.clientId, c.clientSecret);
  return _cred;
}

let _secretClient, _keyClient, _certClient;
function secretClient() { if (!_secretClient) _secretClient = new secretsSdk.SecretClient(vaultUrl(config().vault), credential()); return _secretClient; }
function keyClient() { if (!_keyClient) _keyClient = new keysSdk.KeyClient(vaultUrl(config().vault), credential()); return _keyClient; }
function certClient() { if (!_certClient) _certClient = new certsSdk.CertificateClient(vaultUrl(config().vault), credential()); return _certClient; }

// ── SECRETS ───────────────────────────────────────────────────
async function getSecret(name) {
  const s = await secretClient().getSecret(name);
  return { name: s.name, value: s.value, version: s.properties.version, enabled: s.properties.enabled, updatedOn: s.properties.updatedOn, createdOn: s.properties.createdOn };
}
// Upsert: KV `setSecret` both CREATES and UPDATES (new version).
async function setSecret(name, value, options = {}) {
  const s = await secretClient().setSecret(name, value, options);
  return { name: s.name, version: s.properties.version, createdOn: s.properties.createdOn, updatedOn: s.properties.updatedOn };
}
async function listSecrets() {
  const out = [];
  for await (const p of secretClient().listPropertiesOfSecrets()) {
    out.push({ name: p.name, enabled: p.enabled, updatedOn: p.updatedOn, createdOn: p.createdOn, expiresOn: p.expiresOn });
  }
  return out;
}
async function deleteSecret(name) {
  const poller = await secretClient().beginDeleteSecret(name);
  await poller.pollUntilDone();
  return { name, deleted: true };
}

// ── KEYS ──────────────────────────────────────────────────────
async function getKey(name) {
  const k = await keyClient().getKey(name);
  return { name: k.name, keyType: k.keyType, version: k.properties.version, enabled: k.properties.enabled, createdOn: k.properties.createdOn };
}
// Create/rotate: creates a new key (or a new version if it exists).
async function createKey(name, keyType = "RSA", options = {}) {
  const k = await keyClient().createKey(name, keyType, options);
  return { name: k.name, keyType: k.keyType, version: k.properties.version, createdOn: k.properties.createdOn };
}
async function listKeys() {
  const out = [];
  for await (const p of keyClient().listPropertiesOfKeys()) {
    out.push({ name: p.name, enabled: p.enabled, updatedOn: p.updatedOn, createdOn: p.createdOn, expiresOn: p.expiresOn });
  }
  return out;
}

// ── CERTIFICATES ──────────────────────────────────────────────
async function getCertificate(name) {
  const c = await certClient().getCertificate(name);
  return { name: c.name, version: c.properties.version, enabled: c.properties.enabled, createdOn: c.properties.createdOn, expiresOn: c.properties.expiresOn, thumbprint: c.properties.x509Thumbprint ? Buffer.from(c.properties.x509Thumbprint).toString("hex") : null };
}
// Import an existing cert (PFX/PEM base64). For DDB-style self-service.
async function importCertificate(name, base64Value, options = {}) {
  const buf = Buffer.from(base64Value, "base64");
  const c = await certClient().importCertificate(name, buf, options);
  return { name: c.name, version: c.properties.version, createdOn: c.properties.createdOn };
}
// Create a new (self-signed/CA) cert via policy.
async function createCertificate(name, policy, options = {}) {
  const poller = await certClient().beginCreateCertificate(name, policy || certsSdk.DefaultCertificatePolicy, options);
  const c = await poller.pollUntilDone();
  return { name: c.name, version: c.properties && c.properties.version };
}
async function listCertificates() {
  const out = [];
  for await (const p of certClient().listPropertiesOfCertificates()) {
    out.push({ name: p.name, enabled: p.enabled, updatedOn: p.updatedOn, createdOn: p.createdOn, expiresOn: p.expiresOn });
  }
  return out;
}

// ── HEALTH ────────────────────────────────────────────────────
// Lightweight connectivity check (auth + reachability) without
// exposing any secret material.
async function healthCheck() {
  if (!isConfigured()) {
    return { configured: false, ok: false, vault: config().vault || null, reason: "Key Vault credentials not configured in this environment" };
  }
  try {
    // list is cheap and confirms auth + data-plane read.
    const it = secretClient().listPropertiesOfSecrets();
    const first = await it.next();
    return { configured: true, ok: true, vault: config().vault, reachable: true, sampleName: first && first.value ? first.value.name : null };
  } catch (err) {
    return { configured: true, ok: false, vault: config().vault, reason: err.message };
  }
}

module.exports = {
  isConfigured, vaultName, healthCheck,
  getSecret, setSecret, listSecrets, deleteSecret,
  getKey, createKey, listKeys,
  getCertificate, importCertificate, createCertificate, listCertificates,
};
