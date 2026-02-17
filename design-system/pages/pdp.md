# Page Spec — PDP (Product Detail Page)

> Path: `/products/[id]`
> Overrides `master.md` where specified.

---

## Layout

**Two-column layout** on desktop. Stacked on mobile.

```
Desktop (≥ 1024px):
┌──────────────────────────────────────────────────────┐
│  SiteHeader (sticky)                                  │
├──────────────────────────────────────────────────────┤
│  Breadcrumb                                           │
├─────────────────────────┬────────────────────────────┤
│                         │                            │
│  ProductGallery         │  Product Info              │
│  (55% width)            │  (45% width)               │
│                         │                            │
│                         │  ├ Product Name (H1)       │
│                         │  ├ Price Block             │
│                         │  ├ Star Rating (summary)   │
│                         │  ├ Short Description       │
│                         │  ├ Variant Selector        │
│                         │  ├ Add to Cart             │
│                         │  ├ Shipping/Returns        │
│                         │  └ Warranty                │
│                         │                            │
├─────────────────────────┴────────────────────────────┤
│  Product Details (tabs)                               │
│  ├ 詳細説明  ├ スペック  ├ レビュー                     │
├──────────────────────────────────────────────────────┤
│  Related Products                                     │
├──────────────────────────────────────────────────────┤
│  Recently Viewed                                      │
├──────────────────────────────────────────────────────┤
│  SiteFooter                                          │
└──────────────────────────────────────────────────────┘

Mobile (< 1024px):
┌────────────────────────────────┐
│  SiteHeader                    │
├────────────────────────────────┤
│  Breadcrumb                    │
├────────────────────────────────┤
│  ProductGallery (carousel)     │
├────────────────────────────────┤
│  Product Name (H1)             │
│  Star Rating (summary)         │
│  Price Block                   │
│  Short Description             │
│  Variant Selector              │
│  Shipping/Returns (collapsed)  │
├────────────────────────────────┤
│  Product Details (accordion)   │
├────────────────────────────────┤
│  Reviews                       │
├────────────────────────────────┤
│  Related Products              │
├────────────────────────────────┤
│  SiteFooter                    │
├────────────────────────────────┤
│  ██ カートに追加 ¥12,000 ██   │  ← Sticky bottom bar
└────────────────────────────────┘
```

**Container**: `max-width: 1280px`.

---

## Section: Breadcrumb

```
ホーム  >  カテゴリ名  >  商品名
```

Same spec as PLP breadcrumb (see `plp.md`).

---

## Section: Product Gallery (Left Column)

Uses `ProductGallery` component from master.md (§6.3).

**Desktop:**
- Thumbnail rail (80px wide) on the left, main image on the right.
- Main image: `aspect-ratio: 4/3`, `object-fit: cover`, `--radius-lg`.
- Click main image → lightbox.
- Thumbnails: 60×60px, `--radius-sm`, 2px border when active.

**Mobile:**
- Horizontal carousel with `scroll-snap-type: x mandatory`.
- Dot indicators below (max 5 dots, then "1/8" counter).
- Swipe to navigate.

**Sticky behavior (desktop):** Gallery column sticks to top with `position: sticky; top: 80px` (below header) while user scrolls through info column.

---

## Section: Product Info (Right Column)

Ordered top to bottom:

### Product Name
- `--text-h1` (desktop: `2.25rem`, mobile: `1.75rem`).
- Below name: category link in `--text-caption`, `--color-secondary`.

### Star Rating Summary
```
★★★★☆  4.3 (24件のレビュー)
```
- Inline with product name area.
- Stars: 16px, amber filled.
- Count: `--text-small`, `--color-brand`, clickable (scrolls to reviews).

### PriceBlock
- Uses `PriceBlock` component from master.md (§6.4).
- Tax-inclusive as primary display.
- Sale badge positioned inline-end of price.

### Short Description
- `--text-body`, `--color-secondary`.
- Max 3 lines. Full description in tabs below.
- Supports basic markdown (bold, links).

### VariantSelector
- Uses `VariantSelector` component from master.md (§6.5).
- Each option group separated by `--space-5`.
- Stock status per variant: "在庫あり", "残り3点", "在庫切れ".

### AddToCart
- Uses `AddToCart` component from master.md (§6.6).
- Full width within the info column.
- Margin top: `--space-6`.

### Trust Signals
```
┌─────────────────────────────────────┐
│  ✓ 送料無料 (¥10,000以上)            │
│  ✓ 14日間返品保証                    │
│  ✓ 安全なお支払い                    │
└─────────────────────────────────────┘
```
- Compact list with checkmark icons (Heroicons check-circle, `--color-success`).
- `--text-small`, `--color-secondary`.
- Background: `--color-bg`, `--radius-md`, padding `--space-4`.
- Margin top: `--space-4`.

### Shipping & Returns
- Uses `ShippingReturns` component from master.md (§6.11).
- Collapsible on both desktop and mobile (default collapsed).

