# Git Commit & Release Flow

**Confidence:** high

## Pattern

Commit changes with conventional commit messages and maintain CHANGELOG.md.

### Steps

1. Run `git diff --stat` and `git diff --cached --stat` to see what changed
2. Generate a conventional commit message (`feat`/`fix`/`chore`/`docs`) summarizing the changes
3. Stage all changes with `git add -A`
4. Commit with the generated message
5. Show the commit, then ask if the user wants to push
6. Apply the commit message to CHANGELOG.md, following the existing format
7. Version bump rules:
   - `feat` — minor version bump (e.g., 2.1.0 → 2.2.0)
   - `fix` — patch version bump (e.g., 2.1.0 → 2.1.1)
   - `chore` / `docs` — no version bump

### Critical rule

All changes require a version bump in CHANGELOG.md for the deployment process to update the server with the correct image version.

## Learned from

- Release workflow for v2.0.0 and v2.1.0
