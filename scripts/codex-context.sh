#!/usr/bin/env bash
set -euo pipefail

have() { command -v "$1" >/dev/null 2>&1; }
copy() {
  if have wl-copy; then
    wl-copy
    return
  fi
  if have xclip; then
    xclip -selection clipboard
    return
  fi
  if have xsel; then
    xsel --clipboard --input
    return
  fi
  if have pbcopy; then
    pbcopy
    return
  fi
  cat >/dev/null
}

BASE="${1:-}"
OUT="${OUT:-codex-input.txt}"

{
  echo "=== Codex Context (short) ==="
  echo "Generated: $(date -Iseconds)"
  echo
  echo "## Repo"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head:   $(git rev-parse --short HEAD)"
  echo
  echo "## Status"
  git status -sb
  echo
  echo "## Changed files (HEAD..WT)"
  git diff --name-only HEAD || true
  echo
  echo "## Diff stats (HEAD..WT)"
  git diff --shortstat HEAD || true
  echo
  echo "## Staged stats"
  git diff --shortstat --cached || true
  echo
  echo "## Recent commits"
  git log --oneline -n 10 || true
  echo
  echo "## Tests (recent lines)"
  # よくある場所だけ薄く拾う（無ければ無視）
  (rg -n "PASS|FAIL|Tests|test" -S . 2>/dev/null | head -n 80) || true
  echo
  echo "## Secrets check (tracked)"
  git ls-files | grep -E '\.env$|\.dev\.vars$' || true
  echo

  if [[ -n "$BASE" ]]; then
    echo "## BASE..HEAD ($BASE..HEAD)"
    git diff --name-only "$BASE..HEAD" || true
    echo
    git diff --shortstat "$BASE..HEAD" || true
    echo
    git log --oneline "$BASE..HEAD" || true
    echo
  fi
} | tee "$OUT" | copy

echo "Copied ✅  (also saved to $OUT)"