### Warranty
- Uses `Warranty` component from master.md (§6.12).
- Below shipping info, same collapsible pattern.

---

## Section: Product Details (Tabs / Accordion)

**Desktop**: Horizontal tabs below the two-column area.
**Mobile**: Accordion (stacked collapsible sections).

### Tab 1: 詳細説明
- Rich text content (markdown rendered).
- Max-width for readability: `720px` (centered within container).
- Images within description: full-width within content column, `--radius-md`.
- Typography: `--text-body`, `line-height: 1.8` (Japanese).

### Tab 2: スペック
- Uses `SpecTable` component from master.md (§6.9).
- Alternating row colors.
- Responsive stacked layout on mobile.

### Tab 3: レビュー
- Uses `Reviews` component from master.md (§6.14).
- Rating breakdown bar chart at top.
- List of individual reviews, paginated (5 per page).
- "レビューを書く" button (requires authentication).

**Tab States:**
- Active tab: `--color-primary` text, `2px` bottom border `--color-brand`.
- Inactive tab: `--color-secondary` text, no border.
- Hover: `--color-primary` text.
- Tab content area: `--space-8` padding-top.

---

## Section: Related Products

```
関連商品

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ProductCard│  │ProductCard│  │ProductCard│  │ProductCard│
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

- Section heading: `--text-h2`.
- 4-column grid desktop, horizontal scroll on mobile.
- Uses `ProductCard` component from master.md (§6.2).
- Max 8 items. Show 4 on desktop, scroll for rest.
- Based on same category, price range, or "bought together" data.

---

## Section: Recently Viewed

```
最近見た商品

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ProductCard│  │ProductCard│  │ProductCard│  │ProductCard│
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

- Same layout as Related Products.
- Data from `localStorage` (client-side only).
- Exclude current product from list.
- Show only if ≥ 2 recently viewed items.

---

## Mobile Sticky Bottom Bar

**Visible on mobile only (< 1024px):**

```
┌─────────────────────────────────────────┐
│  ¥12,000 (税込)     [カートに追加]       │
│                      (primary, lg btn)   │
└─────────────────────────────────────────┘
```

**Specs:**
- `position: fixed; bottom: 0; left: 0; right: 0`.
- Height: `72px`.
- Background: `--color-surface`, `--shadow-lg` (inverted, shadow upward).
- `border-top: 1px solid --color-border-light`.
- Price on left, CTA button on right.
- Z-index: above page content, below modals/drawers.
- Appears after user scrolls past the inline "Add to Cart" button.
- Hidden when keyboard is open (detect via viewport height change).

---

## Loading State

1. **Gallery**: Skeleton rectangle, aspect-ratio 4:3 + 4 small skeleton thumbnails.
2. **Product info**:
   - Skeleton text line (wide) for name.
   - Skeleton text line (medium) for price.
   - Skeleton text block (3 lines) for description.
   - Skeleton button (full width) for CTA.
3. **Tabs**: Skeleton tab headers + skeleton text block.
4. **Related products**: 4 skeleton `ProductCard`s.

---

## Error State

If product not found (404):
```
この商品は見つかりませんでした
商品が削除されたか、URLが変更された可能性があります。

[商品一覧に戻る]
```

If product fetch fails (500):
```
商品情報の読み込みに失敗しました

[再試行]
```

---

## SEO & Structured Data

- `<title>`: "商品名 | Kikaku OS"
- `<meta name="description">`: First 160 chars of product description.
- JSON-LD `Product` schema:
  ```json
  {
    "@type": "Product",
    "name": "...",
    "image": ["..."],
    "description": "...",
    "sku": "...",
    "offers": {
      "@type": "Offer",
      "price": "12000",
      "priceCurrency": "JPY",
      "availability": "https://schema.org/InStock",
      "priceValidUntil": "..."
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.3",
      "reviewCount": "24"
    }
  }
  ```
- JSON-LD `BreadcrumbList`.
- Open Graph: product image, title, price.

---

## Responsive Behavior Summary

| Element | Desktop (≥ 1024px) | Tablet (768-1023px) | Mobile (< 768px) |
|---------|-------------------|--------------------|--------------------|
| Layout | 2 columns (55/45) | 2 columns (50/50) | Single column |
| Gallery | Thumbnails + main | Thumbnails + main | Carousel |
| Gallery sticky | Yes | Yes | No |
| Details | Tabs | Tabs | Accordion |
| Add to Cart | Inline | Inline | Inline + sticky bottom bar |
| Related Products | 4-col grid | 2-col grid | Horizontal scroll |
| Trust Signals | Visible | Visible | Visible |

---

## Performance Notes

- First product image: `fetchpriority="high"`, preloaded. This is the LCP candidate.
- Other gallery images: `loading="lazy"`.
- Reviews: lazy-loaded when tab selected or accordion opened.
- Related products: loaded after main content (below fold).
- Recently viewed: client-only, no SSR.
- Target CLS < 0.1: Reserve space for image (aspect-ratio) and variant selector.
