#!/usr/bin/env bash
set -euo pipefail

# ---------- helpers ----------
die() {
  echo "ERROR: $*" >&2
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

clipboard_copy() {
  if have wl-copy; then
    wl-copy
    return 0
  fi
  if have xclip; then
    xclip -selection clipboard
    return 0
  fi
  if have xsel; then
    xsel --clipboard --input
    return 0
  fi
  if have pbcopy; then
    pbcopy
    return 0
  fi
  return 1
}

# ---------- main ----------
# optional: BASE commit (作業開始点) を指定すると、BASE..HEAD の差分も追加
BASE="${1:-}"

# git repo check
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not inside a git repository."

REPORT_FILE="${REPORT_FILE:-git-report.txt}"

{
  echo "=== Git Report ==="
  echo "Generated: $(date -Iseconds)"
  echo

  echo "## 0) Status / Branch / HEAD"
  echo '$ git status -sb'
  git status -sb || true
  echo
  echo '$ git rev-parse --abbrev-ref HEAD'
  git rev-parse --abbrev-ref HEAD || true
  echo
  echo '$ git log -1 --oneline'
  git log -1 --oneline || true
  echo

  echo "## 1) Changed files (unstaged)"
  echo '$ git diff --name-only'
  git diff --name-only || true
  echo

  echo "## 2) Changed files (staged)"
  echo '$ git diff --name-only --cached'
  git diff --name-only --cached || true
  echo

  echo "## 3) Changed files (HEAD -> working tree)"
  echo '$ git diff --name-only HEAD'
  git diff --name-only HEAD || true
  echo

  echo "## 4) Diff stats"
  echo '$ git diff --stat'
  git diff --stat || true
  echo
  echo '$ git diff --shortstat'
  git diff --shortstat || true
  echo
  echo '$ git diff --numstat'
  git diff --numstat || true
  echo

  echo "## 5) Unified diff (unstaged)"
  echo '$ git diff'
  git diff || true
  echo

  echo "## 6) Unified diff (staged)"
  echo '$ git diff --cached'
  git diff --cached || true
  echo

  echo "## 7) If committed: last commit details"
  echo '$ git show --name-status --stat'
  git show --name-status --stat -1 || true
  echo
  echo '$ git show'
  git show -1 || true
  echo

  echo "## 8) Recent commits"
  echo '$ git log --oneline -n 10'
  git log --oneline -n 10 || true
  echo
  echo '$ git log --name-status -n 5'
  git log --name-status -n 5 || true
  echo

  echo "## 9) Secrets safety checks"
  echo '$ git ls-files | grep -E "\.env$|\.dev\.vars$"'
  git ls-files | grep -E '\.env$|\.dev\.vars$' || true
  echo
  echo '$ git diff --name-only | grep -E "\.env$|\.dev\.vars$"'
  git diff --name-only | grep -E '\.env$|\.dev\.vars$' || true
  echo

  if [[ -n "$BASE" ]]; then
    echo "## 10) BASE..HEAD ($BASE..HEAD)"
    echo '$ git diff --name-only $BASE..HEAD'
    git diff --name-only "$BASE..HEAD" || true
    echo
    echo '$ git diff $BASE..HEAD'
    git diff "$BASE..HEAD" || true
    echo
    echo '$ git log --oneline $BASE..HEAD'
    git log --oneline "$BASE..HEAD" || true
    echo
  fi
} | tee "$REPORT_FILE" | clipboard_copy || {
  echo "NOTE: clipboard tool not found. Report saved to: $REPORT_FILE" >&2
  exit 0
}

echo "Copied to clipboard ✅  (also saved to $REPORT_FILE)"
