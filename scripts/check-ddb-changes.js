#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ── DDB CONTENT CHANGE DETECTOR ───────────────────────────────
// Compares Azure Blob Storage timestamps against a manifest file
// to detect new or modified content in books-text, books-extracted,
// and the local DB tables (spells, monsters, magic_items).
//
// Outputs a JSON report and exits:
//   exit 0 = changes detected (phases to run in stdout)
//   exit 1 = no changes
//
// Usage:
//   node scripts/check-ddb-changes.js
//
// The manifest is stored in Azure Blob Storage at:
//   hotd-website-content/embed-ddb-manifest.json
// ══════════════════════════════════════════════════════════════

const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { Pool } = require('pg');

const STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT || 'cloudgeekcusgaming01';
const MANIFEST_CONTAINER = 'hotd-website-content';
const MANIFEST_BLOB = 'embed-ddb-manifest.json';

function getBlobClient() {
  const credential = new DefaultAzureCredential();
  return new BlobServiceClient(
    `https://${STORAGE_ACCOUNT}.blob.core.windows.net`,
    credential
  );
}

async function downloadManifest() {
  try {
    const client = getBlobClient();
    const containerClient = client.getContainerClient(MANIFEST_CONTAINER);
    const blobClient = containerClient.getBlobClient(MANIFEST_BLOB);
    const response = await blobClient.download(0);
    const chunks = [];
    for await (const chunk of response.readableStreamBody) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'BlobNotFound') {
      console.log('  No existing manifest found. First run - all phases needed.');
      return { version: 1, lastRun: null, blobs: {}, dbChecksums: {} };
    }
    throw err;
  }
}

async function uploadManifest(manifest) {
  const client = getBlobClient();
  const containerClient = client.getContainerClient(MANIFEST_CONTAINER);
  // Ensure container exists
  await containerClient.createIfNotExists();
  const blobClient = containerClient.getBlockBlobClient(MANIFEST_BLOB);
  const content = JSON.stringify(manifest, null, 2);
  await blobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

async function listBlobsWithTimestamps(container, prefix) {
  const client = getBlobClient();
  const containerClient = client.getContainerClient(container);
  const results = {};
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    results[blob.name] = blob.properties.lastModified.toISOString();
  }
  return results;
}

async function getDbChecksum() {
  // Quick checksum: count + max updated_at from each table
  const pgPool = new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: false,
    max: 1,
  });

  const checksums = {};
  const tables = [
    { name: 'spells', key: 'spells' },
    { name: 'monsters', key: 'monsters' },
    { name: 'magic_items', key: 'magic_items' },
  ];

  for (const { name, key } of tables) {
    try {
      const { rows } = await pgPool.query(`SELECT count(*) as cnt FROM ${name}`);
      checksums[key] = `count:${rows[0].cnt}`;
    } catch (_) {
      checksums[key] = 'unavailable';
    }
  }

  await pgPool.end();
  return checksums;
}

async function main() {
  console.log('Checking for DDB content changes...\n');

  const manifest = await downloadManifest();
  const changedPhases = new Set();

  // ── Phase 1: books-extracted (structured JSON) ──────────────
  console.log('Phase 1: Checking books-extracted...');
  const extractedBlobs = await listBlobsWithTimestamps('books-extracted', '');
  const extractedPrev = manifest.blobs['books-extracted'] || {};
  let p1Changes = 0;
  for (const [name, ts] of Object.entries(extractedBlobs)) {
    if (!name.includes('/data/')) continue; // only data files
    if (extractedPrev[name] !== ts) p1Changes++;
  }
  // Check for new blobs not in manifest
  for (const name of Object.keys(extractedBlobs)) {
    if (!name.includes('/data/')) continue;
    if (!extractedPrev[name]) p1Changes++;
  }
  console.log(`  ${p1Changes} changed/new blobs`);
  if (p1Changes > 0) changedPhases.add('1');

  // ── Phase 2: DB tables ─────────────────────────────────────
  console.log('Phase 2: Checking DB tables...');
  const dbChecksums = await getDbChecksum();
  const dbPrev = manifest.dbChecksums || {};
  let p2Changes = 0;
  for (const [key, val] of Object.entries(dbChecksums)) {
    if (dbPrev[key] !== val) {
      console.log(`  ${key}: ${dbPrev[key] || 'none'} -> ${val}`);
      p2Changes++;
    }
  }
  if (p2Changes > 0) changedPhases.add('2');

  // ── Phase 3: books-text ─────────────────────────────────────
  console.log('Phase 3: Checking books-text...');
  const textBlobs = await listBlobsWithTimestamps('books-text', '');
  const textPrev = manifest.blobs['books-text'] || {};
  let p3Changes = 0;
  for (const [name, ts] of Object.entries(textBlobs)) {
    if (textPrev[name] !== ts) p3Changes++;
  }
  for (const name of Object.keys(textBlobs)) {
    if (!textPrev[name]) p3Changes++;
  }
  console.log(`  ${p3Changes} changed/new blobs`);
  if (p3Changes > 0) changedPhases.add('3');

  // ── Report ──────────────────────────────────────────────────
  console.log('');
  if (changedPhases.size === 0) {
    console.log('No changes detected. Skipping embedding.');
    process.exit(1);
  }

  const phases = Array.from(changedPhases).sort().join(',');
  console.log(`Changes detected in phases: ${phases}`);

  // Output for GitHub Actions
  const output = {
    changedPhases: Array.from(changedPhases).sort(),
    phase1Changes: p1Changes,
    phase2Changes: p2Changes,
    phase3Changes: p3Changes,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(output));

  // Write phases to stdout for workflow consumption
  process.exit(0);
}

// Also export uploadManifest and listBlobsWithTimestamps for use by the embed script
module.exports = { downloadManifest, uploadManifest, listBlobsWithTimestamps, getDbChecksum };

main().catch(err => {
  console.error('Change detection failed:', err.message);
  process.exit(1);
});
