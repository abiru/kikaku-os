#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/codex-run.sh -p prompts/prompt.md
#   ./scripts/codex-run.sh -p prompts/prompt.md -t "storefront: apple-ish layout"
#   ./scripts/codex-run.sh -p prompts/prompt.md --no-commit
#   ./scripts/codex-run.sh -p prompts/prompt.md --no-clip
#   ./scripts/codex-run.sh -p prompts/prompt.md --no-context
#   ./scripts/codex-run.sh -p prompts/prompt.md --bundle-full
#   ./scripts/codex-run.sh -p prompts/prompt.md --bundle-lines 450
#   ./scripts/codex-run.sh -p prompts/prompt.md --no-work-commit
#   ./scripts/codex-run.sh -p prompts/prompt.md --work-scope "apps/api,apps/storefront"
#
# Notes:
# - -t がない場合、codex exec で「タイトル(=履歴ラベル)」を生成
# - codex-runs/<timestamp>__<slug>/ に保存
# - bundle-for-chatgpt.md をclipboardへ
# - run dir は "codex-run: <TITLE>" でcommit（任意）
# - 本体変更は "<TITLE>" でcommit（デフォルトON / 任意）

TITLE=""
PROMPT_FILE=""
DO_COMMIT=1
DO_CLIP=1
INCLUDE_CONTEXT=1
OUT_BASE="codex-runs"
CODEX_COLOR="always"

# NEW: auto commit work changes by area in TITLE ("api:", "storefront:" etc.)
DO_WORK_COMMIT=1
WORK_SCOPE="" # comma-separated paths, overrides area mapping

# Bundle controls (to avoid "message too long" when pasting to ChatGPT)
BUNDLE_MODE="compact"   # compact|full
BUNDLE_LINES=380        # per section max lines in compact mode
PROMPT_BUNDLE_LINES=120 # prompt lines in compact mode
OUTPUT_BUNDLE_LINES=220 # codex output lines in compact mode
CONTEXT_BUNDLE_LINES=120

die() {
  echo "Error: $*" >&2
  exit 1
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

trim_lines() {
  # trim_lines <file> <max_lines>
  local f="$1"
  local max="${2:-200}"

  if [[ ! -f "$f" ]]; then
    echo "(missing: $f)"
    return 0
  fi

  local n
  n="$(wc -l <"$f" | tr -d ' ')"
  if [[ "$n" -le "$max" ]]; then
    cat "$f"
    return 0
  fi
  local head_n tail_n
  head_n=$((max * 2 / 3))
  tail_n=$((max - head_n))
  sed -n "1,${head_n}p" "$f"
  echo
  echo "... (truncated: ${f} has ${n} lines; showing head ${head_n} + tail ${tail_n})"
  echo
  tail -n "$tail_n" "$f"
}

# stage paths (ignores missing paths)
stage_paths() {
  local p
  for p in "$@"; do
    p="$(echo "$p" | sed -E 's/^ +| +$//g')"
    [[ -n "$p" ]] || continue
    git add -- "$p" 2>/dev/null || true
  done
}

# commit staged changes if any (optionally scoped)
commit_if_staged() {
  local msg="$1"
  shift
  if [[ "$#" -gt 0 ]]; then
    if git diff --cached --quiet -- "$@"; then
      echo "OK: no staged changes (skip commit: $msg)"
      return 0
    fi
    git commit -m "$msg" -- "$@"
  else
    if git diff --cached --quiet; then
      echo "OK: no staged changes (skip commit: $msg)"
      return 0
    fi
    git commit -m "$msg"
  fi
  echo "OK: committed: $msg"
}

# determine work scopes from TITLE area, unless WORK_SCOPE is set
compute_scopes() {
  local area="$1"
  local -a scopes=()

  if [[ -n "$WORK_SCOPE" ]]; then
    local -a cleaned=()
    local s
    IFS=',' read -r -a scopes <<<"$WORK_SCOPE"
    for s in "${scopes[@]}"; do
      s="$(echo "$s" | sed -E 's/^ +| +$//g')"
      [[ -n "$s" ]] || continue
      cleaned+=("$s")
    done
    printf '%s\n' "${cleaned[@]}"
    return 0
  fi

  case "$area" in
  storefront) scopes+=(apps/storefront) ;;
  api) scopes+=(apps/api) ;;
  infra) scopes+=(infra scripts prompts) ;;
  docs) scopes+=(docs) ;;
  tests) scopes+=(apps) ;;
  *) scopes=() ;;
  esac

  printf '%s\n' "${scopes[@]}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  -t | --title)
    TITLE="${2:-}"
    shift 2
    ;;
  -p | --prompt)
    PROMPT_FILE="${2:-}"
    shift 2
    ;;
  --no-commit)
    DO_COMMIT=0
    shift
    ;;
  --no-work-commit)
    DO_WORK_COMMIT=0
    shift
    ;;
  --work-scope)
    WORK_SCOPE="${2:-}"
    shift 2
    ;;
  --no-clip)
    DO_CLIP=0
    shift
    ;;
  --no-context)
    INCLUDE_CONTEXT=0
    shift
    ;;
  --bundle-full)
    BUNDLE_MODE="full"
    shift
    ;;
  --bundle-lines)
    BUNDLE_LINES="${2:-}"
    shift 2
    ;;
  -h | --help)
    sed -n '1,200p' "$0"
    exit 0
    ;;
  *) die "Unknown arg: $1" ;;
  esac
