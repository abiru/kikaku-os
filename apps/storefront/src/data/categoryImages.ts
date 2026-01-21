export const CATEGORY_IMAGES = {
  seasonal: {
    large: (await import("../assets/category/ipad.jpg")).default,
    small: (await import("../assets/category/ipad-sm.jpg")).default,
  },
  aged: {
    large: (await import("../assets/category/watch.jpg")).default,
    small: (await import("../assets/category/watch-sm.jpg")).default,
  },
  compare: {
    large: (await import("../assets/category/ipad2.jpg")).default,
    small: (await import("../assets/category/ipad2-sm.jpg")).default,
  },
  kanzake: {
    large: (await import("../assets/category/air.jpg")).default,
    small: (await import("../assets/category/air-sm.jpg")).default,
  },
  gift: {
    large: (await import("../assets/category/watch2.jpg")).default,
    small: (await import("../assets/category/watch2-sm.jpg")).default,
  },
  standard: {
    large: (await import("../assets/category/trade.jpg")).default,
    small: (await import("../assets/category/trade-sm.jpg")).default,
  },
};
