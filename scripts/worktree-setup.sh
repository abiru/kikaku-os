#!/bin/bash
#
# worktree-setup.sh - 並列作業用のgit worktreeをセットアップ
#
# 使用方法:
#   ./scripts/worktree-setup.sh <branch-name> [base-branch]
#
# 例:
#   ./scripts/worktree-setup.sh feat/new-feature          # mainから新規ブランチ作成
#   ./scripts/worktree-setup.sh feat/new-feature develop  # developから新規ブランチ作成
#   ./scripts/worktree-setup.sh existing-branch           # 既存ブランチをチェックアウト
#
# worktreeは ../kikaku-os-<branch-name> に作成されます

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
PARENT_DIR="$(dirname "$REPO_ROOT")"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 引数チェック
if [ -z "$1" ]; then
    echo "使用方法: $0 <branch-name> [base-branch]"
    echo ""
    echo "例:"
    echo "  $0 feat/new-feature          # mainから新規ブランチ作成"
    echo "  $0 feat/new-feature develop  # developから新規ブランチ作成"
    echo "  $0 existing-branch           # 既存ブランチをチェックアウト"
    exit 1
fi

BRANCH_NAME="$1"
BASE_BRANCH="${2:-main}"

# ブランチ名からディレクトリ名を生成 (/ を - に置換)
SAFE_BRANCH_NAME="${BRANCH_NAME//\//-}"
WORKTREE_DIR="${PARENT_DIR}/${REPO_NAME}-${SAFE_BRANCH_NAME}"

info "Setting up worktree for branch: $BRANCH_NAME"
info "Worktree directory: $WORKTREE_DIR"

# 既存のworktreeチェック
if [ -d "$WORKTREE_DIR" ]; then
    error "Directory already exists: $WORKTREE_DIR"
fi

# リモートを最新に
info "Fetching latest from remote..."
cd "$REPO_ROOT"
git fetch --all --prune

# ブランチの存在確認
BRANCH_EXISTS_LOCAL=$(git branch --list "$BRANCH_NAME")
BRANCH_EXISTS_REMOTE=$(git branch -r --list "origin/$BRANCH_NAME")

if [ -n "$BRANCH_EXISTS_LOCAL" ] || [ -n "$BRANCH_EXISTS_REMOTE" ]; then
    # 既存ブランチをチェックアウト
    info "Branch '$BRANCH_NAME' exists, checking out..."
    if [ -n "$BRANCH_EXISTS_REMOTE" ] && [ -z "$BRANCH_EXISTS_LOCAL" ]; then
        git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" "origin/$BRANCH_NAME"
    else
        git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
    fi
else
    # 新規ブランチを作成
    info "Creating new branch '$BRANCH_NAME' from '$BASE_BRANCH'..."
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_BRANCH"
fi

success "Worktree created at $WORKTREE_DIR"

# 共有設定ファイルのコピー/リンク
info "Setting up configuration files..."

# .dev.vars (秘密情報を含むのでコピー)
if [ -f "$REPO_ROOT/.dev.vars" ]; then
    cp "$REPO_ROOT/.dev.vars" "$WORKTREE_DIR/.dev.vars"
    success "Copied .dev.vars"
fi

# .wrangler (ローカルD1データベース - シンボリックリンクで共有するとロック問題が起きるのでコピー)
if [ -d "$REPO_ROOT/.wrangler" ]; then
    warn ".wrangler directory exists - each worktree will have its own local D1 database"
    warn "Run migrations in the new worktree: pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local"
fi

# node_modules は各worktreeで独立してインストール
info "Installing dependencies..."
cd "$WORKTREE_DIR"

if command -v pnpm &> /dev/null; then
    pnpm install
    success "Dependencies installed with pnpm"
else
    warn "pnpm not found, please install dependencies manually"
fi

# 完了メッセージ
echo ""
echo "=========================================="
success "Worktree setup complete!"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "  cd $WORKTREE_DIR"
echo ""
echo "開発サーバー起動:"
echo "  pnpm -C apps/api dev --port 8788      # APIを別ポートで起動"
echo "  pnpm -C apps/storefront dev --port 4322  # Storefrontを別ポートで起動"
echo ""
echo "D1マイグレーション (初回のみ):"
echo "  pnpm -C apps/api exec wrangler d1 migrations apply ledkikaku-os --local"
echo ""
echo "worktree削除時:"
echo "  git worktree remove $WORKTREE_DIR"
echo "  git branch -d $BRANCH_NAME  # ブランチも削除する場合"
echo ""
