#!/bin/bash
#
# worktree-list.sh - 現在のworktree一覧を表示
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "Git Worktrees:"
echo "=============="
git worktree list

echo ""
echo "Tips:"
echo "  新規worktree作成: ./scripts/worktree-setup.sh <branch-name>"
echo "  worktree削除:     git worktree remove <path>"
echo "  不要なworktree整理: git worktree prune"
