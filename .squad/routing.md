# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Server code, routes, pages | Mercer | Node.js server, API endpoints, pages, components |
| Database, schema, queries | Mercer | PostgreSQL schema, migrations, pool config |
| AI/RAG, OpenAI integration | Mercer | Embeddings, chat completions, RAG pipeline |
| Campaign data management | Mercer | npcs.json, session summaries, history, DM tools |
| Authentication, secrets | Mercer | Auth routes, Azure Key Vault, OAuth |
| Docker builds, containers | Helm | Dockerfile changes, image builds, container testing |
| Helm charts, K8s manifests | Helm | Chart templates, values, deployment config |
| MicroK8s deployment | Helm | helm upgrade, ingress, PVC, namespace |
| FoundryVTT module code | Foundry | Hooks, settings, module.json, ES module scripts |
| FoundryVTT integration | Foundry | Website-to-Foundry sync, module features |
| NPC portraits, AI art | Artisan | Portrait generation, style consistency, image review |
| Campaign content writing | Artisan | NPC descriptions, session summaries, lore writing |
| Code review, architecture | Mercer | Review PRs, check quality, architectural decisions |
| Scope & priorities | Mercer | What to build next, trade-offs, decisions |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
