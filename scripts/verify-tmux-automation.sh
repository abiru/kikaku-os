#!/bin/bash
# verify-tmux-automation.sh
# Automated verification script for tmux automation feature

set -e

echo "======================================"
echo "  tmux Automation Verification"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

info() {
  echo -e "[INFO] $1"
}

# Check 1: tmux environment
echo "1. Checking tmux environment..."
if [[ -n "$TMUX" ]]; then
  pass "Running inside tmux session"

  # Get current window info
  current_window=$(tmux display-message -p '#I:#W')
  info "Current window: $current_window"

  # List all windows
  info "All windows:"
  tmux list-windows | while IFS= read -r line; do
    echo "   $line"
  done
else
  warn "Not running inside tmux session"
  info "tmux automation is only available when running inside a tmux session"
fi
echo ""

# Check 2: API endpoint connectivity
echo "2. Testing API endpoint..."
if curl -s http://localhost:8787/dev/tmux-test > /dev/null 2>&1; then
  response=$(curl -s http://localhost:8787/dev/tmux-test)

  # Check if response contains expected fields
  if echo "$response" | grep -q "tmux-test" && echo "$response" | grep -q "timestamp"; then
    pass "API server responding correctly"
    info "Response: $response"
  else
    fail "API server responded but with unexpected format"
    info "Response: $response"
  fi
else
  fail "API server not responding on http://localhost:8787"
  info "Make sure the API dev server is running: pnpm -C apps/api dev"
fi
echo ""

# Check 3: Storefront connectivity
echo "3. Testing Storefront..."
status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4321 2>/dev/null || echo "000")

if [[ "$status_code" == "200" ]]; then
  pass "Storefront responding (HTTP $status_code)"
elif [[ "$status_code" == "000" ]]; then
  fail "Storefront not responding on http://localhost:4321"
  info "Make sure the Storefront dev server is running: pnpm -C apps/storefront dev"
else
  warn "Storefront returned HTTP $status_code (expected 200)"
  info "Server may still be starting up"
fi
echo ""

# Check 4: Port availability (if servers not running)
echo "4. Checking port availability..."
api_port_used=$(lsof -i :8787 2>/dev/null | wc -l)
storefront_port_used=$(lsof -i :4321 2>/dev/null | wc -l)

if [[ $api_port_used -gt 1 ]]; then
  pass "Port 8787 (API) is in use"
else
  warn "Port 8787 (API) is not in use - API server not running?"
fi

if [[ $storefront_port_used -gt 1 ]]; then
  pass "Port 4321 (Storefront) is in use"
else
  warn "Port 4321 (Storefront) is not in use - Storefront server not running?"
fi
echo ""

# Check 5: Worktree structure
echo "5. Checking worktree structure..."
current_dir=$(basename "$(pwd)")

if [[ "$current_dir" =~ ^kikaku-os-[0-9]+$ ]]; then
  issue_number=$(echo "$current_dir" | grep -oP 'kikaku-os-\K\d+')
  pass "Currently in worktree: $current_dir (Issue #$issue_number)"

  # Check if corresponding tmux window exists
  if [[ -n "$TMUX" ]]; then
    window_exists=$(tmux list-windows | grep -c "issue-$issue_number" || echo "0")
    if [[ $window_exists -gt 0 ]]; then
      pass "tmux window 'issue-$issue_number' exists"
    else
      warn "tmux window 'issue-$issue_number' not found"
      info "Expected window name: issue-$issue_number"
    fi
  fi
elif [[ "$current_dir" == "kikaku-os" ]]; then
  info "Currently in main worktree"
else
  warn "Not in a kikaku-os worktree directory"
  info "Current directory: $(pwd)"
fi
echo ""

# Summary
echo "======================================"
echo "  Verification Complete"
echo "======================================"
echo ""
echo "If any checks failed, refer to docs/TMUX_AUTOMATION.md for troubleshooting."
echo ""
