import { describe, it, expect } from 'vitest';
import { type HeroSectionRow, createMockDb, createApp } from './helpers';

describe('Storefront API', () => {
  describe('GET /store/home/heroes', () => {
    it('returns active hero sections ordered by position', async () => {
      const heroSections: HeroSectionRow[] = [
        {
          id: 1,
          title: 'Hero 1',
          subtitle: 'Subtitle 1',
          image_r2_key: 'heroes/hero1.jpg',
          image_r2_key_small: 'heroes/hero1-small.jpg',
          cta_primary_text: 'Shop Now',
          cta_primary_url: '/products',
          cta_secondary_text: 'Learn More',
          cta_secondary_url: '/about',
          position: 1
        },
        {
          id: 2,
          title: 'Hero 2',
          subtitle: null,
          image_r2_key: 'heroes/hero2.jpg',
          image_r2_key_small: null,
          cta_primary_text: null,
          cta_primary_url: null,
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 2
        }
      ];

      const db = createMockDb({ heroSections });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/heroes');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.heroes).toHaveLength(2);
      expect(json.heroes[0].id).toBe(1);
      expect(json.heroes[0].title).toBe('Hero 1');
      expect(json.heroes[0].subtitle).toBe('Subtitle 1');
      expect(json.heroes[0].image).toContain('heroes%2Fhero1.jpg');
      expect(json.heroes[0].imageSmall).toContain('heroes%2Fhero1-small.jpg');
      expect(json.heroes[0].cta_primary_text).toBe('Shop Now');
      expect(json.heroes[1].id).toBe(2);
      expect(json.heroes[1].imageSmall).toBeNull();
    });

    it('returns empty array when no hero sections', async () => {
      const db = createMockDb({ heroSections: [] });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/heroes');
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.heroes).toEqual([]);
    });

    it('builds R2 URLs correctly for hero images', async () => {
      const heroSections: HeroSectionRow[] = [
        {
          id: 1,
          title: 'Test Hero',
          subtitle: null,
          image_r2_key: 'test/image.png',
          image_r2_key_small: null,
          cta_primary_text: null,
          cta_primary_url: null,
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 1
        }
      ];

      const db = createMockDb({ heroSections });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/heroes');
      const json = await res.json();

      expect(json.heroes[0].image).toMatch(/\/r2\?key=test%2Fimage\.png/);
    });

    it('returns direct hero image URLs without R2 wrapping', async () => {
      const heroSections: HeroSectionRow[] = [
        {
          id: 1,
          title: 'Direct URL Hero',
          subtitle: null,
          image_r2_key: '/seed/heroes/hero-01-main.svg',
          image_r2_key_small: 'https://cdn.example.com/hero-small.webp',
          cta_primary_text: null,
          cta_primary_url: null,
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 1
        }
      ];

      const db = createMockDb({ heroSections });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/heroes');
      const json = await res.json();

      expect(json.heroes[0].image).toBe('/seed/heroes/hero-01-main.svg');
      expect(json.heroes[0].imageSmall).toBe('https://cdn.example.com/hero-small.webp');
    });

    it('handles null R2 keys gracefully', async () => {
      const heroSections: HeroSectionRow[] = [
        {
          id: 1,
          title: 'No Image Hero',
          subtitle: 'Test',
          image_r2_key: null,
          image_r2_key_small: null,
          cta_primary_text: 'Click',
          cta_primary_url: '/test',
          cta_secondary_text: null,
          cta_secondary_url: null,
          position: 1
        }
      ];

      const db = createMockDb({ heroSections });
      const { fetch } = createApp(db);

      const res = await fetch('/store/home/heroes');
      const json = await res.json();

      expect(json.heroes[0].image).toBeNull();
      expect(json.heroes[0].imageSmall).toBeNull();
    });
  });
});
