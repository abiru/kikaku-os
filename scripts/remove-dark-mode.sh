#!/bin/bash
# Remove all dark: Tailwind classes from Catalyst components

CATALYST_DIR="apps/storefront/src/components/catalyst"

# Find all .tsx files and remove dark: classes
for file in "$CATALYST_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    echo "Processing: $file"
    # Remove dark: classes using sed
    # This handles various formats:
    # - dark:bg-white
    # - dark:text-white/50
    # - dark:hover:bg-white
    # - dark:data-[state]:bg-white
    sed -i "s/dark:[a-zA-Z0-9_\/-]*:[a-zA-Z0-9_\/-]*:[a-zA-Z0-9_\/-]*\(\[[^]]*\]\)*[a-zA-Z0-9_\/-]*//g" "$file"
    sed -i "s/dark:[a-zA-Z0-9_\/-]*:[a-zA-Z0-9_\/-]*\(\[[^]]*\]\)*[a-zA-Z0-9_\/-]*//g" "$file"
    sed -i "s/dark:[a-zA-Z0-9_\/-]*\(\[[^]]*\]\)*[a-zA-Z0-9_\/-]*//g" "$file"
    # Clean up extra spaces that might be left behind
    sed -i "s/  \+/ /g" "$file"
    sed -i "s/ '/'/g" "$file"
    sed -i "s/ \"/\"/g" "$file"
  fi
done

echo "✓ Dark mode classes removed from Catalyst components"
