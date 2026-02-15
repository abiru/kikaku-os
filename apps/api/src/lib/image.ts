/**
 * Get file extension from content type.
 * Used by image upload handlers (hero images, product images).
 */
export const getExtensionFromContentType = (contentType: string): string => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return map[contentType] || 'bin';
};
