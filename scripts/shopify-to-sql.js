const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');

if (help || args.length === 0) {
  console.log(`
Usage: node scripts/shopify-to-sql.js [options]

Options:
  --products <path>     Shopify Products CSV パス
  --customers <path>    Shopify Customers CSV パス
  --orders <path>       Shopify Orders CSV パス
  --currency <code>     通貨コード (デフォルト: JPY)
  --out <path>          出力 SQL ファイル (デフォルト: migration.sql)
  --dry-run             プレビューモード（SQL 出力なし）
  --report <path>       検証レポートを JSON で出力
  --skip-validation     検証エラーをスキップして続行
  --help                ヘルプを表示

Example:
  node scripts/shopify-to-sql.js --products=products.csv --out=import_products.sql
  node scripts/shopify-to-sql.js --orders=orders.csv --dry-run
`);
  process.exit(0);
}

const getArg = (name) => {
  const prefix = `--${name}=`;
  const arg = args.find(a => a.startsWith(prefix));
  if (arg) return arg.substring(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const productsPath = getArg('products');
const customersPath = getArg('customers');
const ordersPath = getArg('orders');
const outPath = getArg('out') || 'migration.sql';
const currency = (getArg('currency') || 'JPY').toUpperCase();
const dryRun = hasFlag('dry-run');
const reportPath = getArg('report');
const skipValidation = hasFlag('skip-validation');

if (!productsPath && !customersPath && !ordersPath) {
  console.error('Error: At least one of --products, --customers, or --orders must be provided.');
  process.exit(1);
}

// Validation results
const validation = {
  errors: [],
  warnings: []
};

// Parsing statistics
const stats = {
  products: 0,
  variants: 0,
  customers: 0,
  customers_from_orders: 0,
  orders: 0,
  order_items: 0,
  payments: 0,
  orders_by_status: {}
};

// Simple CSV Parser (RFC 4180 compliant)
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

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Status mapping: Shopify Financial Status -> D1 orders.status / payments.status
function mapOrderStatus(financialStatus) {
  const status = (financialStatus || '').toLowerCase();
  const mapping = {
    paid: { order: 'paid', payment: 'succeeded' },
    partially_paid: { order: 'paid', payment: 'succeeded' },
    refunded: { order: 'refunded', payment: 'refunded' },
    partially_refunded: { order: 'partially_refunded', payment: 'partially_refunded' },
    pending: { order: 'pending', payment: 'pending' },
    voided: { order: 'refunded', payment: 'failed' },
    authorized: { order: 'pending', payment: 'pending' }
  };
  return mapping[status] || { order: 'pending', payment: 'pending' };
}

const outputLines = [];
outputLines.push('BEGIN TRANSACTION;');
outputLines.push('CREATE TEMPORARY TABLE IF NOT EXISTS temp_ids (id INTEGER);');
outputLines.push('CREATE TEMPORARY TABLE IF NOT EXISTS temp_order_ids (id INTEGER);');

// Process Products
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
        return idx !== -1 ? (row[idx] || null) : null;
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

      stats.products = productsMap.size;
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
          legacy: true,
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

          stats.variants++;
        }
      }
    }
  } catch (e) {
    console.error(`Failed to read products file: ${e.message}`);
    process.exit(1);
  }
}

// Process Customers
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
        return idx !== -1 ? (row[idx] || null) : null;
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
          legacy: true,
          source: 'shopify_migration'
        });

        outputLines.push(`INSERT INTO customers (name, email, metadata, created_at, updated_at) VALUES (${escapeSQL(name)}, ${escapeSQL(email)}, ${escapeSQL(metadata)}, datetime('now'), datetime('now'));`);
        count++;
      });
      stats.customers = count;
      console.log(`Found ${count} customers.`);
    }
  } catch (e) {
    console.error(`Failed to read customers file: ${e.message}`);
    process.exit(1);
  }
}

