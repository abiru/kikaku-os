Scoped the work and run commits so they only include the intended paths (even if other changes are staged), and normalized `--work-scope` entries so whitespace doesn’t break scoping. All changes are in `scripts/codex-run.sh`.

Details
- `scripts/codex-run.sh`: `commit_if_staged` now accepts an optional pathspec and is used for both work commits and `codex-runs/` commits to prevent accidental cross-commit.
- `scripts/codex-run.sh`: `--work-scope` entries are trimmed before use; staging also trims inputs.

Patch
```diff
diff --git a/scripts/codex-run.sh b/scripts/codex-run.sh
index f7fc53f..7aa479d 100755
--- a/scripts/codex-run.sh
+++ b/scripts/codex-run.sh
@@ -9,12 +9,15 @@ set -euo pipefail
 #   ./scripts/codex-run.sh -p prompts/prompt.md --no-context
 #   ./scripts/codex-run.sh -p prompts/prompt.md --bundle-full
 #   ./scripts/codex-run.sh -p prompts/prompt.md --bundle-lines 450
+#   ./scripts/codex-run.sh -p prompts/prompt.md --no-work-commit
+#   ./scripts/codex-run.sh -p prompts/prompt.md --work-scope "apps/api,apps/storefront"
 #
 # Notes:
 # - -t がない場合、codex exec で「タイトル(=履歴ラベル)」を生成
 # - codex-runs/<timestamp>__<slug>/ に保存
 # - bundle-for-chatgpt.md をclipboardへ
-# - そのrunディレクトリだけをgit commit（任意）
+# - run dir は "codex-run: <TITLE>" でcommit（任意）
+# - 本体変更は "<TITLE>" でcommit（デフォルトON / 任意）
 
 TITLE=""
 PROMPT_FILE=""
@@ -23,7 +26,10 @@ DO_CLIP=1
 INCLUDE_CONTEXT=1
 OUT_BASE="codex-runs"
 CODEX_COLOR="never"
-COMMIT_STOREFRONT=0
+
+# NEW: auto commit work changes by area in TITLE ("api:", "storefront:" etc.)
+DO_WORK_COMMIT=1
+WORK_SCOPE="" # comma-separated paths, overrides area mapping
 
 # Bundle controls (to avoid "message too long" when pasting to ChatGPT)
 BUNDLE_MODE="compact"   # compact|full
@@ -49,7 +55,6 @@ trim_lines() {
     cat "$f"
     return 0
   fi
-  # show head + tail (split)
   local head_n tail_n
   head_n=$((max * 2 / 3))
   tail_n=$((max - head_n))
@@ -60,6 +65,67 @@ trim_lines() {
   tail -n "$tail_n" "$f"
 }
 
+# stage paths (ignores missing paths)
+stage_paths() {
+  local p
+  for p in "$@"; do
+    p="$(echo "$p" | sed -E 's/^ +| +$//g')"
+    [[ -n "$p" ]] || continue
+    git add "$p" 2>/dev/null || true
+  done
+}
+
+# commit staged changes if any (optionally scoped)
+commit_if_staged() {
+  local msg="$1"
+  shift
+  if [[ "$#" -gt 0 ]]; then
+    if git diff --cached --quiet -- "$@"; then
+      echo "OK: no staged changes (skip commit: $msg)"
+      return 0
+    fi
+    git commit -m "$msg" -- "$@"
+  else
+    if git diff --cached --quiet; then
+      echo "OK: no staged changes (skip commit: $msg)"
+      return 0
+    fi
+    git commit -m "$msg"
+  fi
+  echo "OK: committed: $msg"
+}
+
+# determine work scopes from TITLE area, unless WORK_SCOPE is set
+compute_scopes() {
+  local area="$1"
+  local -a scopes=()
+
+  if [[ -n "$WORK_SCOPE" ]]; then
+    local -a cleaned=()
+    local s
+    IFS=',' read -r -a scopes <<<"$WORK_SCOPE"
+    for s in "${scopes[@]}"; do
+      s="$(echo "$s" | sed -E 's/^ +| +$//g')"
+      [[ -n "$s" ]] || continue
+      cleaned+=("$s")
+    done
+    printf '%s\n' "${cleaned[@]}"
+    return 0
+  fi
+
+  case "$area" in
+  storefront) scopes+=(apps/storefront) ;;
+  api) scopes+=(apps/api) ;;
+  admin) scopes+=(apps/admin) ;;
+  infra) scopes+=(infra) ;;
+  docs) scopes+=(docs) ;;
+  tests) scopes+=(apps) ;;
+  *) scopes=() ;;
+  esac
+
+  printf '%s\n' "${scopes[@]}"
+}
+
 while [[ $# -gt 0 ]]; do
   case "$1" in
   -t | --title)
@@ -74,6 +140,14 @@ while [[ $# -gt 0 ]]; do
     DO_COMMIT=0
     shift
     ;;
+  --no-work-commit)
+    DO_WORK_COMMIT=0
+    shift
+    ;;
+  --work-scope)
+    WORK_SCOPE="${2:-}"
+    shift 2
+    ;;
   --no-clip)
     DO_CLIP=0
     shift
@@ -82,10 +156,6 @@ while [[ $# -gt 0 ]]; do
     INCLUDE_CONTEXT=0
     shift
     ;;
-  --commit-storefront)
-    COMMIT_STOREFRONT=1
-    shift
-    ;;
   --bundle-full)
     BUNDLE_MODE="full"
     shift
@@ -95,7 +165,7 @@ while [[ $# -gt 0 ]]; do
     shift 2
     ;;
   -h | --help)
-    sed -n '1,160p' "$0"
+    sed -n '1,200p' "$0"
     exit 0
     ;;
   *) die "Unknown arg: $1" ;;
@@ -262,27 +332,30 @@ if [[ "$DO_CLIP" -eq 1 ]]; then
   fi
 fi
 
-# --- git commit only the run dir ---
-if [[ "$DO_COMMIT" -eq 1 ]]; then
-  git add "$RUN_DIR"
-  git commit -m "codex-run: $TITLE"
-fi
+# --- optionally commit work changes (by TITLE area) ---
+if [[ "$DO_WORK_COMMIT" -eq 1 ]]; then
+  AREA="${TITLE%%:*}"
+  AREA="$(echo "$AREA" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
 
+  mapfile -t SCOPES < <(compute_scopes "$AREA")
 
-# --- optionally commit storefront changes (separately) ---
-if [[ "$COMMIT_STOREFRONT" -eq 1 ]]; then
-  git add apps/storefront
-  if git diff --cached --quiet; then
-    echo "OK: no staged changes in apps/storefront (skip storefront commit)"
+  if [[ "${#SCOPES[@]}" -gt 0 ]]; then
+    stage_paths "${SCOPES[@]}"
+    commit_if_staged "$TITLE" "${SCOPES[@]}"
   else
-    git commit -m "$TITLE"
-    echo "OK: committed apps/storefront changes"
+    echo "OK: no scope matched for area='$AREA' (skip work commit). Use --work-scope to force."
   fi
 fi
+
+# --- git commit only the run dir ---
+if [[ "$DO_COMMIT" -eq 1 ]]; then
+  git add "$RUN_DIR"
+  commit_if_staged "codex-run: $TITLE" "$RUN_DIR"
+fi
+
 echo "OK: title = $TITLE"
 echo "OK: saved run to $RUN_DIR"
 if [[ "$DO_CLIP" -eq 1 ]]; then echo "OK: copied bundle to clipboard (if tool exists)"; fi
-if [[ "$DO_COMMIT" -eq 1 ]]; then echo "OK: committed run dir"; fi
 if [[ "$CODEX_EXIT" -ne 0 ]]; then
   echo "WARN: codex exec exited with code $CODEX_EXIT"
 fi
```

