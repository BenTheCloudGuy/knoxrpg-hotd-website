# KnoxRPG HotD — Copilot Instructions

## Project Context
This is a Node.js campaign website for the "Halls of the Damned" D&D campaign, deployed on self-hosted MicroK8s via Helm. It also includes a FoundryVTT v13 integration module under `foundry/hotd-module/`.

## Code Style
- Pure Node.js (no frameworks like Express) — the server uses raw `http.createServer`
- CommonJS `require()` for the website (`src/`), ES modules for FoundryVTT (`foundry/`)
- 2-space indentation, single quotes in JS
- No TypeScript

## Architecture
- `src/` — Website server (Node.js, PostgreSQL, Azure Key Vault, OpenAI)
- `foundry/hotd-module/` — FoundryVTT v13 module (ES modules, Foundry API)
- `helm/` — Helm chart for MicroK8s deployment
- `docker/` — Container image build
- `.devcontainer/` — Dev environment with FoundryVTT auto-setup

## Build & Test
- Website: `cd src && npm install && node server.js`
- Dev mode: `cd src && npm run dev` (port 3001)
- Docker: `docker build -f docker/Dockerfile .`
- Helm: `helm upgrade --install hotd-website helm/hotd-website/`

## Conventions
- Campaign data lives in `src/hotd-campaign/data/` (JSON + Markdown)
- Environment secrets come from Azure Key Vault in prod, env vars in dev
- Always check for existing patterns in the codebase before introducing new ones
- When modifying Helm templates, validate with `helm template`
- FoundryVTT module code must target Foundry v13 API