done

[[ -n "$PROMPT_FILE" ]] || die "-p/--prompt is required"
[[ -f "$PROMPT_FILE" ]] || die "prompt file not found: $PROMPT_FILE"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Not a git repo"
cd "$ROOT"

have_cmd codex || die "codex command not found"

TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_BASE"

PROMPT_CONTENT="$(cat "$PROMPT_FILE")"

# --- optional short context for title generation and bundle ---
SHORT_CONTEXT=""
if [[ "$INCLUDE_CONTEXT" -eq 1 ]]; then
  SHORT_CONTEXT="$(
    cat <<EOF
branch: $(git branch --show-current)
head:   $(git rev-parse --short HEAD)

status:
$(git status -sb)

changed files (HEAD..WT):
$(git diff --name-only HEAD | sed -n '1,40p')

diffstat (HEAD..WT):
$(git diff --stat HEAD | sed -n '1,40p')
EOF
  )"
fi

# --- auto title (if not provided) ---
if [[ -z "${TITLE}" ]]; then
  TITLE_PROMPT=$'以下の情報から、この作業を表す短いタイトルを1行で作ってください。\n\
- 形式: "<area>: <summary>"\n\
- area は storefront|api|infra|docs|tests のどれか\n\
- summary は英小文字中心、5〜8語以内、盛らない（事実ベース）\n\
- 出力はタイトル1行のみ（説明禁止）\n\
\n\
[repo context]\n'"$SHORT_CONTEXT"$'\n\
\n\
[prompt]\n'"$PROMPT_CONTENT"

  set +e
  TITLE="$(
    codex exec --color never "$TITLE_PROMPT" |
      head -n 1 |
      tr -d '\r' |
      sed -E 's/  +/ /g' |
      sed -E 's/^ +| +$//g'
  )"
  set -e

  [[ -n "$TITLE" ]] || TITLE="storefront: codex-run"
fi

# --- slug for dir name (avoid ":" etc.) ---
SAFE_TITLE="$(echo "$TITLE" |
  tr ' ' '_' |
  tr '/' '_' |
  tr ':' '_' |
  tr -cd '[:alnum:]_-')"

RUN_DIR="${OUT_BASE}/${TS}__${SAFE_TITLE}"
mkdir -p "$RUN_DIR"

cp "$PROMPT_FILE" "$RUN_DIR/prompt.md"

if [[ "$INCLUDE_CONTEXT" -eq 1 ]]; then
  {
    echo "=== Codex Context (short) ==="
    date -Iseconds
    echo
    echo "## Repo"
    echo "branch: $(git branch --show-current)"
    echo "head:   $(git rev-parse --short HEAD)"
    echo
    echo "## Status"
    git status -sb
    echo
    echo "## Changed files (HEAD..WT)"
    git diff --name-only HEAD
    echo
    echo "## Diff stats (HEAD..WT)"
    git diff --stat HEAD
    echo
    echo "## Recent commits"
    git log --oneline -n 20
  } >"$RUN_DIR/context.txt"
