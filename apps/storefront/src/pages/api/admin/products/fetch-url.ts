import type { APIRoute } from 'astro';

export const prerender = false;

type FetchResult = {
  success: boolean;
  image_url?: string;
  original_title?: string;
  original_description?: string;
  generated_title?: string;
  generated_description?: string;
  specs?: Record<string, string>;
  source?: string;
  error?: string;
};

const extractMetaTags = (html: string): Record<string, string> => {
  const meta: Record<string, string> = {};

  // og:image
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImageMatch) meta.ogImage = ogImageMatch[1];

  // og:title
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitleMatch) meta.ogTitle = ogTitleMatch[1];

  // og:description
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDescMatch) meta.ogDescription = ogDescMatch[1];

  // description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (descMatch) meta.description = descMatch[1];

  // title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();

  return meta;
};

const extractMainImage = (html: string, baseUrl: string): string | null => {
  // Try product image patterns
  const patterns = [
    // og:image already extracted in meta
    // WordPress/WooCommerce
    /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
    // Common product image classes
    /<img[^>]+class=["'][^"']*product[^"']*image[^"']*["'][^>]+src=["']([^"']+)["']/i,
    // data-src for lazy loading
    /<img[^>]+data-src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/i,
    // srcset first image
    /<img[^>]+srcset=["']([^\s"']+)/i,
    // First large image
    /<img[^>]+src=["']([^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["'][^>]+(?:width|height)=["']?[4-9]\d{2,}/i,
    // Any product-related image
    /<img[^>]+src=["']([^"']*product[^"']*(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let url = match[1];
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        const base = new URL(baseUrl);
        url = `${base.protocol}//${base.host}${url}`;
      }
      return url;
    }
  }

  return null;
};

const extractSpecs = (html: string): Record<string, string> => {
  const specs: Record<string, string> = {};

  // Power/Wattage
  const powerMatch = html.match(/(?:消費電力|Power|Wattage|Actual\s*Power)[:\s]*(\d+)\s*[Ww]/i);
  if (powerMatch) specs.power = `${powerMatch[1]}W`;

  // PPE/Efficacy
  const ppeMatch = html.match(/(?:PPE|Efficacy)[:\s]*([\d.]+)\s*(?:μmol\/J|umol\/J)/i);
  if (ppeMatch) specs.ppe = `${ppeMatch[1]} μmol/J`;

  // PPF
  const ppfMatch = html.match(/(?:PPF)[:\s]*([\d.]+)\s*(?:μmol\/S|umol\/S|μmol\/s)/i);
  if (ppfMatch) specs.ppf = `${ppfMatch[1]} μmol/S`;

  // Coverage - various formats
  const coverageMatch = html.match(/(?:Coverage|カバレッジ|Flower(?:ing)?\s*Coverage)[:\s]*([\d.]+)\s*[x×]\s*([\d.]+)\s*(ft|m|cm)/i);
  if (coverageMatch) specs.coverage = `${coverageMatch[1]}x${coverageMatch[2]} ${coverageMatch[3]}`;

  // LED chip info
  const ledMatch = html.match(/(Samsung\s*LM301[A-Z]*(?:\s*EVO)?|Bridgelux|Osram|Epistar)/i);
  if (ledMatch) specs.led = ledMatch[1];

  // LED count
  const ledCountMatch = html.match(/(\d+)\s*(?:pcs|pieces|個)?\s*(?:LEDs?|ダイオード|diodes)/i);
  if (ledCountMatch) specs.led_count = `${ledCountMatch[1]}個`;

  // Spectrum
  const spectrumMatch = html.match(/(?:Full\s*Spectrum|フルスペクトラム|Spectrum)[:\s]*([^<\n]+)/i);
  if (spectrumMatch && spectrumMatch[1].length < 100) specs.spectrum = spectrumMatch[1].trim();

  return specs;
};

const extractBrandFromUrl = (url: string): string => {
  const urlMatch = url.match(/(?:www\.)?([^.]+)\./i);
  if (urlMatch) {
    const domain = urlMatch[1].toLowerCase();
    if (domain.includes('mars')) return 'Mars Hydro';
    if (domain.includes('spider')) return 'Spider Farmer';
    if (domain.includes('viparspectra')) return 'VIPARSPECTRA';
    if (domain.includes('gavita')) return 'Gavita';
    if (domain.includes('hlg') || domain.includes('horticulture')) return 'HLG';
  }
  return '';
};

const extractBrand = (html: string, url: string): string => {
  // Try to extract from URL first
  const brandFromUrl = extractBrandFromUrl(url);
  if (brandFromUrl) return brandFromUrl;

  // Try to extract from HTML
  const brandPatterns = [
    /Mars\s*Hydro/i,
    /Spider\s*Farmer/i,
    /VIPARSPECTRA/i,
    /Gavita/i,
    /HLG|Horticulture\s*Lighting\s*Group/i,
  ];

  for (const pattern of brandPatterns) {
    const match = html.match(pattern);
    if (match) return match[0];
  }

  return '';
};

const generateJapaneseTitle = (originalTitle: string, brand: string, specs: Record<string, string>): string => {
  // Extract model from title
  const modelMatch = originalTitle.match(/([A-Z]{2,}[-\s]?\d{3,}[A-Z]*)/i);
  const model = modelMatch ? modelMatch[1].toUpperCase() : '';

  let title = '';
  if (brand) title += `【${brand}】`;
  if (model) title += `${model} `;
  if (specs.power) title += `${specs.power} `;

  title += 'LEDグロウライト';

  if (specs.led && specs.led.includes('Samsung')) {
    title += ' Samsung LED搭載';
  }

  title += ' | 植物育成ライト フルスペクトラム';

  return title;
};

const generateJapaneseDescription = (
  originalTitle: string,
  brand: string,
  specs: Record<string, string>,
  originalDesc: string
): string => {
  let html = `<h2>${originalTitle}</h2>\n\n`;

  // Intro
  const brandText = brand || 'プレミアム';
  html += `<p><strong>プロも認める高効率フルスペクトラムLED</strong> - 室内栽培のパフォーマンスを最大化する${brandText}の最新グロウライト。苗から開花まで、すべての成長段階を強力にサポートします。</p>\n\n`;

  // Specs section
  const specsList: string[] = [];
  if (specs.power) specsList.push(`<li><strong>消費電力:</strong> ${specs.power}</li>`);
  if (specs.ppf) specsList.push(`<li><strong>光量子束(PPF):</strong> ${specs.ppf}</li>`);
  if (specs.ppe) specsList.push(`<li><strong>効率(PPE):</strong> ${specs.ppe}</li>`);
  if (specs.coverage) specsList.push(`<li><strong>カバレッジ:</strong> ${specs.coverage}</li>`);
  if (specs.led) specsList.push(`<li><strong>LEDチップ:</strong> ${specs.led}</li>`);
  if (specs.led_count) specsList.push(`<li><strong>LED数:</strong> ${specs.led_count}</li>`);

  if (specsList.length > 0) {
    html += `<h3>主要スペック</h3>\n<ul>\n${specsList.join('\n')}\n</ul>\n\n`;
  }

  // Features
  html += `<h3>特徴</h3>\n<ul>\n`;
  html += `<li><strong>フルスペクトラム:</strong> 自然光に近い光スペクトルで、すべての成長段階に対応</li>\n`;
  html += `<li><strong>高効率設計:</strong> 従来のHPSライトと比較して電気代を大幅削減</li>\n`;
  html += `<li><strong>静音設計:</strong> パッシブ冷却採用で静かな栽培環境を実現</li>\n`;
  html += `<li><strong>調光機能:</strong> 植物の成長段階に合わせて光量を調整可能</li>\n`;
  html += `</ul>\n\n`;

  html += `<p>初心者からプロまで、確かな品質と性能で室内栽培を成功に導きます。</p>`;

  return html;
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const url = body.url?.trim();
    const manualImageUrl = body.image_url?.trim();
    const manualDescription = body.description?.trim();
    const manualSpecs = body.specs || {};

    // If manual data is provided, generate from it
    if (manualImageUrl || manualDescription || Object.keys(manualSpecs).length > 0) {
      const productName = body.product_name || 'Product';
      const brand = manualSpecs.brand || '';

      return new Response(JSON.stringify({
        success: true,
        image_url: manualImageUrl || undefined,
        original_title: productName,
        original_description: manualDescription || undefined,
        generated_title: generateJapaneseTitle(productName, brand, manualSpecs),
        generated_description: generateJapaneseDescription(productName, brand, manualSpecs, manualDescription || ''),
        specs: manualSpecs,
        source: 'manual_input'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the URL with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      // URL fetch failed - generate content from product name and URL-based brand
      const productName = body.product_name?.trim() || '';
      const brand = extractBrandFromUrl(url);

      if (productName) {
        // Generate content even without fetching the page
        const generatedTitle = generateJapaneseTitle(productName, brand, {});
        const generatedDescription = generateJapaneseDescription(productName, brand, {}, '');

        return new Response(JSON.stringify({
          success: true,
          original_title: productName,
          generated_title: generatedTitle,
          generated_description: generatedDescription,
          source: parsedUrl.hostname,
          warning: `URLの取得に失敗しました (${response.status})。商品名からコンテンツを生成しました。`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: false,
        error: `Failed to fetch URL: ${response.status}. 商品名を入力すると、URLが取得できなくてもコンテンツを生成できます。`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const html = await response.text();
    const meta = extractMetaTags(html);

    // Extract all data
    const imageUrl = meta.ogImage || extractMainImage(html, url) || undefined;
    const originalTitle = meta.ogTitle || meta.title || '';
    const originalDescription = meta.ogDescription || meta.description || '';
    const specs = extractSpecs(html);
    const brand = extractBrand(html, url);

    // Generate Japanese content
    const generatedTitle = generateJapaneseTitle(originalTitle, brand, specs);
    const generatedDescription = generateJapaneseDescription(originalTitle, brand, specs, originalDescription);

    const result: FetchResult = {
      success: true,
      image_url: imageUrl,
      original_title: originalTitle,
      original_description: originalDescription,
      generated_title: generatedTitle,
      generated_description: generatedDescription,
      specs: Object.keys(specs).length > 0 ? specs : undefined,
      source: parsedUrl.hostname
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fetch URL error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
