#!/usr/bin/env node
/**
 * configure-world.mjs
 * Post-launch world configuration for the hotd-dev world.
 * Runs AFTER FoundryVTT is stopped so LevelDB is unlocked.
 *
 * Tasks:
 *  1. Enable required modules (from foundry/config.yml)
 *  2. Create a GameMaster user
 *  3. Apply default settings from foundry/config.yml
 */

import { ClassicLevel } from 'classic-level';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.join(process.env.HOME, 'foundrydata');
const WORLD_ID = 'hotd-dev';
const WORLD_DIR = path.join(DATA_DIR, 'Data', 'worlds', WORLD_ID);
const WORLD_DATA = path.join(WORLD_DIR, 'data');

const CORE_VERSION = '13';
const SYSTEM_ID = 'dnd5e';

// All modules that should be enabled in the dev world
const MODULES_TO_ENABLE = [
  'hotd-website-integration',
  '_dev-mode',
  'lib-wrapper',
  'socketlib',
  'tidy5e-sheet',
  'monk-active-tiles',
  'monks-enhanced-journal',
  'smalltime',
  'midi-qol',
  'dfreds-convenient-effects',
];

// Default settings to apply (from foundry/config.yml)
const DEFAULT_SETTINGS = {
  'core.animateRollTable': false,
  'core.chatBubblesPan': false,
  'core.noCanvas': false,
  '_dev-mode.enableAutoHotReload': true,
  '_dev-mode.enablePackageDebugging': true,
};

function randomId(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) id += chars[bytes[i] % chars.length];
  return id;
}

const NOW = Date.now();

function makeStats(extra = {}) {
  return {
    coreVersion: CORE_VERSION,
    systemId: SYSTEM_ID,
    systemVersion: null,
    createdTime: NOW,
    modifiedTime: NOW,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null,
    exportSource: null,
    ...extra,
  };
}

// ── 1. Enable modules ───────────────────────────────────────────────────────
async function enableModules(settingsDb) {
  let configId = null;
  let existing = {};

  for await (const [key, value] of settingsDb.iterator()) {
    if (value.key === 'core.moduleConfiguration') {
      configId = value._id;
      try { existing = JSON.parse(value.value); } catch {
        if (typeof value.value === 'object') existing = value.value;
      }
      break;
    }
  }

  let changed = false;
  for (const modId of MODULES_TO_ENABLE) {
    if (!existing[modId]) {
      existing[modId] = true;
      changed = true;
    }
  }

  if (!changed) {
    console.log('  ✔  All modules already enabled');
    return;
  }

  const id = configId || randomId();
  const doc = {
    key: 'core.moduleConfiguration',
    value: JSON.stringify(existing),
    _id: id,
    user: null,
    _stats: makeStats(),
  };
  await settingsDb.put(`!settings!${id}`, doc);
  console.log(`  ✔  Enabled modules: ${MODULES_TO_ENABLE.join(', ')}`);
}

// ── 2. Create GameMaster user ───────────────────────────────────────────────
function createEmptyPassword() {
  const salt = crypto.randomBytes(32).toString('hex').slice(0, 64);
  const hash = crypto.pbkdf2Sync('', salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

async function createUsers(usersDb) {
  for await (const [, value] of usersDb.iterator()) {
    if (value.name === 'GameMaster') {
      console.log('  ✔  GameMaster user already exists');
      return;
    }
  }

  const id = randomId();
  const { hash, salt } = createEmptyPassword();
  const user = {
    name: 'GameMaster',
    role: 4,  // GAMEMASTER
    _id: id,
    password: hash,
    passwordSalt: salt,
    avatar: null,
    character: null,
    color: '#ff6400',
    pronouns: '',
    hotbar: {},
    permissions: {},
    flags: {},
    _stats: makeStats(),
  };
  await usersDb.put(`!users!${id}`, user);
  console.log('  ✔  Created GameMaster user (no password)');
}

// ── 3. Apply default settings ───────────────────────────────────────────────
async function applySettings(settingsDb) {
  const existingKeys = new Set();
  for await (const [, value] of settingsDb.iterator()) {
    existingKeys.add(value.key);
  }

  let setCount = 0;
  for (const [settingKey, settingValue] of Object.entries(DEFAULT_SETTINGS)) {
    if (existingKeys.has(settingKey)) continue;

    const id = randomId();
    const doc = {
      key: settingKey,
      value: settingValue,
      _id: id,
      user: null,
      _stats: makeStats(),
    };
    await settingsDb.put(`!settings!${id}`, doc);
    setCount++;
  }

  console.log(`  ✔  Set ${setCount} default settings (${Object.keys(DEFAULT_SETTINGS).length - setCount} already configured)`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(WORLD_DATA)) {
    console.log('  ⚠  World data directory not found — skipping configuration');
    return;
  }

  console.log(`── Configuring ${WORLD_ID} world ──`);

  const settingsDb = new ClassicLevel(path.join(WORLD_DATA, 'settings'), { valueEncoding: 'json' });
  const usersDb = new ClassicLevel(path.join(WORLD_DATA, 'users'), { valueEncoding: 'json' });

  try {
    await enableModules(settingsDb);
    await createUsers(usersDb);
    await applySettings(settingsDb);
  } finally {
    await settingsDb.close();
    await usersDb.close();
  }

  console.log('── World configuration complete ──');
}

main().catch(err => {
  console.error('✖  configure-world.mjs failed:', err);
  process.exit(1);
});
