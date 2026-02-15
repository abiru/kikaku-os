/**
 * Admin product detail page - client-side interactivity
 * Coordinates image upload/delete, variant CRUD, web fetch preview, and archive/restore
 */

import { initImageHandlers } from './product-images';
import { initVariantHandlers } from './product-variants';
import { initWebFetchHandlers } from './product-fetch';
import { initArchiveRestoreHandlers } from './product-actions';

export function initProductPage(productId: string) {
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;

  // If elements don't exist yet (React still loading), retry
  if (!imageUpload && !document.getElementById('variant-modal')) {
    setTimeout(() => initProductPage(productId), 100);
    return;
  }

  initImageHandlers(productId);
  initVariantHandlers(productId);
  initWebFetchHandlers(productId);
  initArchiveRestoreHandlers(productId);
}
