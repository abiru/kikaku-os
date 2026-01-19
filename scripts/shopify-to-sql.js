const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');

if (help || args.length === 0) {
  console.log(`
Usage: node scripts/shopify-to-sql.js [options]

Options:
  --products <path>   Path to Shopify Products CSV export
  --customers <path>  Path to Shopify Customers CSV export
  --currency <code >  Currency code (default: JPY). If JPY, amounts are integer. If others, amounts are cents (x100).
  --out <path>        Output SQL file path (default: migration.sql)
  --help              Show this help

Example:
  node scripts/shopify-to-sql.js --products=products_export.csv --out=import_products.sql
`);
  process.exit(0);
}

const getArg = (name) => {
  const prefix = `--${name}=`;
  const arg = args.find(a => a.startsWith(prefix));
  if (arg) return arg.substring(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length) return args[index + 1];
  return null;
};

const productsPath = getArg('products');
const customersPath = getArg('customers');
const outPath = getArg('out') || 'migration.sql';
const currency = (getArg('currency') || 'JPY').toUpperCase();

if (!productsPath && !customersPath) {
  console.error('Error: At least one of --products or --customers must be provided.');
  process.exit(1);
}

// Simple CSV Parser
function parseCSV(content) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++; // Skip \n
      currentLine.push(currentField);
      if (currentLine.length > 0 && (currentLine.length > 1 || currentLine[0] !== '')) {
        lines.push(currentLine);
      }
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }
  return lines;
}

