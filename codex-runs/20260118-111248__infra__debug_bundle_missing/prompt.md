You are a strict engineer.

Goal:
Update scripts/codex-run.sh so it automatically commits BOTH:

1. the “work changes” (code changes outside codex-runs) based on the TITLE area, and
2. the codex run directory under codex-runs/.

Context:

- TITLE format is "<area>: <summary>" where area is one of: storefront|api|admin|infra|docs|tests
- Current behavior commits only codex-runs/, and sometimes optional storefront-only via --commit-storefront.
- We want to stop using --commit-storefront and instead commit by area mapping.

Task (modify ONLY scripts/codex-run.sh):

1. Add flags:
   - --no-work-commit : disables work commit (default is enabled)
   - --work-scope "<paths>" : comma-separated paths to stage for the work commit (overrides area mapping)
2. Implement area->paths mapping (default):
   - storefront -> apps/storefront
   - api -> apps/api
   - admin -> apps/admin
   - infra -> infra
   - docs -> docs
   - tests -> apps
3. Work commit message: exactly "$TITLE"
4. Codex run commit message: "codex-run: $TITLE"
5. Stage ONLY the scoped paths for work commit (do not accidentally commit prompts/ or scripts/ unless explicitly scoped)
6. Keep existing bundle/truncation/clipboard features unchanged.
7. Output:
   - unified diff patch
   - 5 verification commands showing:
     a) help output contains the new flags
     b) running with --no-work-commit only commits codex-runs
     c) running with default commits work changes under the mapped scope
     d) running with --work-scope commits only those paths
     e) it does nothing if there are no staged changes

Constraints:

- Keep output compact.
- No refactors beyond what is necessary.
- No new files.
