#!/bin/bash
# Complete removal of all dark: classes from Catalyst components

set -e

CATALYST_DIR="apps/storefront/src/components/catalyst"

echo "Step 1: Removing all dark: classes..."

# Use a simpler sed approach
for file in "$CATALYST_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    # Remove dark: classes and clean up spaces
    sed -i -E 's/ dark:[A-Za-z0-9_\/-]*:[A-Za-z0-9_\/-]*:[A-Za-z0-9_\/-]*(\[[^]]*\])?[A-Za-z0-9_\/-]*//g' "$file"
    sed -i -E 's/ dark:[A-Za-z0-9_\/-]*:[A-Za-z0-9_\/-]*(\[[^]]*\])?[A-Za-z0-9_\/-]*//g' "$file"
    sed -i -E 's/ dark:[A-Za-z0-9_\/-]*(\[[^]]*\])?[A-Za-z0-9_\/-]*//g' "$file"
    # Clean up extra spaces
    sed -i 's/  \+/ /g' "$file"
    sed -i "s/ '/'/g" "$file"
    sed -i 's/ "/"/g' "$file"
  fi
done

echo "Step 2: Verifying..."

# Count remaining dark: instances
REMAINING=$(grep -r "dark:" "$CATALYST_DIR" 2>/dev/null | wc -l || echo "0")

if [ "$REMAINING" -eq 0 ]; then
    echo "✓ All dark: classes removed successfully"
else
    echo "⚠ Warning: $REMAINING dark: classes still remain"
    grep -rn "dark:" "$CATALYST_DIR" 2>/dev/null | head -10 || true
fi

echo "Done!"