// Process Orders
if (ordersPath) {
  console.log(`Processing Orders: ${ordersPath}`);
  try {
    const content = fs.readFileSync(ordersPath, 'utf8');
    const rows = parseCSV(content);
    if (rows.length < 2) {
      console.error('Orders CSV is empty or invalid.');
    } else {
      const headers = rows[0].map(h => h.trim());
      const data = rows.slice(1);

      const getCol = (row, name) => {
        const idx = headers.indexOf(name);
        return idx !== -1 ? (row[idx] || null) : null;
      };

      // Group by Order Name (one order can have multiple line items = rows)
      const ordersMap = new Map();

      data.forEach(row => {
        const orderName = getCol(row, 'Name');
        if (!orderName) {
          validation.errors.push(`Row has empty Order Name`);
          return;
        }

        if (!ordersMap.has(orderName)) {
          ordersMap.set(orderName, []);
        }
        ordersMap.get(orderName).push(row);
      });

      console.log(`Found ${ordersMap.size} unique orders.`);

      // Collect unique customers from orders
      const customerEmails = new Set();

      for (const [orderName, lineItems] of ordersMap) {
        const first = lineItems[0];
        const email = getCol(first, 'Email');

        // Validation
        const totalStr = getCol(first, 'Total');
        const total = parseFloat(totalStr);
        if (isNaN(total)) {
          validation.errors.push(`Order ${orderName}: Total is not a number (${totalStr})`);
        }

        if (email) {
          if (!isValidEmail(email)) {
            validation.warnings.push(`Order ${orderName}: Invalid email format (${email})`);
          }
          customerEmails.add(email);
        } else {
          validation.warnings.push(`Order ${orderName}: No email (customer_id will be NULL)`);
        }

        // Validate line items
        let lineItemTotal = 0;
        for (const item of lineItems) {
          const qty = parseInt(getCol(item, 'Lineitem quantity') || '0', 10);
          const price = parseFloat(getCol(item, 'Lineitem price') || '0');
          const sku = getCol(item, 'Lineitem sku');

          if (qty < 1) {
            validation.errors.push(`Order ${orderName}: Line item quantity is less than 1`);
          }
          if (!sku) {
            validation.warnings.push(`Order ${orderName}: Line item "${getCol(item, 'Lineitem name')}" has no SKU`);
          }
          lineItemTotal += qty * price;
        }

        // Check if line item total matches subtotal (with some tolerance)
        const subtotal = parseFloat(getCol(first, 'Subtotal') || '0');
        if (Math.abs(lineItemTotal - subtotal) > 1) {
          validation.warnings.push(`Order ${orderName}: Line item total (${lineItemTotal}) differs from subtotal (${subtotal})`);
        }
      }

      // Check for validation errors
      if (validation.errors.length > 0 && !skipValidation) {
        console.error('\nValidation errors found:');
        validation.errors.forEach((e, i) => console.error(`  [${i + 1}] ${e}`));
        console.error('\nUse --skip-validation to force continue.');
        process.exit(1);
      }

      // Insert customers from orders (INSERT OR IGNORE)
      stats.customers_from_orders = customerEmails.size;
      outputLines.push('\n-- Customers from Orders (INSERT OR IGNORE)');
      for (const email of customerEmails) {
        const metadata = JSON.stringify({
          legacy: true,
          source: 'shopify_migration'
        });
        outputLines.push(`INSERT OR IGNORE INTO customers (name, email, metadata, created_at, updated_at) VALUES (${escapeSQL(email)}, ${escapeSQL(email)}, ${escapeSQL(metadata)}, datetime('now'), datetime('now'));`);
      }

      // Process each order
      for (const [orderName, lineItems] of ordersMap) {
        const first = lineItems[0];
        const email = getCol(first, 'Email');
        const financialStatus = getCol(first, 'Financial Status');
        const statusMap = mapOrderStatus(financialStatus);

        const totalStr = getCol(first, 'Total');
        let total = parseFloat(totalStr) || 0;
        if (currency === 'JPY') {
          total = Math.round(total);
        } else {
          total = Math.round(total * 100);
        }

        const paidAt = getCol(first, 'Paid at');
        const createdAt = getCol(first, 'Created at');

        // Billing info
        const billingName = getCol(first, 'Billing Name');
        const billingAddress1 = getCol(first, 'Billing Address1');
        const billingCity = getCol(first, 'Billing City');
        const billingZip = getCol(first, 'Billing Zip');
        const billingCountry = getCol(first, 'Billing Country');

        // Shipping info
        const shippingName = getCol(first, 'Shipping Name');
        const shippingAddress1 = getCol(first, 'Shipping Address1');
        const shippingCity = getCol(first, 'Shipping City');
        const shippingZip = getCol(first, 'Shipping Zip');
        const shippingCountry = getCol(first, 'Shipping Country');

        const orderMetadata = JSON.stringify({
          shopify_order: orderName,
          financial_status: financialStatus,
          billing: { name: billingName, address1: billingAddress1, city: billingCity, zip: billingZip, country: billingCountry },
          shipping: { name: shippingName, address1: shippingAddress1, city: shippingCity, zip: shippingZip, country: shippingCountry },
          legacy: true,
          source: 'shopify_migration'
        });

        // Track status
        stats.orders_by_status[statusMap.order] = (stats.orders_by_status[statusMap.order] || 0) + 1;

        outputLines.push(`\n-- Order: ${orderName}`);

        // Insert order
        const customerIdExpr = email
          ? `(SELECT id FROM customers WHERE email = ${escapeSQL(email)} LIMIT 1)`
          : 'NULL';

        const paidAtExpr = paidAt ? escapeSQL(paidAt) : 'NULL';
        const createdAtExpr = createdAt ? escapeSQL(createdAt) : "datetime('now')";

        outputLines.push(`INSERT INTO orders (customer_id, status, total_net, currency, paid_at, metadata, created_at, updated_at) VALUES (${customerIdExpr}, ${escapeSQL(statusMap.order)}, ${total}, ${escapeSQL(currency)}, ${paidAtExpr}, ${escapeSQL(orderMetadata)}, ${createdAtExpr}, datetime('now'));`);
        outputLines.push('DELETE FROM temp_order_ids; INSERT INTO temp_order_ids SELECT last_insert_rowid();');

        // Insert payment record
        const paymentMetadata = JSON.stringify({
          shopify_order: orderName,
          legacy: true,
          source: 'shopify_migration'
        });
        outputLines.push(`INSERT INTO payments (order_id, status, amount, currency, provider, metadata, created_at, updated_at) SELECT id, ${escapeSQL(statusMap.payment)}, ${total}, ${escapeSQL(currency)}, 'shopify_legacy', ${escapeSQL(paymentMetadata)}, ${createdAtExpr}, datetime('now') FROM temp_order_ids;`);
        stats.payments++;

        // Insert order items
        for (const item of lineItems) {
          const sku = getCol(item, 'Lineitem sku');
          const itemName = getCol(item, 'Lineitem name');
          const qty = parseInt(getCol(item, 'Lineitem quantity') || '1', 10);
          let unitPrice = parseFloat(getCol(item, 'Lineitem price') || '0');

          if (currency === 'JPY') {
            unitPrice = Math.round(unitPrice);
          } else {
            unitPrice = Math.round(unitPrice * 100);
          }

          const itemMetadata = JSON.stringify({
            shopify_lineitem_name: itemName,
            legacy: true,
            source: 'shopify_migration'
          });

          const variantIdExpr = sku
            ? `(SELECT id FROM variants WHERE sku = ${escapeSQL(sku)} LIMIT 1)`
            : 'NULL';

          outputLines.push(`INSERT INTO order_items (order_id, variant_id, quantity, unit_price, metadata, created_at, updated_at) SELECT id, ${variantIdExpr}, ${qty}, ${unitPrice}, ${escapeSQL(itemMetadata)}, datetime('now'), datetime('now') FROM temp_order_ids;`);
          stats.order_items++;
        }

        stats.orders++;
      }
    }
  } catch (e) {
    console.error(`Failed to read orders file: ${e.message}`);
    process.exit(1);
  }
}

