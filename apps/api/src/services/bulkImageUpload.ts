import { putImage, deleteKey } from '../lib/r2';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, MAX_IMAGES_PER_PRODUCT } from '../lib/schemas/product';

export type ImageMapping = {
  product_id: number;
  product_title: string;
  image_urls: string[];
  existing_r2_images: number;
};

export type ParseResult = {
  mappings: ImageMapping[];
  errors: Array<{ row: number; error: string }>;
  summary: {
    total_products: number;
    total_images: number;
    skipped: number;
  };
};

export type UploadResult = {
  success_count: number;
  failed_count: number;
  images_added: number;
  errors: Array<{ product_id: number; url: string; error: string }>;
};

type CSVRow = {
  product_id: string;
  image_url: string;
  position?: string;
};

type JSONEntry = {
  product_id: number;
  image_urls: string[];
};

const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '::1', 'metadata.google.internal'];
const BLOCKED_IP_RANGES = [
  /^10\./,                        // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,                  // 192.168.0.0/16
  /^169\.254\./,                  // 169.254.0.0/16 (link-local, includes AWS/GCP metadata)
];

const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) return false;
    if (BLOCKED_IP_RANGES.some(regex => regex.test(hostname))) return false;

    return true;
  } catch {
    return false;
  }
};

const getExtensionFromUrl = (url: string): string => {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    return ext || 'jpg';
  } catch {
    return 'jpg';
  }
};

const getContentTypeFromExtension = (ext: string): string => {
  const map: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  return map[ext] || 'image/jpeg';
};

export const parseCSV = async (content: string, db: D1Database): Promise<ParseResult> => {
  const lines = content.split('\n').filter(line => line.trim());
  const errors: Array<{ row: number; error: string }> = [];
  const productMap = new Map<number, string[]>();

  if (lines.length === 0) {
    return {
      mappings: [],
      errors: [{ row: 0, error: 'Empty file' }],
      summary: { total_products: 0, total_images: 0, skipped: 0 }
    };
  }

  // Skip header row
  const dataLines = lines.slice(1);

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // +2 because row 1 is header
    const line = dataLines[i].trim();

    if (!line) continue;

    const parts = line.split(',').map(p => p.trim());

    if (parts.length < 2) {
      errors.push({ row: rowNum, error: 'Invalid CSV format (expected: product_id,image_url)' });
      continue;
    }

    const productId = parseInt(parts[0], 10);
    const imageUrl = parts[1];

    if (isNaN(productId) || productId <= 0) {
      errors.push({ row: rowNum, error: `Invalid product ID: ${parts[0]}` });
      continue;
    }

    if (!isValidUrl(imageUrl)) {
      errors.push({ row: rowNum, error: `Invalid URL: ${imageUrl}` });
      continue;
    }

    if (!productMap.has(productId)) {
      productMap.set(productId, []);
    }

    productMap.get(productId)!.push(imageUrl);
  }

  // Validate products exist and get metadata
  const mappings: ImageMapping[] = [];

  for (const [productId, imageUrls] of productMap.entries()) {
    const product = await db.prepare(
      'SELECT id, title FROM products WHERE id = ?'
    ).bind(productId).first<{ id: number; title: string }>();

    if (!product) {
      errors.push({ row: 0, error: `Product ID ${productId} not found` });
      continue;
    }

    const existingCount = await db.prepare(
      'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?'
    ).bind(productId).first<{ count: number }>();

    const existing = existingCount?.count || 0;

    if (existing + imageUrls.length > MAX_IMAGES_PER_PRODUCT) {
      errors.push({
        row: 0,
        error: `Product ${productId} would exceed max ${MAX_IMAGES_PER_PRODUCT} images (current: ${existing}, adding: ${imageUrls.length})`
      });
      continue;
    }

    mappings.push({
      product_id: productId,
      product_title: product.title,
      image_urls: imageUrls,
      existing_r2_images: existing
    });
  }

  const totalImages = mappings.reduce((sum, m) => sum + m.image_urls.length, 0);

  return {
    mappings,
    errors,
    summary: {
      total_products: mappings.length,
      total_images: totalImages,
      skipped: errors.length
    }
  };
};

