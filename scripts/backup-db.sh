#!/bin/bash
set -e

# Database backup script
# Exports all critical tables from production D1 database to JSON

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "📦 Backing up production D1 database..."
echo "Timestamp: $DATE"
echo "Output: $BACKUP_DIR"
echo ""

# Critical tables to backup
TABLES=(
  "customers"
  "products"
  "variants"
  "prices"
  "orders"
  "order_items"
  "payments"
  "refunds"
  "ledger_entries"
  "inbox"
  "daily_close_runs"
  "documents"
  "stripe_events"
  "fulfillments"
  "inventory_transactions"
  "tax_rates"
  "coupons"
  "categories"
  "pages"
  "email_templates"
)

for table in "${TABLES[@]}"; do
  echo "  - Backing up $table..."
  wrangler d1 execute ledkikaku-os --remote \
    --command "SELECT * FROM $table" --json \
    > "$BACKUP_DIR/${table}_${DATE}.json" 2>/dev/null || echo "    ⚠️  Failed to backup $table (may not exist)"
done

echo ""
echo "✅ Backup complete!"
echo "Files: $BACKUP_DIR/*_${DATE}.json"
echo ""

# Optional: Create tarball
TARBALL="$BACKUP_DIR/backup_${DATE}.tar.gz"
echo "📦 Creating tarball: $TARBALL"
tar -czf "$TARBALL" -C "$BACKUP_DIR" $(ls "$BACKUP_DIR" | grep "_${DATE}.json")
echo "✅ Tarball created: $TARBALL"

# Optional: Upload to R2 (uncomment to enable)
# echo "☁️  Uploading to R2..."
# wrangler r2 object put ledkikaku-artifacts/backups/backup_${DATE}.tar.gz --file "$TARBALL"
# echo "✅ Uploaded to R2: backups/backup_${DATE}.tar.gz"

echo ""
echo "💡 To restore a table:"
echo "   cat $BACKUP_DIR/<table>_${DATE}.json | jq -r '.[] | @json' | while read row; do"
echo "     wrangler d1 execute ledkikaku-os --remote --command \"INSERT INTO <table> (...) VALUES (...)\""
echo "   done"
