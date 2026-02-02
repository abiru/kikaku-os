#!/usr/bin/env bash
# Feature development workflow automation
# Usage: feature "description" or feature <issue-number>

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
error() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    local current_dir=$(pwd)
    local current_branch=$(git branch --show-current 2>/dev/null || echo "")
    local main_worktree=$(git worktree list 2>/dev/null | grep "\[main\]" | awk '{print $1}')

    # Check if in git repo
    if ! git rev-parse --git-dir &>/dev/null; then
        error "Not in a git repository"
    fi

    # Check if in main worktree
    if [[ "$current_dir" != "$main_worktree" ]]; then
        error "Must run from main worktree\n  Current: $current_dir\n  Required: $main_worktree\n\n  Open a new terminal tab and run:\n  cd $main_worktree"
    fi

    # Check if on main branch
    if [[ "$current_branch" != "main" ]]; then
        error "Must be on main branch\n  Current: $current_branch\n\n  Fix with:\n  git checkout main\n  git pull origin main"
    fi

    success "Prerequisites OK"
}

# Parse arguments
parse_args() {
    local args="$1"

    # Check if numeric (issue number)
    if [[ "$args" =~ ^[0-9]+$ ]]; then
        MODE="existing-issue"
        ISSUE_NUMBER="$args"
    elif [[ "$args" =~ ^--resume[[:space:]]+([0-9]+)$ ]]; then
        MODE="existing-issue"
        ISSUE_NUMBER="${BASH_REMATCH[1]}"
    else
        MODE="new-feature"
        DESCRIPTION="$args"
    fi
}

# Create worktree
create_worktree() {
    local issue_num="$1"
    local slug="$2"
    local worktree_path="$HOME/Code/kikaku-os-$issue_num"
    local branch_name="feat/issue-$issue_num-$slug"

    # Check if worktree already exists
    if [[ -d "$worktree_path" ]]; then
        warning "Worktree already exists: $worktree_path"
        return 0
    fi

    info "Creating worktree: $worktree_path"

    git fetch origin
    git worktree add "$worktree_path" -b "$branch_name"

    success "Worktree created: $worktree_path"

    # Install dependencies
    info "Installing dependencies..."
    (cd "$worktree_path" && pnpm install)

    success "Dependencies installed"
}

# Create tmux window with dev servers
create_tmux_window() {
    local issue_num="$1"
    local worktree_path="$HOME/Code/kikaku-os-$issue_num"
    local window_name="issue-$issue_num"

    # Calculate ports (increment by 1 for each issue)
    local api_port=$((8787 + issue_num % 100))
    local store_port=$((4321 + issue_num % 100))

    # Ensure ports are different from main (8787, 4321)
    if [[ $api_port -eq 8787 ]]; then
        api_port=8788
    fi
    if [[ $store_port -eq 4321 ]]; then
        store_port=4322
    fi

    if [[ -z "$TMUX" ]]; then
        warning "Not in tmux session. Manual setup required:"
        echo ""
        echo "  Open a new terminal tab and run:"
        echo "  cd $worktree_path"
        echo "  pnpm dev:api --port $api_port"
        echo ""
        echo "  In another split/tab:"
        echo "  pnpm dev:store --port $store_port"
        return 0
    fi

    info "Creating tmux window: $window_name"

    # Create new window
    tmux new-window -c "$worktree_path" -n "$window_name"

    # Start API server in left pane
    tmux send-keys -t "$window_name" "pnpm dev:api --port $api_port" Enter

    # Split horizontally and start Storefront server
    tmux split-window -h -c "$worktree_path" -t "$window_name"
    tmux send-keys -t "$window_name" "pnpm dev:store --port $store_port" Enter

    success "tmux window '$window_name' created"
    info "API running on port $api_port"
    info "Storefront running on port $store_port"
    info "Switch to window with: Ctrl+b w"
}

# Main workflow
main() {
    if [[ -z "$1" ]]; then
        echo "Usage: feature <issue-number> | feature \"description\""
        echo ""
        echo "Examples:"
        echo "  feature 142                    # Work on existing issue"
        echo "  feature \"add product filter\"  # Create new feature"
        exit 1
    fi

    check_prerequisites
    parse_args "$1"

    if [[ "$MODE" == "existing-issue" ]]; then
        info "Mode: Existing Issue #$ISSUE_NUMBER"

        # Check if issue exists
        if ! gh issue view "$ISSUE_NUMBER" &>/dev/null; then
            error "Issue #$ISSUE_NUMBER not found"
        fi

        # Get issue title for slug
        local issue_title=$(gh issue view "$ISSUE_NUMBER" --json title -q .title)
        local slug=$(echo "$issue_title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | cut -c1-30)

        create_worktree "$ISSUE_NUMBER" "$slug"
        create_tmux_window "$ISSUE_NUMBER"

        success "Workflow complete for Issue #$ISSUE_NUMBER"

    else
        info "Mode: New Feature"
        error "New feature mode not yet implemented. Use Claude's /feature command for full workflow."
    fi
}

main "$@"