Verification commands
```bash
./scripts/codex-run.sh --help | rg -- '--no-work-commit|--work-scope'
git switch -c verify/no-work && printf '\n# verify\n' >> apps/api/README.md && ./scripts/codex-run.sh -p prompts/prompt.md -t "api: verify no work commit" --no-work-commit && git show --name-only --pretty="" HEAD | rg '^codex-runs/'
git switch -c verify/default && printf '\n# verify\n' >> apps/api/README.md && ./scripts/codex-run.sh -p prompts/prompt.md -t "api: verify default" && git show --name-only --pretty="" HEAD~1 | rg '^apps/api/'
git switch -c verify/work-scope && printf '\n# verify\n' >> apps/admin/README.md && printf '\n# verify\n' >> apps/api/README.md && ./scripts/codex-run.sh -p prompts/prompt.md -t "admin: verify work scope" --work-scope "apps/admin" && git show --name-only --pretty="" HEAD~1 | rg '^apps/admin/' && ! git show --name-only --pretty="" HEAD~1 | rg -q '^apps/api/'
before=$(git rev-parse HEAD) && ./scripts/codex-run.sh -p prompts/prompt.md -t "docs: verify no changes" --no-commit --work-scope "docs" && test "$(git rev-parse HEAD)" = "$before"
```

Tests not run.

Next steps
1) Run the verification commands above on a scratch branch.  
2) If desired, run the repo post-change checklist.
