import type { APIRoute } from 'astro';
import { logError } from '../../../../lib/logger';
import {
  type FetchResult,
  extractMetaTags,
  extractMainImage,
  extractSpecs,
  extractBrand,
  extractBrandFromUrl,
  generateJapaneseTitle,
  generateJapaneseDescriptionMarkdown,
} from './fetch-url-helpers';
import { validateFetchUrl } from './fetch-url-validation';

export const prerender = false;

const FETCH_HEADERS = {
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
};

const jsonResponse = (data: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function handleManualInput(body: Record<string, unknown>): Response {
  const manualImageUrl = (body.image_url as string)?.trim();
  const manualDescription = (body.description as string)?.trim();
  const manualSpecs = (body.specs as Record<string, string>) || {};
  const productName = (body.product_name as string) || 'Product';
  const brand = manualSpecs.brand || '';

  return jsonResponse({
    success: true,
    image_url: manualImageUrl || undefined,
    original_title: productName,
    original_description: manualDescription || undefined,
    generated_title: generateJapaneseTitle(productName, brand, manualSpecs),
    generated_description: generateJapaneseDescriptionMarkdown(productName, brand, manualSpecs, manualDescription || ''),
    specs: manualSpecs,
    source: 'manual_input',
  }, 200);
}

function handleFetchFailure(body: Record<string, unknown>, url: string, parsedUrl: URL, statusCode: number): Response {
  const productName = (body.product_name as string)?.trim() || '';
  const brand = extractBrandFromUrl(url);

  if (productName) {
    return jsonResponse({
      success: true,
      original_title: productName,
      generated_title: generateJapaneseTitle(productName, brand, {}),
      generated_description: generateJapaneseDescriptionMarkdown(productName, brand, {}, ''),
      source: parsedUrl.hostname,
      warning: `URLの取得に失敗しました (${statusCode})。商品名からコンテンツを生成しました。`,
    }, 200);
  }

  return jsonResponse({
    success: false,
    error: `Failed to fetch URL: ${statusCode}. 商品名を入力すると、URLが取得できなくてもコンテンツを生成できます。`,
  }, 400);
}

function processHtml(html: string, url: string, parsedUrl: URL): Response {
  const meta = extractMetaTags(html);

  const imageUrl = meta.ogImage || extractMainImage(html, url) || undefined;
  const originalTitle = meta.ogTitle || meta.title || '';
  const originalDescription = meta.ogDescription || meta.description || '';
  const specs = extractSpecs(html);
  const brand = extractBrand(html, url);

  const generatedTitle = generateJapaneseTitle(originalTitle, brand, specs);
  const generatedDescription = generateJapaneseDescriptionMarkdown(originalTitle, brand, specs, originalDescription);

  const result: FetchResult = {
    success: true,
    image_url: imageUrl,
    original_title: originalTitle,
    original_description: originalDescription,
    generated_title: generatedTitle,
    generated_description: generatedDescription,
    specs: Object.keys(specs).length > 0 ? specs : undefined,
    source: parsedUrl.hostname,
  };

  return jsonResponse(result, 200);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const url = body.url?.trim();
    const manualImageUrl = body.image_url?.trim();
    const manualDescription = body.description?.trim();
    const manualSpecs = body.specs || {};

    // If manual data is provided, generate from it
    if (manualImageUrl || manualDescription || Object.keys(manualSpecs).length > 0) {
      return handleManualInput(body);
    }

    // Validate URL (includes SSRF protection)
    const validation = validateFetchUrl(url);
    if (!validation.valid) {
      return jsonResponse({ success: false, error: validation.error }, validation.status);
    }

    const { parsedUrl } = validation;

    // Fetch the URL with browser-like headers
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      return handleFetchFailure(body, url, parsedUrl, response.status);
    }

    const html = await response.text();
    return processHtml(html, url, parsedUrl);

  } catch (error) {
    logError('Fetch URL error', error, { page: 'api/admin/products/fetch-url', action: 'fetchUrl' });
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
};
