/** Shared card CSS class constants for visual consistency across Astro, React, and DOM-based card renderers. */

export const cardClasses = {
  outer: 'rounded-2xl bg-white ring-1 ring-black/5 shadow-card transition-all duration-[var(--duration-normal)] hover:shadow-elevated hover:scale-[1.02]',
  outerCompact: 'rounded-2xl bg-white ring-1 ring-black/5 shadow-card transition-all duration-[var(--duration-normal)] hover:shadow-elevated hover:scale-[1.01]',
  outerStatic: 'rounded-2xl bg-white ring-1 ring-black/5 shadow-card',
  imageWrap: 'aspect-[4/3] overflow-hidden rounded-t-2xl bg-subtle',
  image: 'h-full w-full object-cover',
  imagePlaceholder: 'flex h-full w-full items-center justify-center bg-subtle text-neutral-300',
  content: 'p-5',
  badge: 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  title: 'mt-2 text-sm font-semibold text-primary line-clamp-2',
  titleCompact: 'mt-2 text-sm font-semibold text-primary truncate',
  price: 'mt-1 text-sm text-secondary',
  wishlistButton: 'absolute top-3 right-3 z-10 rounded-full bg-white/80 p-2 backdrop-blur-sm shadow-sm transition-all duration-200 hover:scale-110 active:scale-95',
  skeleton: {
    outer: 'rounded-2xl bg-white ring-1 ring-black/5 shadow-card',
    imageWrap: 'aspect-[4/3] rounded-t-2xl animate-shimmer',
    content: 'p-5 space-y-3',
    badge: 'h-4 w-16 rounded-full animate-shimmer',
    title: 'h-5 w-3/4 rounded-md animate-shimmer',
    price: 'h-4 w-20 rounded-md animate-shimmer',
  },
} as const;

export const placeholderSvg = `<svg class="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`;
