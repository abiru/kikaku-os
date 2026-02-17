# Page Spec — PLP (Product Listing Page)

> Path: `/products`, `/categories/[slug]`
> Overrides `master.md` where specified.

---

## Layout

**Two-column layout** on desktop. Single column on mobile.

```
Desktop (≥ 1024px):
┌──────────────────────────────────────────────────────┐
│  SiteHeader (sticky)                                  │
├──────────────────────────────────────────────────────┤
│  Breadcrumb                                           │
├──────────────────────────────────────────────────────┤
│  Page Title          Sort Dropdown   Grid Toggle      │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Filters   │  Product Grid                           │
│  (sidebar) │  (3-4 columns)                          │
│  280px     │                                         │
│            │                                         │
│            │                                         │
│            │                                         │
│            │                                         │
├────────────┴─────────────────────────────────────────┤
│  Pagination                                          │
├──────────────────────────────────────────────────────┤
│  SiteFooter                                          │
└──────────────────────────────────────────────────────┘

Mobile (< 1024px):
┌────────────────────────────────┐
│  SiteHeader                    │
├────────────────────────────────┤
│  Breadcrumb                    │
├────────────────────────────────┤
│  Page Title                    │
│  [フィルタ] [並び替え]          │  ← Trigger buttons
├────────────────────────────────┤
│  Active Filters (chips)        │
├────────────────────────────────┤
│  Product Grid (2 columns)      │
├────────────────────────────────┤
│  Pagination                    │
├────────────────────────────────┤
│  SiteFooter                    │
└────────────────────────────────┘
```

**Container**: `max-width: 1280px`, standard padding from master.md.

---

## Section: Toolbar

**Layout:**
```
[Page Title (H1)]                      [Sort ▼]  [Grid: ▦ ▤]

24 件の商品                             ← result count, --text-small, --color-secondary
```

**Specs:**
- Page title: `--text-h1` for top-level `/products`, `--text-h2` for category pages.
- Sort dropdown: select element, options = "新着順", "価格が安い順", "価格が高い順", "人気順".
- Grid toggle: icon buttons switching between 3-col and 4-col (desktop only).
- Result count: `--text-small`, `--color-secondary`.

---

## Section: Filters Sidebar

**Desktop**: Fixed sidebar, 280px width, scrollable independently.

**Mobile**: Full-screen drawer, triggered by "フィルタ" button.

### Filter Groups

```
カテゴリ                    [▼]
  □ すべて
  □ カテゴリA (12)
  □ カテゴリB (8)
  □ カテゴリC (3)

価格帯                     [▼]
  [range slider: ¥0 — ¥50,000]
  ¥ [min] 〜 ¥ [max]

在庫状況                    [▼]
  □ 在庫ありのみ
```

**Specs:**
- Each group: collapsible accordion with `--text-h3` label.
- Checkbox: custom styled, brand color when checked.
- Count in parentheses: `--color-muted`.
- Price range slider: dual-thumb, brand color track.
- Min/max inputs: small number inputs below slider.
- "フィルタをリセット" link at bottom: `--color-brand`, ghost style.
- URL params: filters persist as query string (e.g., `?category=a&min_price=1000`).

### Active Filters (Chips)

```
カテゴリA [✕]   ¥1,000〜¥10,000 [✕]   [すべてクリア]
```

- Displayed above product grid when any filter is active.
- Chip: `--color-bg` background, `--radius-full`, `--text-caption`.
- Remove button: `✕` icon, 16px.
- "すべてクリア" link: `--color-brand`, text-only.

---

## Section: Product Grid

**Grid specs:**

| Breakpoint | Columns | Gap |
|------------|---------|-----|
| < 640px | 2 | `16px` |
| 640-1023px | 2-3 | `20px` |
| ≥ 1024px (with sidebar) | 3 | `24px` |
| ≥ 1280px (with sidebar) | 3-4 | `24px` |

- Uses `ProductCard` component from master.md (§6.2).
- CSS Grid: `repeat(auto-fill, minmax(240px, 1fr))`.
- Equal height rows via `grid-auto-rows`.

### No Results

When filter produces 0 results, show `EmptyState`:
```
該当する商品が見つかりませんでした
検索条件を変更してお試しください。

[フィルタをリセット]
```

### Loading State

- Show skeleton grid matching current column count.
- 8 skeleton cards (2 rows × 4 columns or 4 rows × 2 columns on mobile).
- Shimmer animation per master.md §6.15.

---

## Section: Pagination

**Layout:**
```
[← 前へ]  1  2  [3]  4  5  ...  12  [次へ →]
```

**Specs:**
- Centered below product grid.
- Current page: `--color-brand` background, white text, `--radius-md`.
- Other pages: `--color-primary` text, hover `--color-bg` background.
- Previous/Next: text + arrow icon, disabled when at boundary.
- Ellipsis for large page counts.
- `--space-2` gap between items.
- Each item: min-width `40px`, height `40px`, centered text.

**Alternative: Load More button**
- "もっと見る" secondary button, full-width on mobile.
- Show progress: "24 / 72 件を表示中".
- Preferred for mobile; pagination for desktop.

---

## Section: Breadcrumb

```
ホーム  >  商品一覧  >  カテゴリA
```

**Specs:**
- `--text-caption`, `--color-secondary`.
- Links: `--color-brand` on hover.
- Separator: `>` or chevron-right icon (12px).
- Current page (last item): `--color-primary`, no link.
- Structured data: `BreadcrumbList` JSON-LD.

---

## Responsive Behavior Summary

| Element | Desktop (≥ 1024px) | Tablet (768-1023px) | Mobile (< 768px) |
|---------|-------------------|--------------------|--------------------|
| Filter | Sidebar 280px | Drawer | Drawer |
| Grid | 3-4 columns | 2-3 columns | 2 columns |
| Sort | Inline dropdown | Inline dropdown | Bottom sheet or dropdown |
| Pagination | Number-based | Number-based | "Load more" button |
| Grid Toggle | Visible | Hidden | Hidden |
| Active Filters | Above grid, inline | Above grid, scrollable | Above grid, scrollable |

---

## URL State

All filter and sort state must be reflected in the URL for:
- Shareability (copy-paste URL preserves filter state).
- Browser back/forward navigation.
- SEO (canonical URL without filters, `rel="nofollow"` on filtered pages).

**Parameter mapping:**
```
/products?category=accessories&min_price=1000&max_price=5000&sort=price_asc&page=2
```

---

## SEO Notes

- `<title>`: "商品一覧 | Kikaku OS" or "カテゴリ名 | Kikaku OS".
- `<meta name="description">`: Dynamic based on category.
- Canonical: `/products` (without filter params).
- JSON-LD: `ItemList` with first 10 products.
- Pagination: `<link rel="next">` / `<link rel="prev">` (if paginated).

---

## Performance Notes

- Product images: lazy-load all except first row (4 images above fold).
- Filter changes: client-side fetch, no full page reload.
- Debounce price range slider: 300ms.
- Prefetch next page on hover over pagination link.
