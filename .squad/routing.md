# Work Routing

How to decide who handles what.

## Routing Table

| Work Type                  | Route To  | Examples                                             |
| -------------------------- | --------- | ---------------------------------------------------- |
| Server code, routes, pages | Artificer | Node.js server, API endpoints, pages, components     |
| Database, schema, queries  | Artificer | PostgreSQL schema, migrations, pool config           |
| AI/RAG, OpenAI integration | Artificer | Embeddings, chat completions, RAG pipeline           |
| Campaign data infrastructure | Artificer | Schema, load paths, validators for `hotd-campaign/data/` |
| Authentication, secrets    | Artificer | Auth routes, Azure Key Vault, OAuth                  |
| Code review, architecture  | Artificer | Review PRs, check quality, architectural decisions   |
| Codebase strategy & refactor | Artificer | Read code, propose fixes, map dependencies         |
| Scope & priorities (technical) | Artificer | What to build next, trade-offs, decisions        |
| Docker builds, containers  | Artificer | Dockerfile changes, image builds, container testing  |
| Helm charts, K8s manifests | Artificer | Chart templates, values, deployment config           |
| MicroK8s deployment        | Artificer | helm upgrade, ingress, PVC, namespace                |
| CI/CD workflows            | Artificer | `.github/workflows/`, deploy automation              |
| Room / location descriptions | Mercer  | Keyed-area read-aloud, features, DM notes            |
| Trap write-ups             | Mercer    | Trigger, effect, DCs, countermeasures                |
| Monster / NPC scenes       | Mercer    | Appearance, behavior narration, tactical notes       |
| Treasure descriptions      | Mercer    | Sensory + mechanical + lore hook                     |
| Scene framing & transitions| Mercer    | In-world prose between encounters                    |
| Attack / combat narration  | Mercer    | Grounded action prose for the table                  |
| Story continuity, canon check | Mercer | Fact-check against NPCs, sessions, lore              |
| Campaign data content edits | Mercer   | `realms/*.md` lore, notebook entries, `npcs.json` text |
| FoundryVTT module code     | Wizard    | Hooks, settings, module.json, ES module scripts      |
| FoundryVTT integration     | Wizard    | Website-to-Foundry sync, module features             |
| NPC portraits, AI art      | Bard      | Portrait generation, style consistency, image review |
| Campaign scene & item art  | Bard      | Scenes, locations, magic items, handouts             |
| Session files & summaries  | Bard      | `sessions/sessionNN.md`, `hotd_sessions.summary` row |
| Post-session player recap  | Bard      | Player-safe narrative recap, no DM spoilers          |
| D&D 5e stat blocks         | Ranger    | Monster design, spell selection, 2024 MM format      |
| Session logging            | Cleric    | Automatic — never needs routing                      |

## Issue Routing

| Label          | Action                                               | Who          |
| -------------- | ---------------------------------------------------- | ------------ |
| `squad`        | Triage: analyze issue, assign `squad:{member}` label | Lead         |
| `squad:{name}` | Pick up issue and complete the work                  | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Cleric always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
