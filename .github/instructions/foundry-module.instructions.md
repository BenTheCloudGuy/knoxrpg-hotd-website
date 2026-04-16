---
description: "Use when working on FoundryVTT module code, Foundry hooks, settings, or the module.json manifest"
applyTo: "foundry/**"
---
# FoundryVTT Module Development

- Target FoundryVTT v13 API — use `Hooks.once('init')` and `Hooks.once('ready')`
- Use ES module syntax (`import`/`export`), not CommonJS
- Module ID is `hotd-website-integration` — use this for `game.settings.register()` and `game.modules.get()`
- Required dependencies: `lib-wrapper`, `socketlib`
- Register all settings in the `init` hook, access them in `ready`
- Use `_dev-mode` flags for debug logging: `if (game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID))`
