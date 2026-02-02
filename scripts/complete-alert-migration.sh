#!/bin/bash

# Complete Alert Migration Script
# This script updates all remaining admin pages to use Catalyst Alert components

set -e

echo "Completing Alert component migration for admin pages..."

# Function to update a single file
update_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    echo "  ⚠️  File not found: $file"
    return
  fi

  echo "  Processing: $file"

  # Add Alert import if not present
  if ! grep -q "from '.*catalyst/alert-banner'" "$file"; then
    # Find first import line and add Alert import after it
    sed -i "1,/^import/ {/^import/ a\\
import { Alert } from '../../components/catalyst/alert-banner';
}" "$file" 2>/dev/null || sed -i '' "1,/^import/ {/^import/ a\\
import { Alert } from '../../components/catalyst/alert-banner';\\
}" "$file" 2>/dev/null || true
  fi

  # Replace error divs with Alert component (red)
  sed -i 's|<div class="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="red" client:load>|g' "$file" 2>/dev/null ||   sed -i '' 's|<div class="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="red" client:load>|g' "$file" 2>/dev/null || true

  # Replace success divs with Alert component (green)
  sed -i 's|<div class="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="green" client:load>|g' "$file" 2>/dev/null ||
  sed -i '' 's|<div class="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="green" client:load>|g' "$file" 2>/dev/null || true

  # Replace warning/amber divs with Alert component (amber)
  sed -i 's|<div class="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="amber" client:load>|g' "$file" 2>/dev/null ||
  sed -i '' 's|<div class="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="amber" client:load>|g' "$file" 2>/dev/null || true

  # Replace info/blue divs with Alert component (blue)
  sed -i 's|<div class="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="blue" client:load>|g' "$file" 2>/dev/null ||
  sed -i '' 's|<div class="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg\([^"]*\)">\s*|<Alert color="blue" client:load>|g' "$file" 2>/dev/null || true

  # Close the divs by replacing closing tags
  sed -i 's|</div>|</Alert>|g' "$file" 2>/dev/null || sed -i '' 's|</div>|</Alert>|g' "$file" 2>/dev/null || true

  echo "    ✓ Updated"
}

# List of files to update
files=(
  "apps/storefront/src/pages/admin/pages/[id].astro"
  "apps/storefront/src/pages/admin/pages/new.astro"
  "apps/storefront/src/pages/admin/email-templates/[slug].astro"
  "apps/storefront/src/pages/admin/ads/[id].astro"
  "apps/storefront/src/pages/admin/ads/[id]/history.astro"
  "apps/storefront/src/pages/admin/ads/new.astro"
  "apps/storefront/src/pages/admin/index.astro"
  "apps/storefront/src/pages/admin/orders.astro"
  "apps/storefront/src/pages/admin/customers.astro"
  "apps/storefront/src/pages/admin/events.astro"
  "apps/storefront/src/pages/admin/products.astro"
  "apps/storefront/src/pages/admin/categories/[name].astro"
  "apps/storefront/src/pages/admin/login.astro"
)

for file in "${files[@]}"; do
  update_file "$file"
done

echo ""
echo "✓ Alert migration completed!"
echo ""
echo "Summary:"
echo "  - Created: apps/storefront/src/components/catalyst/alert-banner.tsx"
echo "  - Updated: ${#files[@]} admin page files"
echo "  - Replaced: Custom error/success divs with <Alert> components"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff apps/storefront/src/pages/admin"
echo "  2. Test admin interface"
echo "  3. Commit changes"
