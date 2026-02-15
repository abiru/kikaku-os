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
import { escapeHtml } from '../../lib/html';
import { getActor } from '../../middleware/clerkAuth';
import { loadRbac, requirePermission } from '../../middleware/rbac';
import { validationErrorHandler } from '../../lib/validation';
import { PERMISSIONS } from '../../lib/schemas';

const app = new Hono<Env>();

// Apply RBAC middleware to all routes in this file
app.use('*', loadRbac);

// Request schema
const fetchProductSchema = z.object({
  url: z.string().url(),
  productName: z.string().optional(),
});

// URL validation to prevent SSRF attacks
const isUrlSafe = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Block localhost and loopback addresses
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname === '[::1]' ||
        hostname === '::1') {
      return false;
    }

    // Block private IP ranges (simplified check)
    // Note: This is a basic check. Production should use a more robust IP validation library
    if (hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
      return false;
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || // AWS, Azure, GCP metadata
        hostname.endsWith('.metadata.google.internal') ||
        hostname === 'metadata.google.internal') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

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
  if (ledMatch && ledMatch[1]) specs.led = ledMatch[1];

  // LED count
  const ledCountMatch = text.match(/(?:^|[^\w-])(\d{2,4})\s*(?:pcs|pieces|個)\s*(?:LEDs?|ダイオード|diodes)/i)
    || text.match(/(\d{2,4})\s*(?:LEDs?|ダイオード|diodes)\s*(?:chips?|beads?)/i)
    || text.match(/(?:LED\s*(?:chips?|beads?|count)[:\s]*)(\d{2,4})/i);
  if (ledCountMatch && ledCountMatch[1] && parseInt(ledCountMatch[1]) >= 50) {
    specs.led_count = `${ledCountMatch[1]}個`;
  }

  // Lifespan
  const lifespanMatch = text.match(/(?:lifespan|lifetime|寿命)[:\s]*(\d{2,6})\s*(?:hours?|hrs?|時間)/i);
  if (lifespanMatch && lifespanMatch[1]) specs.lifespan = `${parseInt(lifespanMatch[1]).toLocaleString()}時間`;

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
  if (weightMatch && weightMatch[1] && weightMatch[2]) {
    const unit = weightMatch[2].toLowerCase().startsWith('lb') ? 'lbs' : weightMatch[2];
    specs.weight = `${weightMatch[1]}${unit}`;
  }

  return specs;
};

