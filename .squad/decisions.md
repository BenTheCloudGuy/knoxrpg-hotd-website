# Squad Decisions

## Active Decisions

### Code Style

#### JavaScript conventions
- Pure Node.js with raw `http.createServer` — no Express or other frameworks
- CommonJS `require()` for all website code in `src/`
- ES module syntax for FoundryVTT code in `foundry/`
- 2-space indentation, single quotes in JS
- No TypeScript — plain JavaScript only

#### Don't guess or assume
Don't guess, make assumptions, or make things up. If you want to make a suggested change or assumption, or are not sure — ask the user.

### Architecture

#### Campaign data location
Campaign **lore markdown** now lives in the DB-backed Campaign Notebook (`hotd_notebook_pages`) under the `Campaign Data/` root (top-level pages + `Groups/` + `Realms/`). It was migrated out of `src/hotd-campaign/data/*.md`. The public `/realms`, `/groups`, `/house-rules`, `/overcasting`, `/circle-magic`, and `/history` pages render from the notebook (with `## DM Notes` stripped for non-admins). Notebook pages carry a `status` (`draft`|`published`); only `published` pages are embedded into RAG. The legacy repo files under `src/hotd-campaign/data/` still exist but are deprecated and scheduled for removal. NPCs are still seeded from `npcs.json` (synced to `hotd_npcs` via `sync-npcs.js` / `sync-npcs.yml`); `portrait_url` values now use `/hotd-content/images/*`.

#### Environment secrets
Environment secrets come from Azure Key Vault in production, environment variables in development. Never hardcode secrets.

#### Existing patterns first
Always check for existing patterns in the codebase before introducing new ones.

### Deployment

#### Version bump required
All changes require a version bump in CHANGELOG.md for the deployment process. The CHANGELOG version drives the container image tag.

#### Helm validation
When modifying Helm templates, always validate with `helm template hotd-website helm/hotd-website/` before committing.

### FoundryVTT

#### Target Foundry v13
FoundryVTT module code must target Foundry v13 API. Always verify API compatibility.

### Content

#### Writing style
No em-dashes, no flowery language. Direct and grounded prose. Show reasoning in Q&A answers.

#### NPC portraits
Keep visual style consistent across all NPC portraits using the established dark fantasy style prefix.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