export const parseJSON = async (content: string, db: D1Database): Promise<ParseResult> => {
  const errors: Array<{ row: number; error: string }> = [];
  let entries: JSONEntry[];

  try {
    entries = JSON.parse(content);
  } catch (e) {
    return {
      mappings: [],
      errors: [{ row: 0, error: 'Invalid JSON format' }],
      summary: { total_products: 0, total_images: 0, skipped: 0 }
    };
  }

  if (!Array.isArray(entries)) {
    return {
      mappings: [],
      errors: [{ row: 0, error: 'JSON must be an array of entries' }],
      summary: { total_products: 0, total_images: 0, skipped: 0 }
    };
  }

  const mappings: ImageMapping[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rowNum = i + 1;

    if (!entry.product_id || !entry.image_urls || !Array.isArray(entry.image_urls)) {
      errors.push({ row: rowNum, error: 'Missing product_id or image_urls array' });
      continue;
    }

    const productId = entry.product_id;

    if (isNaN(productId) || productId <= 0) {
      errors.push({ row: rowNum, error: `Invalid product ID: ${productId}` });
      continue;
    }

    const invalidUrls = entry.image_urls.filter(url => !isValidUrl(url));
    if (invalidUrls.length > 0) {
      errors.push({ row: rowNum, error: `Invalid URLs: ${invalidUrls.join(', ')}` });
      continue;
    }

    const product = await db.prepare(
      'SELECT id, title FROM products WHERE id = ?'
    ).bind(productId).first<{ id: number; title: string }>();

    if (!product) {
      errors.push({ row: rowNum, error: `Product ID ${productId} not found` });
      continue;
    }

    const existingCount = await db.prepare(
      'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?'
    ).bind(productId).first<{ count: number }>();

    const existing = existingCount?.count || 0;

    if (existing + entry.image_urls.length > MAX_IMAGES_PER_PRODUCT) {
      errors.push({
        row: rowNum,
        error: `Product ${productId} would exceed max ${MAX_IMAGES_PER_PRODUCT} images (current: ${existing}, adding: ${entry.image_urls.length})`
      });
      continue;
    }

    mappings.push({
      product_id: productId,
      product_title: product.title,
      image_urls: entry.image_urls,
      existing_r2_images: existing
    });
  }

  const totalImages = mappings.reduce((sum, m) => sum + m.image_urls.length, 0);

  return {
    mappings,
    errors,
    summary: {
      total_products: mappings.length,
      total_images: totalImages,
      skipped: errors.length
    }
  };
};

const downloadImageFromUrl = async (
  url: string,
  maxRetries = 3
): Promise<{ data: ArrayBuffer; contentType: string } | null> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.startsWith('image/')) {
        throw new Error(`Invalid content-type: ${contentType}`);
      }

      if (!ALLOWED_IMAGE_TYPES.includes(contentType as any)) {
        throw new Error(`Unsupported image type: ${contentType}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
        throw new Error(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB size limit`);
      }

      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
        throw new Error(`Image exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB size limit`);
      }

      return { data: arrayBuffer, contentType };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on validation errors
      if (error instanceof Error &&
          (error.message.includes('Invalid content-type') ||
           error.message.includes('Unsupported image type') ||
           error.message.includes('exceeds'))) {
        break;
      }

      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  return null;
};

export const executeBulkImageUpload = async (
  db: D1Database,
  r2: R2Bucket,
  uploadItems: ImageMapping[]
): Promise<UploadResult> => {
  let successCount = 0;
  let failedCount = 0;
  let imagesAdded = 0;
  const errors: Array<{ product_id: number; url: string; error: string }> = [];

  for (const item of uploadItems) {
    const uploadedKeys: string[] = [];
    let productFailed = false;

    try {
      // Get next position for this product
      const maxPosResult = await db.prepare(
        'SELECT MAX(position) as max_pos FROM product_images WHERE product_id = ?'
      ).bind(item.product_id).first<{ max_pos: number | null }>();

      let nextPosition = (maxPosResult?.max_pos ?? -1) + 1;

      // Download and upload each image
      for (const imageUrl of item.image_urls) {
        try {
          const downloadResult = await downloadImageFromUrl(imageUrl);

          if (!downloadResult) {
            errors.push({
              product_id: item.product_id,
              url: imageUrl,
              error: 'Failed to download image after retries'
            });
            productFailed = true;
            break;
          }

          const { data, contentType } = downloadResult;
          const uuid = crypto.randomUUID();
          const ext = getExtensionFromUrl(imageUrl);
          const r2Key = `products/${item.product_id}/${uuid}.${ext}`;

          // Upload to R2
          await putImage(r2, r2Key, data, contentType);
          uploadedKeys.push(r2Key);

          // Insert into database
          await db.prepare(
            `INSERT INTO product_images (product_id, r2_key, filename, content_type, size_bytes, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          ).bind(
            item.product_id,
            r2Key,
            imageUrl.split('/').pop() || `image-${uuid}`,
            contentType,
            data.byteLength,
            nextPosition
          ).run();

          nextPosition++;
          imagesAdded++;
        } catch (imageError) {
          errors.push({
            product_id: item.product_id,
            url: imageUrl,
            error: imageError instanceof Error ? imageError.message : 'Unknown error'
          });
          productFailed = true;
          break;
        }
      }

      if (productFailed) {
        // Rollback: delete uploaded images for this product
        for (const key of uploadedKeys) {
          try {
            await deleteKey(r2, key);
            await db.prepare(
              'DELETE FROM product_images WHERE r2_key = ?'
            ).bind(key).run();
            imagesAdded--; // Decrement counter for rolled back image
          } catch (rollbackError) {
            console.error(`Failed to rollback ${key}:`, rollbackError);
          }
        }
        failedCount++;
      } else {
        successCount++;
      }
    } catch (productError) {
      errors.push({
        product_id: item.product_id,
        url: 'product-level',
        error: productError instanceof Error ? productError.message : 'Unknown error'
      });
      failedCount++;
    }
  }

  return {
    success_count: successCount,
    failed_count: failedCount,
    images_added: imagesAdded,
    errors
  };
};
