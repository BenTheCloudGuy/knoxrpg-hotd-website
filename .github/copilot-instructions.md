# KnoxRPG HotD — Copilot Instructions

## ⚠️ MANDATORY: Always Route Through Squad

**Every user request in this workspace MUST be routed through the Squad agent framework, except for the narrow Direct Mode cases listed in step 4 below.**
Do not answer directly, do not edit files, and do not run commands without first identifying the owning agent.

1. Load the Squad coordinator at [.github/agents/squad.agent.md](.github/agents/squad.agent.md) and follow it for every turn. If the Squad coordinator file or [.squad/routing.md](.squad/routing.md) cannot be loaded, inform the user that the Squad framework is unavailable and ask whether to proceed with best-effort routing using the inline routing reminders below.
2. Use [.squad/routing.md](.squad/routing.md) and the inline routing quick-reference to pick the correct agent(s).
3. Spawn the matching agent(s) via the Squad's `task` / subagent mechanism. If the request spans multiple domains, fan out in parallel.
4. Direct Mode (no spawn) is allowed ONLY for: status checks, "where are we?", "who's on the team?", and trivial factual questions answerable from context already in this prompt. Any request that requires file edits, terminal commands, or new information must be routed through Squad.
5. Even for Direct Mode, acknowledge which agent *would* own the work if action were needed.

**Routing reminders:**
- Code, infrastructure, DB, RAG, auth, Docker, Helm, CI/CD, code review → **Artificer**
- Narrative prose, room/trap/monster/scene/treasure descriptions, story continuity, canon checks, in-world lore edits → **Mercer**
- FoundryVTT module code (`foundry/hotd-module/**`) → **Wizard**
- Art generation, session prep, session summaries → **Bard**
- D&D 5e stat blocks → **Ranger**
- Memory, decisions, session logs → **Cleric** (silent)
- Work queue monitoring → **Paladin**

If the request is ambiguous, name the agent you picked and proceed. Never ignore the Squad framework.

## ⚠️ MANDATORY: Never Push Without Explicit Permission

**No agent, including Squad and the Coordinator, may run `git push` (or any equivalent that publishes commits to a remote) unless the user has explicitly said "push" in the current turn.**

- Default workflow for ANY code, infra, doc, Helm, or chart change: update `CHANGELOG.md` → `git add -A` → `git commit` → **STOP**.
- After committing, report the commit hash and what would deploy if pushed, then wait. The user will either push themselves or tell you to push.
- Phrases that count as explicit permission: "push", "push it", "ship it", "deploy", "go ahead and push", "push to main". Anything else is NOT permission, including "looks good", "thanks", "great".
- A user message earlier in the same conversation does NOT carry forward; permission applies to the current request only.
- `git push --force`, `git push --tags`, deleting remote branches, and amending already-pushed commits ALWAYS require a separate, explicit confirmation even after "push" is granted.
- This rule overrides any skill, template, or charter that says "commit and push". Strip the push step.

## ⚠️ MANDATORY: Every CHANGELOG Entry Must Be Versioned

**Never write under `## [Unreleased]`. Always add a new `## [X.Y.Z] - YYYY-MM-DD` section at the top.**

The deploy workflow extracts the image tag from the first `## [...]` heading in `CHANGELOG.md`. An `[Unreleased]` tag produces a byte-identical Deployment spec across every push, which K8s treats as no change → no rolling restart → the new image is built and pushed to the registry but the running pod keeps serving the old code. The version-extract step in `.github/workflows/deploy.yml` now hard-fails the build if the top heading is `Unreleased` or missing.

- Pick the semver bump from the change set: bug fix only → patch (`3.10.1`); new user-visible feature → minor (`3.11.0`); breaking change → major (`4.0.0`).
- Insert the new section directly under the policy note at the top of `CHANGELOG.md`. Group entries by `### Added` / `### Changed` / `### Fixed` / `### Removed` / `### Notes`.
- If a previous turn already added a versioned section that hasn't been pushed yet, append your new entries to that section (don't create a second one for the same version).
- After committing, report the version number alongside the commit hash so the user knows what tag will roll out on push.

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


## Configure Remote Server

Treat all values in this section as secrets. Never include the IP address, username, hostname, or SSH key path in generated documentation, commit messages, PR descriptions, logs, or user-facing output unless the user explicitly asks for them.

Azure VM: knoxrpgappsrv01
Azure IP: 20.29.42.149
SSHConfig Entry: 
  host hotd
    HostName 20.29.42.149
    Port 22
    User gamemaster
    IdentityFile ~/.ssh/my_cloudgeeklabs
AzureDNS Entry: hotd-test.knoxrpg.com → 20.29.42.149