---
description: "Commit current changes with a conventional commit message, then offer to push"
agent: "agent"
---
1. Run `git diff --stat` and `git diff --cached --stat` to see what changed
2. Generate a conventional commit message (feat/fix/chore/docs) summarizing the changes
3. Stage all changes with `git add -A`
4. Commit with the generated message
5. Show the commit, then ask if I want to push
6. Always apply the commit message to CHANGELOG.md if applicable, following the format in the existing changelog)
7. All changes require a version bump in CHANGELOG.md for the deployment process to update the server with correct image version. If the commit message is a feat or fix, it should trigger a minor or patch version bump respectively. If the commit message is a chore or docs, it should not trigger a version bump.
