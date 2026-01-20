#!/usr/bin/env node
/**
 * Product URL Fetcher using Playwright
 *
 * Usage:
 *   node scripts/fetch-product.js <url> [product_name]
 *   node scripts/fetch-product.js --update <product_id> <url>
 *
 * Examples:
 *   # Fetch and output JSON
 *   node scripts/fetch-product.js "https://www.mars-hydro.com/tsl-2000"
 *
 *   # Fetch and update product in database
 *   node scripts/fetch-product.js --update 123 "https://www.mars-hydro.com/tsl-2000"
 *
 * Output: JSON with extracted data (or updates DB directly with --update)
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');

// Find D1 database path
const findDbPath = () => {
  const basePath = path.join(__dirname, '..', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  try {
    const files = require('fs').readdirSync(basePath);
    const dbFile = files.find(f => f.endsWith('.sqlite'));
    if (dbFile) return path.join(basePath, dbFile);
  } catch {
    // ignore
  }
  return null;
};

const updateDatabase = (productId, data) => {
  const dbPath = findDbPath();
  if (!dbPath) {
    console.error('Error: Could not find local D1 database. Make sure you have run the dev server at least once.');
    process.exit(1);
  }

  const fs = require('fs');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), `product-update-${Date.now()}.sql`);

  console.error(`Updating product ${productId} in database...`);

  let sql = '';

  // Update title
  if (data.generated_title) {
    sql += `UPDATE products SET title = '${data.generated_title.replace(/'/g, "''")}', updated_at = datetime('now') WHERE id = ${productId};\n`;
  }

  // Update description
  if (data.generated_description) {
    sql += `UPDATE products SET description = '${data.generated_description.replace(/'/g, "''")}', updated_at = datetime('now') WHERE id = ${productId};\n`;
  }

  // Update metadata (image_url, specs)
  if (data.image_url || data.specs) {
    // Get current metadata
    let currentMeta = '';
    try {
      currentMeta = execSync(`sqlite3 "${dbPath}" "SELECT metadata FROM products WHERE id = ${productId};"`, { encoding: 'utf8' }).trim();
    } catch {
      // ignore
    }
    let metadata = {};
    try {
      if (currentMeta) metadata = JSON.parse(currentMeta);
    } catch {
      // ignore
    }

    if (data.image_url) metadata.image_url = data.image_url;
    if (data.specs) metadata.specs = data.specs;
    metadata.source = data.source;
    metadata.fetched_at = new Date().toISOString();

    sql += `UPDATE products SET metadata = '${JSON.stringify(metadata).replace(/'/g, "''")}', updated_at = datetime('now') WHERE id = ${productId};\n`;
  }

  // Write SQL to temp file and execute
  fs.writeFileSync(tmpFile, sql);
  try {
    execSync(`sqlite3 "${dbPath}" < "${tmpFile}"`);
    console.error(`  ✓ Title updated`);
    console.error(`  ✓ Description updated`);
    console.error(`  ✓ Metadata updated (image_url, specs)`);
  } finally {
    fs.unlinkSync(tmpFile);
  }

  console.error(`\nProduct ${productId} updated successfully!`);
};

const extractBrandFromUrl = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('mars')) return 'Mars Hydro';
    if (hostname.includes('spider')) return 'Spider Farmer';
    if (hostname.includes('viparspectra')) return 'VIPARSPECTRA';
    if (hostname.includes('gavita')) return 'Gavita';
    if (hostname.includes('hlg') || hostname.includes('horticulture')) return 'HLG';
    if (hostname.includes('ac-infinity')) return 'AC Infinity';
    if (hostname.includes('photontek')) return 'PhotonTek';
    if (hostname.includes('lumatek')) return 'Lumatek';
  } catch {
    // ignore
  }
  return '';
};

const extractSpecs = (text) => {
  const specs = {};

  // Power/Wattage
  const powerMatch = text.match(/(?:消費電力|Power|Wattage|Actual\s*Power)[:\s]*(\d+)\s*[Ww]/i);
  if (powerMatch) specs.power = `${powerMatch[1]}W`;

  // PPE/Efficacy
  const ppeMatch = text.match(/(?:PPE|Efficacy)[:\s]*([\d.]+)\s*(?:μmol\/J|umol\/J)/i);
  if (ppeMatch) specs.ppe = `${ppeMatch[1]} μmol/J`;

  // PPF
  const ppfMatch = text.match(/(?:PPF)[:\s]*([\d.]+)\s*(?:μmol\/S|umol\/S|μmol\/s)/i);
  if (ppfMatch) specs.ppf = `${ppfMatch[1]} μmol/S`;

  // Coverage
  const coverageMatch = text.match(/(?:Coverage|カバレッジ|Flower(?:ing)?\s*Coverage)[:\s]*([\d.]+)\s*[x×]\s*([\d.]+)\s*(ft|m|cm)/i);
  if (coverageMatch) specs.coverage = `${coverageMatch[1]}x${coverageMatch[2]} ${coverageMatch[3]}`;

  // LED chip info
  const ledMatch = text.match(/(Samsung\s*LM301[A-Z]*(?:\s*EVO)?|Bridgelux|Osram|Epistar)/i);
  if (ledMatch) specs.led = ledMatch[1];

  // LED count - be more specific to avoid matching model numbers
  const ledCountMatch = text.match(/(?:^|[^\w-])(\d{2,4})\s*(?:pcs|pieces|個)\s*(?:LEDs?|ダイオード|diodes)/i)
    || text.match(/(\d{2,4})\s*(?:LEDs?|ダイオード|diodes)\s*(?:chips?|beads?)/i)
    || text.match(/(?:LED\s*(?:chips?|beads?|count)[:\s]*)(\d{2,4})/i);
  if (ledCountMatch && parseInt(ledCountMatch[1]) >= 50) {
    specs.led_count = `${ledCountMatch[1]}個`;
  }

  // Lifespan
  const lifespanMatch = text.match(/(?:lifespan|lifetime|寿命)[:\s]*(\d{2,6})\s*(?:hours?|hrs?|時間)/i);
  if (lifespanMatch) specs.lifespan = `${parseInt(lifespanMatch[1]).toLocaleString()}時間`;

  // Warranty
  const warrantyMatch = text.match(/(\d+)\s*(?:year|years?|年)\s*(?:warranty|保証)/i)
    || text.match(/(?:warranty|保証)[:\s]*(\d+)\s*(?:year|years?|年)/i);
  if (warrantyMatch) specs.warranty = `${warrantyMatch[1]}年`;

  // Voltage
  const voltageMatch = text.match(/(?:voltage|input|電圧)[:\s]*((?:AC\s*)?[\d-]+(?:~[\d-]+)?)\s*V/i);
  if (voltageMatch) specs.voltage = voltageMatch[1] + 'V';

  // Size/Dimensions
  const sizeMatch = text.match(/(?:size|dimension|サイズ)[:\s]*([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]?\s*([\d.]*)\s*(mm|cm|inch|in)?/i);
  if (sizeMatch) {
    const unit = sizeMatch[4] || 'mm';
    specs.size = sizeMatch[3]
      ? `${sizeMatch[1]}×${sizeMatch[2]}×${sizeMatch[3]}${unit}`
      : `${sizeMatch[1]}×${sizeMatch[2]}${unit}`;
  }

  // Weight
  const weightMatch = text.match(/(?:weight|重量|重さ)[:\s]*([\d.]+)\s*(kg|g|lbs?|pounds?)/i);
  if (weightMatch) {
    const unit = weightMatch[2].toLowerCase().startsWith('lb') ? 'lbs' : weightMatch[2];
    specs.weight = `${weightMatch[1]}${unit}`;
  }

  return specs;
};

// Validate and clean feature text
const isValidFeature = (text) => {
  if (!text || text.length < 15 || text.length > 150) return false;
  // Exclude prices, navigation, incomplete sentences
  if (/\$|US\$|€|£|¥\d/.test(text)) return false;
  if (/^[a-z]/.test(text)) return false; // Starts with lowercase (probably mid-sentence)
  if (/^\d/.test(text)) return false; // Starts with number
  if (text.split(' ').length < 3 && !text.includes('：') && !text.includes(':')) return false;
  if (/account|sign|log|cart|checkout|wishlist|newsletter|subscribe|contact|shipping|return|policy|terms|privacy|cookie/i.test(text)) return false;
  return true;
};

// Translate common LED grow light features to Japanese
const translateFeature = (feature) => {
  // First validate
  if (!isValidFeature(feature)) return null;

  const translations = {
    'full spectrum': 'フルスペクトラム',
    'dimmable': '調光可能',
    'daisy chain': 'デイジーチェーン接続対応',
    'passive cooling': 'パッシブ冷却（ファンレス）',
    'fanless': 'ファンレス設計',
    'silent': '静音設計',
    'no fan': 'ファン不要',
    'waterproof': '防水',
    'ip65': 'IP65防水',
    'ip67': 'IP67防水',
    'samsung': 'Samsung LED搭載',
    'bridgelux': 'Bridgelux LED搭載',
    'osram': 'Osram LED搭載',
    'meanwell': 'Meanwellドライバー搭載',
    'veg': '生長期',
    'bloom': '開花期',
    'flower': '開花期',
    'seedling': '育苗',
    'clone': 'クローン',
    'high efficiency': '高効率',
    'energy saving': '省エネ',
    'low heat': '低発熱',
    'uniform light': '均一な光分布',
    'wide coverage': '広いカバレッジ',
    'commercial': '商業用',
    'professional': 'プロ仕様',
    'grow tent': 'グロウテント',
    'indoor plants': '室内植物',
    'led chips': 'LEDチップ',
    'diodes': 'ダイオード',
  };

  let translated = feature.trim();
  // Remove trailing periods and clean up
  translated = translated.replace(/\.\s*$/, '').replace(/\n/g, ' ').trim();

  for (const [en, ja] of Object.entries(translations)) {
    const regex = new RegExp(en, 'gi');
    translated = translated.replace(regex, ja);
  }
  return translated;
};

const generateJapaneseTitle = (originalTitle, brand, specs) => {
  // Try to extract model name (e.g., FC-E1500, TSL 2000, SE1500)
  const modelPatterns = [
    /\b(FC[-\s]?E?\d{3,})/i,      // FC-E1500, FC1500
    /\b(TSL[-\s]?\d{3,})/i,       // TSL 2000, TSL2000
    /\b(SE[-\s]?\d{3,})/i,        // SE1500
    /\b(SP[-\s]?\d{3,})/i,        // SP3000
    /\b(SF[-\s]?\d{3,})/i,        // SF1000, SF2000
    /\b(TS[-\s]?\d{3,})/i,        // TS1000, TS3000
    /\b([A-Z]{2,3}[-\s]?\d{3,}[A-Z]*)/i,  // Generic fallback
  ];

  let model = '';
  for (const pattern of modelPatterns) {
    const match = originalTitle.match(pattern);
    if (match) {
      model = match[1].toUpperCase().replace(/\s+/g, '-');
      break;
    }
  }

  let title = '';
  if (brand) title += `【${brand}】`;
  if (model) title += `${model} `;
  if (specs.power && !title.includes(specs.power)) title += `${specs.power} `;

  title += 'LEDグロウライト';

  if (specs.led) {
    if (specs.led.includes('Samsung')) {
      title += ' Samsung LED搭載';
    } else if (specs.led.includes('Bridgelux')) {
      title += ' Bridgelux LED搭載';
    }
  }

  title += ' | 植物育成ライト フルスペクトラム';

  return title;
};

const generateJapaneseDescription = (originalTitle, brand, specs, features, productInfo) => {
  let html = `<h2>${originalTitle}</h2>\n\n`;

  const brandText = brand || 'プレミアム';

  // Generate intro based on specs
  const powerText = specs.power ? `${specs.power}の` : '';
  const ledText = specs.led ? `${specs.led}チップ搭載、` : '';
  html += `<p><strong>${brandText}の${powerText}高性能LEDグロウライト</strong> - ${ledText}室内栽培のパフォーマンスを最大化。苗から開花まで、すべての成長段階を強力にサポートします。</p>\n\n`;

  // Specs section
  const specsList = [];
  if (specs.power) specsList.push(`<li><strong>消費電力:</strong> ${specs.power}</li>`);
  if (specs.ppf) specsList.push(`<li><strong>光量子束(PPF):</strong> ${specs.ppf}</li>`);
  if (specs.ppe) specsList.push(`<li><strong>効率(PPE):</strong> ${specs.ppe}</li>`);
  if (specs.coverage) specsList.push(`<li><strong>カバレッジ:</strong> ${specs.coverage}</li>`);
  if (specs.led) specsList.push(`<li><strong>LEDチップ:</strong> ${specs.led}</li>`);
  if (specs.led_count) specsList.push(`<li><strong>LED数:</strong> ${specs.led_count}</li>`);
  if (specs.lifespan) specsList.push(`<li><strong>寿命:</strong> ${specs.lifespan}</li>`);
  if (specs.warranty) specsList.push(`<li><strong>保証:</strong> ${specs.warranty}</li>`);
  if (specs.voltage) specsList.push(`<li><strong>電圧:</strong> ${specs.voltage}</li>`);
  if (specs.size) specsList.push(`<li><strong>サイズ:</strong> ${specs.size}</li>`);
  if (specs.weight) specsList.push(`<li><strong>重量:</strong> ${specs.weight}</li>`);

  if (specsList.length > 0) {
    html += `<h3>主要スペック</h3>\n<ul>\n${specsList.join('\n')}\n</ul>\n\n`;
  }

  // Generate features based on specs and product characteristics
  html += `<h3>特徴</h3>\n<ul>\n`;

  // Always include full spectrum
  html += `<li><strong>フルスペクトラム:</strong> 自然光に近い光スペクトルで、育苗から開花まで全成長段階に対応</li>\n`;

  // Add LED-specific features
  if (specs.led) {
    if (specs.led.includes('Samsung')) {
      html += `<li><strong>Samsung LED搭載:</strong> 業界最高クラスの発光効率を誇るサムスン製LEDチップを採用</li>\n`;
    } else if (specs.led.includes('Bridgelux')) {
      html += `<li><strong>Bridgelux LED搭載:</strong> 高品質なブリッジラックス製LEDで安定した光出力を実現</li>\n`;
    } else if (specs.led.includes('Osram')) {
      html += `<li><strong>Osram LED搭載:</strong> ドイツの名門オスラム社製LEDで高い信頼性を確保</li>\n`;
    }
  }

  // Add efficiency feature if PPE is available
  if (specs.ppe) {
    html += `<li><strong>高効率設計:</strong> ${specs.ppe}の高い発光効率で電気代を大幅削減</li>\n`;
  } else {
    html += `<li><strong>省エネ設計:</strong> 従来のHPSライトと比較して電気代を大幅削減</li>\n`;
  }

  // Add PPF feature if available
  if (specs.ppf) {
    html += `<li><strong>高い光量子束:</strong> ${specs.ppf}の豊富な光量で植物の光合成を促進</li>\n`;
  }

  // Add coverage feature if available
  if (specs.coverage) {
    html += `<li><strong>広いカバレッジ:</strong> ${specs.coverage}の栽培エリアに対応</li>\n`;
  }

  // Standard features
  html += `<li><strong>調光機能:</strong> 0-100%の無段階調光で成長段階に合わせた光量調整が可能</li>\n`;
  html += `<li><strong>静音設計:</strong> パッシブ冷却採用で静かな栽培環境を実現</li>\n`;

  html += `</ul>\n\n`;

  // Use extracted features as additional points if they're valid
  // More strict filtering to avoid garbage content
  const validFeatures = (features || []).filter(f => {
    if (!f || f.length < 25 || f.length > 120) return false;
    if (/LED Grow Light|Heat Mat|Thermostat|Combo|''|"|inches|Tent/i.test(f)) return false;
    if (/^\d|^[a-z]/.test(f)) return false; // Starts with number or lowercase
    if ((f.match(/[A-Z]/g) || []).length > f.length * 0.4) return false; // Too many caps
    return true;
  });
  if (validFeatures.length > 0) {
    html += `<h3>その他の特徴</h3>\n<ul>\n`;
    validFeatures.slice(0, 4).forEach(f => {
      html += `<li>${f}</li>\n`;
    });
    html += `</ul>\n\n`;
  }

  html += `<p><strong>${brandText}</strong>の確かな品質と性能で、初心者からプロまで室内栽培を成功に導きます。</p>`;

  return html;
};

async function fetchProduct(url, productName) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    console.error(`Fetching: ${url}`);
    // Use load to wait for full page
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });

    // Wait for dynamic content to load
    await page.waitForTimeout(5000);

    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2000);

    // Extract data from page
    const data = await page.evaluate(() => {
      const getMeta = (property) => {
        const el = document.querySelector(`meta[property="${property}"]`) ||
                   document.querySelector(`meta[name="${property}"]`);
        return el?.getAttribute('content') || '';
      };

      // Get og:image or first large product image
      let imageUrl = getMeta('og:image');
      if (!imageUrl) {
        // Try common product image selectors
        const selectors = [
          '.product-image img',
          '.product__media img',
          '[data-product-image]',
          '.woocommerce-product-gallery img',
          '.product-gallery img',
          'img[src*="product"]',
          'img[src*="cdn"]',
        ];
        for (const selector of selectors) {
          const img = document.querySelector(selector);
          if (img?.src) {
            imageUrl = img.src;
            break;
          }
        }
      }
      // Fallback to first large image
      if (!imageUrl) {
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || img.dataset?.src;
          if (src && (img.width > 200 || img.naturalWidth > 200) && !src.includes('logo') && !src.includes('icon')) {
            imageUrl = src;
            break;
          }
        }
      }

      // Extract features from common patterns
      const features = [];
      const excludePatterns = /account|sign in|log in|cart|checkout|wishlist|newsletter|subscribe|contact|about us|shipping|return|policy|terms|privacy|cookie|copyright|©/i;

      const featureSelectors = [
        '.product-features li',
        '.features li',
        '.feature-list li',
        '[class*="feature"] li',
        '.product-description li',
        '.product-info li',
        '.specs-list li',
        '.specification li',
        '[class*="spec"] li',
        '.product-details li',
        'table.specs td',
        'table.specifications td',
      ];
      for (const selector of featureSelectors) {
        const items = document.querySelectorAll(selector);
        items.forEach(item => {
          const text = item.innerText?.trim();
          if (text && text.length > 10 && text.length < 200 && !text.includes('$') && !excludePatterns.test(text)) {
            features.push(text);
          }
        });
        if (features.length >= 8) break;
      }

      // Also try to extract from text that looks like bullet points
      const bodyText = document.body.innerText || '';
      const bulletPatterns = bodyText.match(/[•●■◆✓✔]\s*([^\n•●■◆✓✔]{15,150})/g);
      if (bulletPatterns && features.length < 5) {
        bulletPatterns.slice(0, 10).forEach(b => {
          const text = b.replace(/^[•●■◆✓✔]\s*/, '').trim();
          if (text && !excludePatterns.test(text) && !features.includes(text)) {
            features.push(text);
          }
        });
      }

      // Extract LED grow light specific features from body text
      const ledFeaturePatterns = [
        /(?:full\s*spectrum|フルスペクトル)[^.]*\./gi,
        /(?:high\s*efficiency|高効率)[^.]*\./gi,
        /(?:low\s*heat|低発熱)[^.]*\./gi,
        /(?:energy\s*sav|省エネ)[^.]*\./gi,
        /(?:silent|quiet|fanless|静音|ファンレス)[^.]*\./gi,
        /(?:dimmable|dimming|調光)[^.]*\./gi,
        /(?:daisy\s*chain|デイジー)[^.]*\./gi,
        /(?:samsung|bridgelux|osram)[^.]*LED[^.]*\./gi,
        /(?:veg|bloom|flower|seedling|growth\s*stage)[^.]*\./gi,
        /(?:coverage|照射範囲|カバレッジ)[^.]*\./gi,
        /(?:uniform|均一)[^.]*light[^.]*\./gi,
        /(?:waterproof|防水|IP\d+)[^.]*\./gi,
      ];

      ledFeaturePatterns.forEach(pattern => {
        const matches = bodyText.match(pattern);
        if (matches && features.length < 10) {
          matches.slice(0, 2).forEach(m => {
            const text = m.trim().replace(/\.$/, '');
            if (text.length > 15 && text.length < 200 && !excludePatterns.test(text) && !features.some(f => f.includes(text) || text.includes(f))) {
              features.push(text);
            }
          });
        }
      });

      // Extract highlights/key points
      const highlights = [];
      const highlightSelectors = [
        'h3 + p',
        'h3 + ul li',
        '.highlight',
        '.key-feature',
        '[class*="benefit"]',
      ];
      for (const selector of highlightSelectors) {
        const items = document.querySelectorAll(selector);
        items.forEach(item => {
          const text = item.innerText?.trim();
          if (text && text.length > 20 && text.length < 300 && !highlights.includes(text)) {
            highlights.push(text);
          }
        });
        if (highlights.length >= 5) break;
      }

      // Try to find product intro/description paragraph
      let intro = '';
      const introSelectors = [
        '.product-description > p:first-of-type',
        '.product-info > p:first-of-type',
        '[class*="product"] > p:first-of-type',
        '.description p:first-of-type',
      ];
      for (const selector of introSelectors) {
        const el = document.querySelector(selector);
        if (el?.innerText?.trim().length > 50) {
          intro = el.innerText.trim();
          break;
        }
      }

      return {
        title: getMeta('og:title') || document.title || '',
        description: getMeta('og:description') || getMeta('description') || '',
        imageUrl: imageUrl || '',
        bodyText: document.body.innerText || '',
        html: document.body.innerHTML || '',
        features: features.slice(0, 8),
        highlights: highlights.slice(0, 5),
        intro: intro,
      };
    });

    const brand = extractBrandFromUrl(url);
    const originalTitle = productName || data.title;
    // Extract specs from both body text and HTML for better coverage
    const specs = extractSpecs(data.bodyText + ' ' + data.html);
    // Add brand to specs for reference
    if (brand) specs.brand = brand;

    // Prepare product info for description generation
    const productInfo = {
      intro: data.intro || '',
      highlights: data.highlights || [],
    };

    // Translate/adapt features for Japanese audience, filter out invalid ones
    const features = (data.features || [])
      .map(f => translateFeature(f))
      .filter(f => f !== null && f.length > 0);

    const result = {
      success: true,
      image_url: data.imageUrl || undefined,
      original_title: originalTitle,
      original_description: data.description?.trim() || undefined,
      generated_title: generateJapaneseTitle(originalTitle, brand, specs),
      generated_description: generateJapaneseDescription(originalTitle, brand, specs, features, productInfo),
      specs: Object.keys(specs).length > 0 ? specs : undefined,
      features: features.length > 0 ? features : undefined,
      source: new URL(url).hostname,
    };

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node scripts/fetch-product.js <url> [product_name]');
    console.error('  node scripts/fetch-product.js --update <product_id> <url>');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/fetch-product.js "https://www.mars-hydro.com/tsl-2000"');
    console.error('  node scripts/fetch-product.js --update 123 "https://www.mars-hydro.com/tsl-2000"');
    process.exit(1);
  }

  // Check for --update flag
  const updateIndex = args.indexOf('--update');
  if (updateIndex !== -1) {
    const productId = parseInt(args[updateIndex + 1], 10);
    const url = args[updateIndex + 2];

    if (!productId || !url) {
      console.error('Error: --update requires <product_id> and <url>');
      console.error('Usage: node scripts/fetch-product.js --update <product_id> <url>');
      process.exit(1);
    }

    try {
      const result = await fetchProduct(url, '');
      if (!result.success) {
        console.error('Error fetching URL:', result.error);
        process.exit(1);
      }

      updateDatabase(productId, result);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  } else {
    const url = args[0];
    const productName = args[1] || '';

    try {
      const result = await fetchProduct(url, productName);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

main();
