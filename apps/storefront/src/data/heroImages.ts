// src/data/heroImages.ts

export type HeroKey = "gift" | "iphone" | "airpods";

export type HeroImage = { large: ImageMetadata; small: ImageMetadata };

export const HERO_IMAGES: Record<HeroKey, HeroImage> = {
  gift: {
    large: (await import("../assets/hero/okina.png")).default,
    small: (await import("../assets/hero/okina-sm.png")).default,
  },
  iphone: {
    large: (await import("../assets/hero/iphone.jpg")).default,
    small: (await import("../assets/hero/iphone-sm.jpg")).default,
  },
  airpods: {
    large: (await import("../assets/hero/airpods.jpg")).default,
    small: (await import("../assets/hero/airpods-sm.jpg")).default,
  },
};
