# FoundryVTT v13 Module Development

**Confidence:** medium

## Pattern

Conventions for developing the FoundryVTT v13 integration module at `foundry/hotd-module/`.

### API Rules

- Target FoundryVTT v13 API
- Use `Hooks.once('init')` and `Hooks.once('ready')` for lifecycle
- Module ID: `hotd-website-integration`
- Required dependencies: `lib-wrapper`, `socketlib`

### Code Style

- ES module syntax (`import`/`export`), NOT CommonJS
- Use this module ID for `game.settings.register()` and `game.modules.get()`
- Register all settings in the `init` hook, access them in `ready`

### Debug Logging

```javascript
if (game.modules.get('_dev-mode')?.api?.getPackageDebugValue(MODULE_ID)) {
  console.log('Debug message');
}
```

## Learned from

- FoundryVTT module setup and integration work
