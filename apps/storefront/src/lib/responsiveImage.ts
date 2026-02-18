/**
 * Responsive image utility for Cloudflare Image Resizing.
 *
 * Generates `srcset` values using `/cdn-cgi/image/` URL format when images
 * are served from the same origin or a known CDN.  Falls back gracefully
 * when the source is a data-URI, SVG, or an external host where
 * Cloudflare Image Resizing is not available.
 */

/** Standard breakpoint widths used across the storefront. */
export const IMAGE_WIDTHS = {
  /** Product card thumbnails in grid layouts */
  thumbnail: [200, 400, 600],
  /** Category / hero cards */
  card: [400, 800, 1200],
  /** Full-width hero backgrounds */
  hero: [640, 1024, 1536, 2048],
  /** Product gallery – primary image */
  galleryMain: [400, 800, 1200],
  /** Product gallery – thumbnail strip */
  galleryThumb: [96, 192],
} as const;

type WidthPreset = keyof typeof IMAGE_WIDTHS;

/**
 * Returns true when the URL is eligible for Cloudflare Image Resizing.
 *
 * Ineligible URLs include data-URIs, SVGs, and absolute URLs pointing to
 * a different origin (we cannot apply `/cdn-cgi/image/` to those).
 */
const isResizable = (src: string): boolean => {
  if (!src) return false;
  if (src.startsWith('data:')) return false;
  if (src.endsWith('.svg')) return false;
  // Absolute URLs on external hosts cannot use our cdn-cgi endpoint
  if (src.startsWith('http://') || src.startsWith('https://')) return false;
  return true;
};

/**
 * Build a single Cloudflare Image Resizing URL.
 *
 * @see https://developers.cloudflare.com/images/transform-images/transform-via-url/
 */
const cfImageUrl = (src: string, width: number): string =>
  `/cdn-cgi/image/width=${width},format=auto,fit=cover,quality=80/${src.replace(/^\//, '')}`;

/**
 * Build a `srcset` string for a given image source.
 *
 * If the source is not eligible for resizing the original `src` is
 * returned as-is (single entry, no width descriptor).
 */
export const buildSrcSet = (src: string, preset: WidthPreset): string => {
  if (!isResizable(src)) return '';
  const widths = IMAGE_WIDTHS[preset];
  return widths.map((w) => `${cfImageUrl(src, w)} ${w}w`).join(', ');
};

/**
 * Build a `srcset` string for background image usage in CSS.
 *
 * Returns an array of `{ url, width }` pairs that can be used
 * inside a `<picture>` or as `image-set()` values.
 */
export const buildImageVariants = (
  src: string,
  preset: WidthPreset,
): Array<{ url: string; width: number }> => {
  if (!isResizable(src)) return [{ url: src, width: 0 }];
  const widths = IMAGE_WIDTHS[preset];
  return widths.map((w) => ({ url: cfImageUrl(src, w), width: w }));
};

export type ResponsiveImageAttrs = {
  src: string;
  srcset: string;
  sizes: string;
};

/**
 * Convenience helper that returns all attributes needed for a responsive
 * `<img>` element.
 *
 * @param src     – Original image URL
 * @param preset  – Width preset name (see `IMAGE_WIDTHS`)
 * @param sizes   – CSS `sizes` attribute value
 */
export const responsiveImageAttrs = (
  src: string,
  preset: WidthPreset,
  sizes: string,
): ResponsiveImageAttrs => {
  const srcset = buildSrcSet(src, preset);
  return { src, srcset, sizes };
};
