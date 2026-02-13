#!/bin/bash
set -euo pipefail

# Database backup script
# Exports all critical tables from production D1 database to JSON

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-56}"

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

FAILED_TABLES=()

for table in "${TABLES[@]}"; do
  echo "  - Backing up $table..."
  if ! wrangler d1 execute ledkikaku-os --remote \
    --command "SELECT * FROM $table" --json \
    > "$BACKUP_DIR/${table}_${DATE}.json" 2>/dev/null; then
    echo "    ⚠️  Failed to backup $table (may not exist)"
    FAILED_TABLES+=("$table")
    rm -f "$BACKUP_DIR/${table}_${DATE}.json"
  fi
done

echo ""

if [ ${#FAILED_TABLES[@]} -gt 0 ]; then
  echo "⚠️  Failed tables: ${FAILED_TABLES[*]}"
  echo ""
fi

# Check if any files were created
BACKUP_FILES=$(ls "$BACKUP_DIR" 2>/dev/null | grep "_${DATE}.json" || true)
if [ -z "$BACKUP_FILES" ]; then
  echo "❌ No tables were backed up successfully"
  exit 1
fi

echo "✅ Backup complete!"
echo "Files: $BACKUP_DIR/*_${DATE}.json"
echo ""

# Create tarball
TARBALL="$BACKUP_DIR/backup_${DATE}.tar.gz"
echo "📦 Creating tarball: $TARBALL"
tar -czf "$TARBALL" -C "$BACKUP_DIR" $BACKUP_FILES
echo "✅ Tarball created: $TARBALL"

# Upload to R2
echo "☁️  Uploading to R2..."
if wrangler r2 object put ledkikaku-artifacts/backups/backup_${DATE}.tar.gz --file "$TARBALL"; then
  echo "✅ Uploaded to R2: backups/backup_${DATE}.tar.gz"
else
  echo "⚠️  Failed to upload to R2 (backup is still available locally)"
fi

# Clean up old local JSON files (keep tarball)
echo "🧹 Cleaning up local JSON files..."
rm -f "$BACKUP_DIR"/*_${DATE}.json

# Clean up old R2 backups (keep last RETENTION_DAYS days)
if [ -n "${CLEANUP_R2:-}" ]; then
  echo "🧹 Cleaning up R2 backups older than ${RETENTION_DAYS} days..."
  CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null || echo "")
  if [ -n "$CUTOFF_DATE" ]; then
    wrangler r2 object list ledkikaku-artifacts --prefix "backups/backup_" 2>/dev/null | \
      grep -oP 'backup_\K\d{8}' | sort -u | while read -r backup_date; do
        if [ "$backup_date" -lt "$CUTOFF_DATE" ]; then
          echo "  Deleting old backup from $backup_date..."
          wrangler r2 object delete "ledkikaku-artifacts/backups/backup_${backup_date}"*.tar.gz 2>/dev/null || true
        fi
      done
    echo "✅ R2 cleanup complete"
  else
    echo "⚠️  Could not calculate cutoff date, skipping R2 cleanup"
  fi
fi

echo ""
echo "💡 To restore a table:"
echo "   cat $BACKUP_DIR/<table>_${DATE}.json | jq -r '.[] | @json' | while read row; do"
echo "     wrangler d1 execute ledkikaku-os --remote --command \"INSERT INTO <table> (...) VALUES (...)\""
echo "   done"
