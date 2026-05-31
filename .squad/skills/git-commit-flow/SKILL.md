# Git Commit & Release Flow

**Confidence:** high

## Pattern

Commit changes with conventional commit messages and maintain CHANGELOG.md. **Never push without explicit user permission.**

### Steps

1. Run `git diff --stat` and `git diff --cached --stat` to see what changed
2. Update `CHANGELOG.md` with a new version entry (version bump rules below) BEFORE committing — the deploy workflow extracts the version from the first `## [x.x.x]` line
3. Generate a conventional commit message (`feat`/`fix`/`chore`/`docs`) summarizing the changes
4. Stage all changes with `git add -A`
5. Commit with the generated message
6. **STOP.** Report the commit hash and what would deploy if pushed. Do **NOT** run `git push`. Wait for the user to push themselves or to tell you to push in the current turn.
7. Version bump rules:
   - `feat` — minor version bump (e.g., 2.1.0 → 2.2.0)
   - `fix` — patch version bump (e.g., 2.1.0 → 2.1.1)
   - `chore` / `docs` — no version bump

### Critical rules

- **CHANGELOG.md must be updated before every commit that bumps the version.** The deploy workflow extracts the version from the first `## [x.x.x]` line; skipping this step means no new image is built.
- **Never run `git push` without explicit permission in the current turn.** Phrases that count: "push", "push it", "ship it", "deploy", "push to main". "Looks good" / "thanks" / "great" do NOT count. Permission from earlier in the conversation does NOT carry forward.
- **Force-pushes, tag pushes, and remote-branch deletes always require a separate explicit confirmation** even after "push" is granted.
- This rule overrides any other skill, charter, or template that says "commit and push". Strip the push step.

## Learned from

- Release workflow for v2.0.0 and v2.1.0
- 3.9.0 operator-gated release rule (May 2026): user wants to inspect each release before it deploys.
