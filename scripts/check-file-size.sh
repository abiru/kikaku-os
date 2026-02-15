#!/usr/bin/env bash
# check-file-size.sh - CI guard against oversized source files
#
# Warns on files > 600 lines, fails on files > 800 lines.
# Excludes: test files, generated files, lock files, migrations, node_modules.

set -euo pipefail

WARN_LIMIT=600
FAIL_LIMIT=800

warnings=0
failures=0

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt "$FAIL_LIMIT" ]; then
    echo "FAIL: $file ($lines lines > $FAIL_LIMIT)"
    failures=$((failures + 1))
  elif [ "$lines" -gt "$WARN_LIMIT" ]; then
    echo "WARN: $file ($lines lines > $WARN_LIMIT)"
    warnings=$((warnings + 1))
  fi
done < <(
  find apps/api/src apps/storefront/src \
    -name '*.ts' -o -name '*.tsx' -o -name '*.astro' |
  grep -v -E '(\.test\.|\.spec\.|__tests__|__mocks__|node_modules|\.d\.ts$|migrations|generated|pnpm-lock)' |
  sort
)

echo ""
echo "File size check: $failures failure(s), $warnings warning(s)"

if [ "$failures" -gt 0 ]; then
  echo "Split files exceeding $FAIL_LIMIT lines before merging."
  exit 1
fi

exit 0
