/**
 * Halls of the Damned — Website Integration Module
 * Main entry point for FoundryVTT v13
 */

const MODULE_ID = 'hotd-website-integration';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);

  // Register module settings
  game.settings.register(MODULE_ID, 'websiteUrl', {
    name: 'HotD Website URL',
    hint: 'Base URL of the Halls of the Damned campaign website',
    scope: 'world',
    config: true,
    type: String,
    default: 'http://localhost:3000',
  });

  game.settings.register(MODULE_ID, 'syncEnabled', {
    name: 'Enable Sync',
    hint: 'Automatically sync session data between FoundryVTT and the website',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Ready`);

  if (!game.modules.get(MODULE_ID)?.active) return;

  const websiteUrl = game.settings.get(MODULE_ID, 'websiteUrl');
  console.log(`${MODULE_ID} | Website URL: ${websiteUrl}`);
});
