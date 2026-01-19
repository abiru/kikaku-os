#!/bin/bash
#
# worktree-remove.sh - worktreeを削除
#
# 使用方法:
#   ./scripts/worktree-remove.sh <branch-name> [--delete-branch]
#
# 例:
#   ./scripts/worktree-remove.sh feat/new-feature              # worktreeのみ削除
#   ./scripts/worktree-remove.sh feat/new-feature --delete-branch  # ブランチも削除

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
PARENT_DIR="$(dirname "$REPO_ROOT")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [ -z "$1" ]; then
    echo "使用方法: $0 <branch-name> [--delete-branch]"
    echo ""
    echo "現在のworktree一覧:"
    git -C "$REPO_ROOT" worktree list
    exit 1
fi

BRANCH_NAME="$1"
DELETE_BRANCH="${2:-}"

SAFE_BRANCH_NAME="${BRANCH_NAME//\//-}"
WORKTREE_DIR="${PARENT_DIR}/${REPO_NAME}-${SAFE_BRANCH_NAME}"

cd "$REPO_ROOT"

# worktreeの存在確認
if ! git worktree list | grep -q "$WORKTREE_DIR"; then
    error "Worktree not found: $WORKTREE_DIR"
fi

info "Removing worktree: $WORKTREE_DIR"

# worktree削除
git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || {
    warn "Force removing worktree..."
    rm -rf "$WORKTREE_DIR"
    git worktree prune
}

success "Worktree removed"

# ブランチ削除オプション
if [ "$DELETE_BRANCH" = "--delete-branch" ]; then
    info "Deleting branch: $BRANCH_NAME"

    # マージ済みかチェック
    if git branch --merged main | grep -q "$BRANCH_NAME"; then
        git branch -d "$BRANCH_NAME" 2>/dev/null && success "Branch deleted" || warn "Branch not found locally"
    else
        warn "Branch '$BRANCH_NAME' is not merged to main"
        read -p "Force delete? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git branch -D "$BRANCH_NAME" 2>/dev/null && success "Branch force deleted" || warn "Branch not found locally"
        fi
    fi
fi

echo ""
success "Done!"
