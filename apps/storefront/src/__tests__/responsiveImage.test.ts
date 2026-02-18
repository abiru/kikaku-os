import { describe, it, expect } from 'vitest';
import {
  buildSrcSet,
  buildImageVariants,
  responsiveImageAttrs,
  IMAGE_WIDTHS,
} from '../lib/responsiveImage';

describe('responsiveImage', () => {
  describe('buildSrcSet', () => {
    it('generates srcset for a relative URL with the thumbnail preset', () => {
      const result = buildSrcSet('/r2?key=products/photo.jpg', 'thumbnail');
      const entries = result.split(', ');
      expect(entries).toHaveLength(IMAGE_WIDTHS.thumbnail.length);
      for (const entry of entries) {
        expect(entry).toMatch(/^\/cdn-cgi\/image\/width=\d+,format=auto,fit=cover,quality=80\//);
        expect(entry).toMatch(/\d+w$/);
      }
    });

    it('returns empty string for data URIs', () => {
      expect(buildSrcSet('data:image/svg+xml;base64,abc', 'thumbnail')).toBe('');
    });

    it('returns empty string for SVG files', () => {
      expect(buildSrcSet('/seed/products/icon.svg', 'thumbnail')).toBe('');
    });

    it('returns empty string for absolute external URLs', () => {
      expect(buildSrcSet('https://cdn.example.com/photo.jpg', 'thumbnail')).toBe('');
    });

    it('returns empty string for empty source', () => {
      expect(buildSrcSet('', 'thumbnail')).toBe('');
    });

    it('uses correct widths for each preset', () => {
      const heroResult = buildSrcSet('/images/hero.jpg', 'hero');
      const widthValues = heroResult.match(/\d+w/g);
      expect(widthValues).toHaveLength(IMAGE_WIDTHS.hero.length);
      const expectedWidths = IMAGE_WIDTHS.hero.map((w) => `${w}w`);
      expect(widthValues).toEqual(expectedWidths);
    });

    it('strips leading slash from src when building cdn-cgi URL', () => {
      const result = buildSrcSet('/r2?key=test.jpg', 'galleryThumb');
      expect(result).toContain('/cdn-cgi/image/width=96,format=auto,fit=cover,quality=80/r2?key=test.jpg');
    });
  });

  describe('buildImageVariants', () => {
    it('returns url/width pairs for resizable images', () => {
      const variants = buildImageVariants('/images/bg.jpg', 'card');
      expect(variants).toHaveLength(IMAGE_WIDTHS.card.length);
      for (const v of variants) {
        expect(v.url).toContain('/cdn-cgi/image/');
        expect(v.width).toBeGreaterThan(0);
      }
    });

    it('returns original URL with width 0 for non-resizable images', () => {
      const variants = buildImageVariants('data:image/svg+xml;base64,abc', 'card');
      expect(variants).toEqual([{ url: 'data:image/svg+xml;base64,abc', width: 0 }]);
    });
  });

  describe('responsiveImageAttrs', () => {
    it('returns src, srcset, and sizes', () => {
      const attrs = responsiveImageAttrs('/images/product.jpg', 'thumbnail', '50vw');
      expect(attrs.src).toBe('/images/product.jpg');
      expect(attrs.srcset).toBeTruthy();
      expect(attrs.sizes).toBe('50vw');
    });

    it('returns empty srcset for non-resizable images', () => {
      const attrs = responsiveImageAttrs('https://external.com/img.jpg', 'thumbnail', '50vw');
      expect(attrs.src).toBe('https://external.com/img.jpg');
      expect(attrs.srcset).toBe('');
      expect(attrs.sizes).toBe('50vw');
    });
  });
});
