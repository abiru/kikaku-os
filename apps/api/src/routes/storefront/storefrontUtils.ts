import type { StorefrontRow, StorefrontProduct } from './storefrontTypes';

export const extractImageUrl = (metadata: string | null): string | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed.image_url || null;
  } catch {
    return null;
  }
};

const isDirectAssetUrl = (value: string): boolean => {
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://');
};

export const resolveAssetUrl = (assetKey: string, baseUrl: string): string => {
  if (isDirectAssetUrl(assetKey)) return assetKey;
  return `${baseUrl}/r2?key=${encodeURIComponent(assetKey)}`;
};

export const rowsToProducts = (rows: StorefrontRow[], baseUrl: string): StorefrontProduct[] => {
  const products = new Map<number, StorefrontProduct>();
  const seenVariant = new Set<number>();
  const productImages = new Map<number, Array<{ r2Key: string; position: number }>>();

  // First pass: collect images
  for (const row of rows) {
    if (row.image_id && row.image_r2_key !== null && row.image_position !== null) {
      if (!productImages.has(row.product_id)) {
        productImages.set(row.product_id, []);
      }
      const existing = productImages.get(row.product_id)!;
      // Avoid duplicates
      if (!existing.some(img => img.r2Key === row.image_r2_key)) {
        existing.push({
          r2Key: row.image_r2_key,
          position: row.image_position
        });
      }
    }
  }

  // Second pass: build products
  for (const row of rows) {
    if (!products.has(row.product_id)) {
      const fallbackImage = extractImageUrl(row.product_metadata);
      const imageList = productImages.get(row.product_id) || [];

      // Sort by position
      const sortedImages = imageList.sort((a, b) => a.position - b.position);

      // Generate R2 URLs
      const imageUrls = sortedImages.map(img => resolveAssetUrl(img.r2Key, baseUrl));

      // Main image: first R2 image or fallback
      const mainImage = imageUrls[0] || fallbackImage;

      // All images array
      const allImages = [...imageUrls];
      if (fallbackImage && !imageUrls.length) {
        allImages.push(fallbackImage);
      }

      products.set(row.product_id, {
        id: row.product_id,
        title: row.product_title,
        description: row.product_description,
        tax_rate: row.tax_rate,
        image: fallbackImage,
        mainImage: mainImage,
        images: allImages,
        variants: []
      });
    }

    // Variant handling
    if (seenVariant.has(row.variant_id)) continue;
    seenVariant.add(row.variant_id);
    products.get(row.product_id)?.variants.push({
      id: row.variant_id,
      title: row.variant_title,
      sku: row.sku,
      stock: row.on_hand,
      price: {
        id: row.price_id,
        amount: row.amount,
        currency: row.currency,
        provider_price_id: row.provider_price_id
      }
    });
  }

  return Array.from(products.values());
};

export const baseQuery = `
  SELECT p.id as product_id,
         p.title as product_title,
         p.description as product_description,
         p.metadata as product_metadata,
         p.tax_rate_id as tax_rate_id,
         tr.rate as tax_rate,
         v.id as variant_id,
         v.title as variant_title,
         v.sku as sku,
         pr.id as price_id,
         pr.amount as amount,
         pr.currency as currency,
         pr.provider_price_id as provider_price_id,
         pi.id as image_id,
         pi.r2_key as image_r2_key,
         pi.position as image_position,
         COALESCE(SUM(inv.delta), 0) as on_hand
  FROM products p
  JOIN variants v ON v.product_id = p.id
  JOIN prices pr ON pr.variant_id = v.id
  LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
  LEFT JOIN product_images pi ON pi.product_id = p.id
  LEFT JOIN inventory_movements inv ON inv.variant_id = v.id
`;

export const groupByClause = `GROUP BY p.id, v.id, pr.id, pi.id, tr.id`;
