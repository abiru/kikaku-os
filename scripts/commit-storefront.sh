#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/commit-storefront.sh
#   ./scripts/commit-storefront.sh --no-build
#
# Behavior:
# - apps/storefront だけ add/commit
# - commit messageは codex exec で自動生成（短く事実ベース）

DO_BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
  --no-build)
    DO_BUILD=0
    shift
    ;;
  *)
    echo "Unknown arg: $1" >&2
    exit 1
    ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# build guard
if [[ "$DO_BUILD" -eq 1 ]]; then
  pnpm -C apps/storefront build
fi

# message via codex exec (non-interactive)
CONTEXT="$(
  cat <<EOF
changed files:
$(git status --porcelain apps/storefront)

diffstat:
$(git diff --stat HEAD -- apps/storefront | sed -n '1,80p')
EOF
)"

PROMPT=$'Create a 1-line git commit message for these storefront changes.\n\
Rules:\n\
- Format: "<type>: <summary>" where type is feat|fix|refactor|chore|test|docs\n\
- 50-72 chars, factual, no hype\n\
- Output ONLY the message line\n\n'"\
$CONTEXT"

MSG="$(codex exec --color never "$PROMPT" | head -n 1 | tr -d '\r')"
[[ -n "$MSG" ]] || MSG="storefront: update UI and pages"

echo "Commit message: $MSG"

git add -A apps/storefront
git commit -m "$MSG"