fi

# --- run codex in non-interactive mode ---
set +e
codex exec --color "$CODEX_COLOR" "$PROMPT_CONTENT" | tee >(perl -pe 's/\e\[[0-9;]*m//g' >"$RUN_DIR/codex-output.md")
CODEX_EXIT=${PIPESTATUS[0]}
set -e

# --- bundle for ChatGPT paste (compact by default) ---
BUNDLE="$RUN_DIR/bundle-for-chatgpt.md"
mkdir -p "$(dirname "$BUNDLE")"
{
  echo "# Codex run"
  echo "- title: $TITLE"
  echo "- generated: $(date -Iseconds)"
  echo "- branch: $(git branch --show-current)"
  echo "- head: $(git rev-parse --short HEAD)"
  echo

  if [[ -f "$RUN_DIR/context.txt" ]]; then
    echo "## Repo context"
    if [[ "$BUNDLE_MODE" == "full" ]]; then
      cat "$RUN_DIR/context.txt"
    else
      trim_lines "$RUN_DIR/context.txt" "${CONTEXT_BUNDLE_LINES:-$BUNDLE_LINES}"
      echo
      echo "_(full context: $RUN_DIR/context.txt)_"
    fi
    echo
  fi

  echo "## Prompt (what I gave to codex)"
  echo '```'
  if [[ "$BUNDLE_MODE" == "full" ]]; then
    cat "$RUN_DIR/prompt.md"
  else
    trim_lines "$RUN_DIR/prompt.md" "${PROMPT_BUNDLE_LINES:-$BUNDLE_LINES}"
    echo
    echo "... (prompt truncated in bundle; full prompt: $RUN_DIR/prompt.md)"
  fi
  echo '```'
  echo

  echo "## Codex output"
  echo '```'
  if [[ "$BUNDLE_MODE" == "full" ]]; then
    cat "$RUN_DIR/codex-output.md"
  else
    trim_lines "$RUN_DIR/codex-output.md" "${OUTPUT_BUNDLE_LINES:-$BUNDLE_LINES}"
    echo
    echo "... (output truncated in bundle; full output: $RUN_DIR/codex-output.md)"
  fi
  echo '```'
  echo
} >"$BUNDLE"

if [[ ! -f "$BUNDLE" ]]; then
  die "bundle was not generated: $BUNDLE"
fi

# --- copy to clipboard ---
if [[ "$DO_CLIP" -eq 1 ]]; then
  if have_cmd wl-copy; then
    wl-copy <"$BUNDLE"
  elif have_cmd xclip; then
    xclip -selection clipboard <"$BUNDLE"
  elif have_cmd pbcopy; then
    pbcopy <"$BUNDLE"
  else
    echo "WARN: no clipboard tool found (wl-copy/xclip/pbcopy). Bundle saved at: $BUNDLE" >&2
  fi
fi

# --- optionally commit work changes (by TITLE area) ---
if [[ "$DO_WORK_COMMIT" -eq 1 ]]; then
  AREA="${TITLE%%:*}"
  AREA="$(echo "$AREA" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"

  SCOPES=()
  # NOTE: macOS /bin/bash (3.2) doesn't have mapfile/readarray
  while IFS= read -r s; do
    [[ -n "$s" ]] || continue
    SCOPES+=("$s")
  done < <(compute_scopes "$AREA")

  if [[ "${#SCOPES[@]}" -gt 0 ]]; then
    stage_paths "${SCOPES[@]}"
    commit_if_staged "$TITLE" "${SCOPES[@]}"
  else
    echo "OK: no scope matched for area='$AREA' (skip work commit). Use --work-scope to force."
  fi
fi

# --- git commit only the run dir ---
if [[ "$DO_COMMIT" -eq 1 ]]; then
  git add -- "$RUN_DIR"
  commit_if_staged "codex-run: $TITLE" "$RUN_DIR"
fi

echo "OK: title = $TITLE"
echo "OK: saved run to $RUN_DIR"
if [[ "$DO_CLIP" -eq 1 ]]; then echo "OK: copied bundle to clipboard (if tool exists)"; fi
if [[ "$CODEX_EXIT" -ne 0 ]]; then
  echo "WARN: codex exec exited with code $CODEX_EXIT"
fi