// Generate Japanese title
const generateJapaneseTitle = (originalTitle: string, brand: string, specs: Record<string, string>): string => {
  // Escape external content first
  const safeTitle = escapeHtml(originalTitle);
  const safeBrand = escapeHtml(brand);
  const safeSpecs = Object.entries(specs).reduce((acc, [key, value]) => {
    acc[key] = escapeHtml(value);
    return acc;
  }, {} as Record<string, string>);

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
    // Match against original (unescaped) title for pattern matching
    const match = originalTitle.match(pattern);
    if (match) {
      // Escape the extracted model number
      model = escapeHtml((match[1] ?? '').toUpperCase().replace(/\s+/g, '-'));
      break;
    }
  }

  let title = '';
  if (safeBrand) title += `【${safeBrand}】`;
  if (model) title += `${model} `;
  if (safeSpecs.power && !title.includes(safeSpecs.power)) title += `${safeSpecs.power} `;

  title += 'LEDグロウライト';

  if (safeSpecs.led) {
    // Note: These checks are safe - we're checking our escaped strings
    if (safeSpecs.led.includes('Samsung')) {
      title += ' Samsung LED搭載';
    } else if (safeSpecs.led.includes('Bridgelux')) {
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
  // Escape all external content to prevent XSS
  const safeTitle = escapeHtml(originalTitle);
  const safeBrand = escapeHtml(brand) || 'プレミアム';
  const safeSpecs = Object.entries(specs).reduce((acc, [key, value]) => {
    acc[key] = escapeHtml(value);
    return acc;
  }, {} as Record<string, string>);

  let html = `<h2>${safeTitle}</h2>\n\n`;

  const powerText = safeSpecs.power ? `${safeSpecs.power}の` : '';
  const ledText = safeSpecs.led ? `${safeSpecs.led}チップ搭載、` : '';
  html += `<p><strong>${safeBrand}の${powerText}高性能LEDグロウライト</strong> - ${ledText}室内栽培のパフォーマンスを最大化。苗から開花まで、すべての成長段階を強力にサポートします。</p>\n\n`;

  // Specs section
  const specsList: string[] = [];
  if (safeSpecs.power) specsList.push(`<li><strong>消費電力:</strong> ${safeSpecs.power}</li>`);
  if (safeSpecs.ppf) specsList.push(`<li><strong>光量子束(PPF):</strong> ${safeSpecs.ppf}</li>`);
  if (safeSpecs.ppe) specsList.push(`<li><strong>効率(PPE):</strong> ${safeSpecs.ppe}</li>`);
  if (safeSpecs.coverage) specsList.push(`<li><strong>カバレッジ:</strong> ${safeSpecs.coverage}</li>`);
  if (safeSpecs.led) specsList.push(`<li><strong>LEDチップ:</strong> ${safeSpecs.led}</li>`);
  if (safeSpecs.led_count) specsList.push(`<li><strong>LED数:</strong> ${safeSpecs.led_count}</li>`);
  if (safeSpecs.lifespan) specsList.push(`<li><strong>寿命:</strong> ${safeSpecs.lifespan}</li>`);
  if (safeSpecs.warranty) specsList.push(`<li><strong>保証:</strong> ${safeSpecs.warranty}</li>`);
  if (safeSpecs.voltage) specsList.push(`<li><strong>電圧:</strong> ${safeSpecs.voltage}</li>`);
  if (safeSpecs.size) specsList.push(`<li><strong>サイズ:</strong> ${safeSpecs.size}</li>`);
  if (safeSpecs.weight) specsList.push(`<li><strong>重量:</strong> ${safeSpecs.weight}</li>`);

  if (specsList.length > 0) {
    html += `<h3>主要スペック</h3>\n<ul>\n${specsList.join('\n')}\n</ul>\n\n`;
  }

  // Features section
  html += `<h3>特徴</h3>\n<ul>\n`;
  html += `<li><strong>フルスペクトラム:</strong> 自然光に近い光スペクトルで、育苗から開花まで全成長段階に対応</li>\n`;

  if (safeSpecs.led) {
    // Note: These checks are safe because we're checking the escaped string
    // The strings "Samsung", "Bridgelux", "Osram" are our own constants, not user input
    if (safeSpecs.led.includes('Samsung')) {
      html += `<li><strong>Samsung LED搭載:</strong> 業界最高クラスの発光効率を誇るサムスン製LEDチップを採用</li>\n`;
    } else if (safeSpecs.led.includes('Bridgelux')) {
      html += `<li><strong>Bridgelux LED搭載:</strong> 高品質なブリッジラックス製LEDで安定した光出力を実現</li>\n`;
    } else if (safeSpecs.led.includes('Osram')) {
      html += `<li><strong>Osram LED搭載:</strong> ドイツの名門オスラム社製LEDで高い信頼性を確保</li>\n`;
    }
  }

  if (safeSpecs.ppe) {
    html += `<li><strong>高効率設計:</strong> ${safeSpecs.ppe}の高い発光効率で電気代を大幅削減</li>\n`;
  } else {
    html += `<li><strong>省エネ設計:</strong> 従来のHPSライトと比較して電気代を大幅削減</li>\n`;
  }

  if (safeSpecs.ppf) {
    html += `<li><strong>高い光量子束:</strong> ${safeSpecs.ppf}の豊富な光量で植物の光合成を促進</li>\n`;
  }

  if (safeSpecs.coverage) {
    html += `<li><strong>広いカバレッジ:</strong> ${safeSpecs.coverage}の栽培エリアに対応</li>\n`;
  }

  html += `<li><strong>調光機能:</strong> 0-100%の無段階調光で成長段階に合わせた光量調整が可能</li>\n`;
  html += `<li><strong>静音設計:</strong> パッシブ冷却採用で静かな栽培環境を実現</li>\n`;
  html += `</ul>\n\n`;

  html += `<p><strong>${safeBrand}</strong>の確かな品質と性能で、初心者からプロまで室内栽培を成功に導きます。</p>`;

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
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  zValidator('json', fetchProductSchema, validationErrorHandler),
  async (c) => {
    const { url, productName } = c.req.valid('json');

    if (!c.env.BROWSER) {
      return jsonError(c, 'Browser Rendering is not configured', 501);
    }

    // Validate URL to prevent SSRF attacks
    if (!isUrlSafe(url)) {
      return jsonError(c, 'Invalid or unsafe URL. Private IPs and localhost are not allowed.', 400);
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

// Note: /product-fetch/update endpoint removed to enforce Inbox pattern
// All AI-generated content must go through human approval via Inbox
// Use the /product-fetch endpoint to fetch data, then submit to Inbox for review

export default app;