outputLines.push('\nCOMMIT;');

// Generate report
const report = {
  generated_at: new Date().toISOString(),
  input_files: {
    products: productsPath || null,
    customers: customersPath || null,
    orders: ordersPath || null
  },
  currency,
  parsing: {
    products: stats.products,
    variants: stats.variants,
    customers: stats.customers,
    customers_from_orders: stats.customers_from_orders,
    orders: stats.orders,
    order_items: stats.order_items,
    payments: stats.payments
  },
  orders_by_status: stats.orders_by_status,
  validation: {
    error_count: validation.errors.length,
    warning_count: validation.warnings.length,
    errors: validation.errors,
    warnings: validation.warnings
  }
};

// Dry-run output
if (dryRun) {
  console.log('\n========================================================================');
  console.log('SHOPIFY TO D1 MIGRATION - DRY RUN');
  console.log('========================================================================');
  console.log('\nINPUT FILES:');
  if (productsPath) console.log(`  Products:   ${productsPath}`);
  if (customersPath) console.log(`  Customers:  ${customersPath}`);
  if (ordersPath) console.log(`  Orders:     ${ordersPath}`);

  console.log('\nPARSING SUMMARY:');
  if (productsPath) {
    console.log(`  Products:       ${stats.products.toLocaleString()}`);
    console.log(`  Variants:       ${stats.variants.toLocaleString()}`);
  }
  if (customersPath) {
    console.log(`  Customers:      ${stats.customers.toLocaleString()}`);
  }
  if (ordersPath) {
    console.log(`  Orders:         ${stats.orders.toLocaleString()}`);
    console.log(`  Order items:    ${stats.order_items.toLocaleString()}`);
    console.log(`  Payments:       ${stats.payments.toLocaleString()}`);
    console.log(`  Customers (from orders): ${stats.customers_from_orders.toLocaleString()}`);
    if (Object.keys(stats.orders_by_status).length > 0) {
      console.log('  Orders by status:');
      for (const [status, count] of Object.entries(stats.orders_by_status)) {
        console.log(`    - ${status}: ${count}`);
      }
    }
  }

  console.log('\nVALIDATION RESULTS:');
  console.log(`  Errors:   ${validation.errors.length}`);
  console.log(`  Warnings: ${validation.warnings.length}`);

  if (validation.errors.length > 0) {
    console.log('\n  Errors:');
    validation.errors.slice(0, 10).forEach((e, i) => console.log(`    [${i + 1}] ${e}`));
    if (validation.errors.length > 10) {
      console.log(`    ... and ${validation.errors.length - 10} more`);
    }
  }

  if (validation.warnings.length > 0) {
    console.log('\n  Warnings:');
    validation.warnings.slice(0, 10).forEach((w, i) => console.log(`    [${i + 1}] ${w}`));
    if (validation.warnings.length > 10) {
      console.log(`    ... and ${validation.warnings.length - 10} more`);
    }
  }

  console.log('\n========================================================================');
  console.log('To proceed with migration, remove --dry-run flag:');
  console.log(`  node scripts/shopify-to-sql.js ${args.filter(a => a !== '--dry-run').join(' ')} --out=${outPath}`);
  console.log('========================================================================\n');
} else {
  // Write SQL file
  fs.writeFileSync(outPath, outputLines.join('\n'));
  console.log(`\nSuccess! SQL written to ${outPath}`);
  console.log(`Run with: pnpm -C apps/api exec wrangler d1 execute ledkikaku-os --local --file=${outPath}`);
}

// Write report if requested
if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}
