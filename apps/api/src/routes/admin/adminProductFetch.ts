/**
 * Product Fetch API using Cloudflare Browser Rendering
 *
 * This endpoint fetches product data from external URLs using headless browser
 * and extracts information for updating products.
 *
 * Ported from scripts/fetch-product.js to run on Cloudflare Workers.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { launch, type BrowserWorker } from '@cloudflare/playwright';
import { Env } from '../../env';
import { jsonOk, jsonError } from '../../lib/http';
import { getActor } from '../../middleware/clerkAuth';
import { validationErrorHandler } from '../../lib/validation';

const app = new Hono<Env>();

// Request schema
const fetchProductSchema = z.object({
  url: z.string().url(),
  productName: z.string().optional(),
});

const updateProductSchema = z.object({
  url: z.string().url(),
  productId: z.number().int().positive(),
});

// Extract brand from URL hostname
const extractBrandFromUrl = (url: string): string => {
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

// Extract specs from text
const extractSpecs = (text: string): Record<string, string> => {
  const specs: Record<string, string> = {};

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

  // LED count
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

// Generate Japanese title
const generateJapaneseTitle = (originalTitle: string, brand: string, specs: Record<string, string>): string => {
  const modelPatterns = [
    /\b(FC[-\s]?E?\d{3,})/i,
    /\b(TSL[-\s]?\d{3,})/i,
    /\b(SE[-\s]?\d{3,})/i,
    /\b(SP[-\s]?\d{3,})/i,
    /\b(SF[-\s]?\d{3,})/i,
    /\b(TS[-\s]?\d{3,})/i,
    /\b([A-Z]{2,3}[-\s]?\d{3,}[A-Z]*)/i,
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

// Generate Japanese description
const generateJapaneseDescription = (
  originalTitle: string,
  brand: string,
  specs: Record<string, string>
): string => {
  let html = `<h2>${originalTitle}</h2>\n\n`;
  const brandText = brand || 'プレミアム';

  const powerText = specs.power ? `${specs.power}の` : '';
  const ledText = specs.led ? `${specs.led}チップ搭載、` : '';
  html += `<p><strong>${brandText}の${powerText}高性能LEDグロウライト</strong> - ${ledText}室内栽培のパフォーマンスを最大化。苗から開花まで、すべての成長段階を強力にサポートします。</p>\n\n`;

  // Specs section
  const specsList: string[] = [];
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

  // Features section
  html += `<h3>特徴</h3>\n<ul>\n`;
  html += `<li><strong>フルスペクトラム:</strong> 自然光に近い光スペクトルで、育苗から開花まで全成長段階に対応</li>\n`;

  if (specs.led) {
    if (specs.led.includes('Samsung')) {
      html += `<li><strong>Samsung LED搭載:</strong> 業界最高クラスの発光効率を誇るサムスン製LEDチップを採用</li>\n`;
    } else if (specs.led.includes('Bridgelux')) {
      html += `<li><strong>Bridgelux LED搭載:</strong> 高品質なブリッジラックス製LEDで安定した光出力を実現</li>\n`;
    } else if (specs.led.includes('Osram')) {
      html += `<li><strong>Osram LED搭載:</strong> ドイツの名門オスラム社製LEDで高い信頼性を確保</li>\n`;
    }
  }

  if (specs.ppe) {
    html += `<li><strong>高効率設計:</strong> ${specs.ppe}の高い発光効率で電気代を大幅削減</li>\n`;
  } else {
    html += `<li><strong>省エネ設計:</strong> 従来のHPSライトと比較して電気代を大幅削減</li>\n`;
  }

  if (specs.ppf) {
    html += `<li><strong>高い光量子束:</strong> ${specs.ppf}の豊富な光量で植物の光合成を促進</li>\n`;
  }

  if (specs.coverage) {
    html += `<li><strong>広いカバレッジ:</strong> ${specs.coverage}の栽培エリアに対応</li>\n`;
  }

  html += `<li><strong>調光機能:</strong> 0-100%の無段階調光で成長段階に合わせた光量調整が可能</li>\n`;
  html += `<li><strong>静音設計:</strong> パッシブ冷却採用で静かな栽培環境を実現</li>\n`;
  html += `</ul>\n\n`;

  html += `<p><strong>${brandText}</strong>の確かな品質と性能で、初心者からプロまで室内栽培を成功に導きます。</p>`;

  return html;
};

// Fetch product data using Browser Rendering
async function fetchProductData(
  browserBinding: BrowserWorker,
  url: string,
  productName?: string
) {
  const browser = await launch(browserBinding);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });

    // Wait for dynamic content
    await page.waitForTimeout(5000);

    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2000);

    // Extract data from page
    const data = await page.evaluate(() => {
      const getMeta = (property: string): string => {
        const el = document.querySelector(`meta[property="${property}"]`) ||
                   document.querySelector(`meta[name="${property}"]`);
        return el?.getAttribute('content') || '';
      };

      // Get og:image or first large product image
      let imageUrl = getMeta('og:image');
      if (!imageUrl) {
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
          const img = document.querySelector(selector) as HTMLImageElement | null;
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
          const src = img.src || (img as HTMLImageElement).dataset?.src;
          if (src && (img.width > 200 || img.naturalWidth > 200) && !src.includes('logo') && !src.includes('icon')) {
            imageUrl = src;
            break;
          }
        }
      }

      // Extract features
      const features: string[] = [];
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
          const text = (item as HTMLElement).innerText?.trim();
          if (text && text.length > 10 && text.length < 200 && !text.includes('$') && !excludePatterns.test(text)) {
            features.push(text);
          }
        });
        if (features.length >= 8) break;
      }

      return {
        title: getMeta('og:title') || document.title || '',
        description: getMeta('og:description') || getMeta('description') || '',
        imageUrl: imageUrl || '',
        bodyText: document.body.innerText || '',
        features: features.slice(0, 8),
      };
    });

    const brand = extractBrandFromUrl(url);
    const originalTitle = productName || data.title;
    const specs = extractSpecs(data.bodyText);
    if (brand) specs.brand = brand;

    return {
      success: true,
      image_url: data.imageUrl || undefined,
      original_title: originalTitle,
      original_description: data.description?.trim() || undefined,
      generated_title: generateJapaneseTitle(originalTitle, brand, specs),
      generated_description: generateJapaneseDescription(originalTitle, brand, specs),
      specs: Object.keys(specs).length > 0 ? specs : undefined,
      features: data.features.length > 0 ? data.features : undefined,
      source: new URL(url).hostname,
    };
  } finally {
    await browser.close();
  }
}

// POST /product-fetch - Fetch product data from URL
app.post(
  '/product-fetch',
  zValidator('json', fetchProductSchema, validationErrorHandler),
  async (c) => {
    const { url, productName } = c.req.valid('json');

    if (!c.env.BROWSER) {
      return jsonError(c, 'Browser Rendering is not configured', 501);
    }

    try {
      const result = await fetchProductData(c.env.BROWSER, url, productName);

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'fetch_product_url',
        url,
        JSON.stringify({ success: result.success, source: result.source })
      ).run();

      return jsonOk(c, result);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return jsonError(c, `Failed to fetch product: ${error}`);
    }
  }
);

// POST /product-fetch/update - Fetch and update product
app.post(
  '/product-fetch/update',
  zValidator('json', updateProductSchema, validationErrorHandler),
  async (c) => {
    const { url, productId } = c.req.valid('json');

    if (!c.env.BROWSER) {
      return jsonError(c, 'Browser Rendering is not configured', 501);
    }

    try {
      // Check if product exists
      const existing = await c.env.DB.prepare(
        'SELECT id, title, metadata FROM products WHERE id = ?'
      ).bind(productId).first();

      if (!existing) {
        return jsonError(c, 'Product not found', 404);
      }

      // Fetch product data
      const result = await fetchProductData(c.env.BROWSER, url);

      if (!result.success) {
        return jsonError(c, 'Failed to fetch product data');
      }

      // Update product
      const updates: string[] = [];
      const bindings: (string | number)[] = [];

      if (result.generated_title) {
        updates.push('title = ?');
        bindings.push(result.generated_title);
      }

      if (result.generated_description) {
        updates.push('description = ?');
        bindings.push(result.generated_description);
      }

      // Update metadata
      let metadata: Record<string, unknown> = {};
      try {
        const existingMeta = (existing as { metadata?: string }).metadata;
        if (existingMeta) {
          metadata = JSON.parse(existingMeta);
        }
      } catch {
        // ignore
      }

      if (result.image_url) metadata.image_url = result.image_url;
      if (result.specs) metadata.specs = result.specs;
      metadata.source = result.source;
      metadata.fetched_at = new Date().toISOString();

      updates.push('metadata = ?');
      bindings.push(JSON.stringify(metadata));

      updates.push('updated_at = datetime(\'now\')');
      bindings.push(productId);

      await c.env.DB.prepare(
        `UPDATE products SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...bindings).run();

      // Audit log
      await c.env.DB.prepare(
        'INSERT INTO audit_logs (actor, action, target, metadata) VALUES (?, ?, ?, ?)'
      ).bind(
        getActor(c),
        'update_product_from_url',
        `product:${productId}`,
        JSON.stringify({ url, source: result.source })
      ).run();

      return jsonOk(c, {
        message: 'Product updated successfully',
        productId,
        ...result,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return jsonError(c, `Failed to update product: ${error}`);
    }
  }
);

export default app;