function escapeSQL(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

const outputLines = [];
outputLines.push('BEGIN TRANSACTION;');
outputLines.push('CREATE TEMPORARY TABLE IF NOT EXISTS temp_ids (id INTEGER);');

if (productsPath) {
  console.log(`Processing Products: ${productsPath}`);
  try {
    const content = fs.readFileSync(productsPath, 'utf8');
    const rows = parseCSV(content);
    if (rows.length < 2) {
      console.error('Products CSV is empty or invalid.');
    } else {
      const headers = rows[0].map(h => h.trim());
      const data = rows.slice(1);

      const getCol = (row, name) => {
        const idx = headers.indexOf(name);
        return idx !== -1 ? row[idx] : null;
      };

      // Group by Handle
      const productsMap = new Map();
      
      data.forEach(row => {
        const handle = getCol(row, 'Handle');
        if (!handle) return;
        
        if (!productsMap.has(handle)) {
          productsMap.set(handle, []);
        }
        productsMap.get(handle).push(row);
      });

      console.log(`Found ${productsMap.size} products.`);

      for (const [handle, variants] of productsMap) {
        const first = variants[0];
        const title = getCol(first, 'Title') || handle;
        const description = getCol(first, 'Body (HTML)') || '';
        const vendor = getCol(first, 'Vendor');
        const type = getCol(first, 'Type');
        const tags = getCol(first, 'Tags');
        const published = getCol(first, 'Published');
        
        const status = (published === 'true' || published === 'TRUE') ? 'active' : 'draft';
        
        const metadata = JSON.stringify({
          vendor,
          type,
          tags,
          handle,
          source: 'shopify_migration'
        });

        outputLines.push(`-- Product: ${handle}`);
        outputLines.push(`INSERT INTO products (title, description, status, metadata, created_at, updated_at) VALUES (${escapeSQL(title)}, ${escapeSQL(description)}, ${escapeSQL(status)}, ${escapeSQL(metadata)}, datetime('now'), datetime('now'));`);
        outputLines.push('DELETE FROM temp_ids; INSERT INTO temp_ids SELECT last_insert_rowid();');

        for (const variant of variants) {
          const sku = getCol(variant, 'Variant SKU');
          const priceStr = getCol(variant, 'Variant Price') || '0';
          const qtyStr = getCol(variant, 'Variant Inventory Qty') || '0';
          
          let price = parseFloat(priceStr);
          if (isNaN(price)) price = 0;
          
          let amount;
          if (currency === 'JPY') {
            amount = Math.round(price);
          } else {
            amount = Math.round(price * 100);
          }

          const qty = parseInt(qtyStr, 10) || 0;

          // Options
          const options = {};
          const opt1Name = getCol(variant, 'Option1 Name');
          const opt1Val = getCol(variant, 'Option1 Value');
          const opt2Name = getCol(variant, 'Option2 Name');
          const opt2Val = getCol(variant, 'Option2 Value');
          const opt3Name = getCol(variant, 'Option3 Name');
          const opt3Val = getCol(variant, 'Option3 Value');

          if (opt1Name && opt1Val) options[opt1Name] = opt1Val;
          if (opt2Name && opt2Val) options[opt2Name] = opt2Val;
          if (opt3Name && opt3Val) options[opt3Name] = opt3Val;
          
          // If no options, use Title if available (Shopify usually puts "Default Title" for single variant)
          // But schema expects options JSON.
          
          // Variant Title
          // Shopify CSV has no explicit Variant Title column usually? 
          // Wait, "Option1 Value" is usually the main differentiator.
          // Or we construct title from options.
          const variantTitle = Object.values(options).join(' / ') || 'Default';

          const variantMetadata = JSON.stringify({
             grams: getCol(variant, 'Variant Grams'),
             barcode: getCol(variant, 'Variant Barcode'),
             image: getCol(variant, 'Image Src')
          });

          outputLines.push(`INSERT INTO variants (product_id, title, sku, options, metadata, created_at, updated_at) SELECT id, ${escapeSQL(variantTitle)}, ${escapeSQL(sku)}, ${escapeSQL(JSON.stringify(options))}, ${escapeSQL(variantMetadata)}, datetime('now'), datetime('now') FROM temp_ids;`);
          
          // Price
          outputLines.push(`INSERT INTO prices (variant_id, currency, amount, created_at, updated_at) VALUES (last_insert_rowid(), ${escapeSQL(currency)}, ${amount}, datetime('now'), datetime('now'));`);
          
          // Inventory
          if (qty !== 0) {
             outputLines.push(`INSERT INTO inventory_movements (variant_id, delta, reason, created_at, updated_at) VALUES (last_insert_rowid(), ${qty}, 'migration_initial', datetime('now'), datetime('now'));`);
          }
        }
      }
    }
  } catch (e) {
    console.error(`Failed to read products file: ${e.message}`);
    process.exit(1);
  }
}

if (customersPath) {
  console.log(`Processing Customers: ${customersPath}`);
  try {
    const content = fs.readFileSync(customersPath, 'utf8');
    const rows = parseCSV(content);
    if (rows.length < 2) {
      console.error('Customers CSV is empty or invalid.');
    } else {
      const headers = rows[0].map(h => h.trim());
      const data = rows.slice(1);
      
      const getCol = (row, name) => {
        const idx = headers.indexOf(name);
        return idx !== -1 ? row[idx] : null;
      };

      let count = 0;
      data.forEach(row => {
        const email = getCol(row, 'Email');
        if (!email) return;

        const firstName = getCol(row, 'First Name') || '';
        const lastName = getCol(row, 'Last Name') || '';
        const name = `${firstName} ${lastName}`.trim() || email;
        const note = getCol(row, 'Note');
        const tags = getCol(row, 'Tags');
        
        const metadata = JSON.stringify({
          note,
          tags,
          total_spent: getCol(row, 'Total Spent'),
          total_orders: getCol(row, 'Total Orders'),
          source: 'shopify_migration'
        });

        outputLines.push(`INSERT INTO customers (name, email, metadata, created_at, updated_at) VALUES (${escapeSQL(name)}, ${escapeSQL(email)}, ${escapeSQL(metadata)}, datetime('now'), datetime('now'));`);
        count++;
      });
      console.log(`Found ${count} customers.`);
    }
  } catch (e) {
    console.error(`Failed to read customers file: ${e.message}`);
    process.exit(1);
  }
}

outputLines.push('COMMIT;');

fs.writeFileSync(outPath, outputLines.join('\n'));
console.log(`\nSuccess! SQL written to ${outPath}`);
console.log(`Run with: wrangler d1 execute ledkikaku-os --file=${outPath}`);
