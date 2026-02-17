# Design System — Kikaku OS Storefront

> **Source of Truth**: This file defines all visual and component specifications.
> Page-level overrides live in `design-system/pages/*.md` and take precedence.

---

## 0. Design Principles

1. **Readability first** — Every typographic and color decision serves legibility.
2. **Trust & transparency** — Clean backgrounds, consistent spacing, no decorative gimmicks.
3. **Systematic spacing** — 8 px base grid; generous whitespace replaces ornament.
4. **One accent rule** — A single brand color is used exclusively for primary CTAs and interactive affordances. Everything else is neutral.
5. **State completeness** — Every interactive element defines `default`, `hover`, `focus-visible`, `active`, `disabled`, and `loading` states.

---

## 1. Typography

### Font Stack

```css
--font-sans: "Inter", "Noto Sans JP", system-ui, -apple-system, sans-serif;
```

- **Inter** — All headings and body text (Latin).
- **Noto Sans JP** — Japanese fallback. Weight subset: 400, 500, 700.
- **No serif / display fonts.** Bodoni Moda and all decorative typefaces are prohibited.

### Type Scale

All sizes use `rem`. Base = `16px`.

| Token | Size | Weight | Line-Height | Letter-Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `--text-h1` | `2.25rem` (36 px) | 700 | 1.2 | `-0.025em` | Page title, hero headline |
| `--text-h2` | `1.75rem` (28 px) | 700 | 1.25 | `-0.02em` | Section heading |
| `--text-h3` | `1.25rem` (20 px) | 600 | 1.3 | `-0.01em` | Subsection heading |
| `--text-body` | `1rem` (16 px) | 400 | 1.6 | `0` | Paragraph, descriptions |
| `--text-small` | `0.875rem` (14 px) | 400 | 1.5 | `0` | Helper text, metadata |
| `--text-caption` | `0.75rem` (12 px) | 500 | 1.4 | `0.02em` | Labels, badges, timestamps |
| `--text-price` | `1.5rem` (24 px) | 700 | 1.2 | `-0.01em` | Product price display |

**Japanese text rules:**
- Body line-height: `1.8` (override `--text-body` when `lang="ja"`).
- Never letter-space Japanese below `-0.01em`.
- `font-feature-settings: "palt"` for proportional alternates.

### Responsive Overrides

| Token | ≥ 1024 px | < 1024 px |
|-------|-----------|-----------|
| `--text-h1` | `2.25rem` | `1.75rem` |
| `--text-h2` | `1.75rem` | `1.375rem` |
| `--text-price` | `1.5rem` | `1.25rem` |

---

## 2. Colors

### Palette

| Role | Token | Value | Notes |
|------|-------|-------|-------|
| **Brand** | `--color-brand` | `#0071e3` | CTA buttons, links, active indicators only |
| **Brand Hover** | `--color-brand-hover` | `#0077ed` | Hover state for brand elements |
| **Brand Active** | `--color-brand-active` | `#005bb5` | Active/pressed state |
| **Text Primary** | `--color-primary` | `#1d1d1f` | Headings, primary body text |
| **Text Secondary** | `--color-secondary` | `#6e6e73` | Descriptions, secondary info |
| **Text Muted** | `--color-muted` | `#86868b` | Placeholders, disabled text |
| **Surface** | `--color-surface` | `#ffffff` | Cards, modals, drawers |
| **Background** | `--color-bg` | `#f5f5f7` | Page background |
| **Border** | `--color-border` | `#d2d2d7` | Dividers, input borders |
| **Border Light** | `--color-border-light` | `#e8e8ed` | Subtle separators |
| **Success** | `--color-success` | `#34c759` | Confirmations, in-stock |
| **Warning** | `--color-warning` | `#ff9f0a` | Low stock, attention |
| **Error** | `--color-error` | `#ff3b30` | Validation errors, out-of-stock |

### Usage Rules

- **Backgrounds**: `#ffffff` (cards) and `#f5f5f7` (page). No dark backgrounds for content areas.
- **Brand color**: Only for primary CTA, active navigation, links, and focus rings. Never for large surface areas.
- **Text on white**: Use `--color-primary` (#1d1d1f). Minimum contrast ratio 4.5:1 (WCAG AA).
- **Black × gold luxury scheme is prohibited.** No `#CA8A04`, no gold accents.
- **No gradient backgrounds** on content sections. Gradients are limited to subtle overlay use (e.g., image scrim).

---

## 3. Spacing & Layout

### 8 px Grid

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` (0.25rem) | Inline icon gap |
| `--space-2` | `8px` (0.5rem) | Tight element gap |
| `--space-3` | `12px` (0.75rem) | Badge padding, compact lists |
| `--space-4` | `16px` (1rem) | Standard padding, card padding |
| `--space-5` | `20px` (1.25rem) | Form field gap |
| `--space-6` | `24px` (1.5rem) | Card internal sections |
| `--space-8` | `32px` (2rem) | Group separation |
| `--space-10` | `40px` (2.5rem) | Section padding (mobile) |
| `--space-12` | `48px` (3rem) | Section padding (tablet) |
| `--space-16` | `64px` (4rem) | Section padding (desktop) |
| `--space-20` | `80px` (5rem) | Large section gap |
| `--space-24` | `96px` (6rem) | Hero / major section gap |

### Container

```css
.container {
  max-width: 1280px;       /* --container-max */
  margin-inline: auto;
  padding-inline: 16px;    /* mobile */
}
@media (min-width: 768px) {
  .container { padding-inline: 24px; }
}
@media (min-width: 1024px) {
  .container { padding-inline: 32px; }
}
```

### Grid

- **Product grid**: CSS Grid, `repeat(auto-fill, minmax(280px, 1fr))`, gap `24px`.
- **Content grid**: 12-column grid at `≥ 1024px`. Collapse to single column below.
- **Two-column layout** (PDP, filters): `aside 280px | main 1fr` at `≥ 1024px`.

### Breakpoints

| Name | Min-width | Usage |
|------|-----------|-------|
| `sm` | `640px` | Large phones landscape |
| `md` | `768px` | Tablets |
| `lg` | `1024px` | Desktops, two-column layouts |
| `xl` | `1280px` | Wide desktops, max container |

---

## 4. Elevation & Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | Inputs, subtle lift |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | Cards at rest |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Cards on hover, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, drawers |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.16)` | Lightbox, full-screen overlays |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Badges, small elements |
| `--radius-md` | `8px` | Buttons, inputs |
| `--radius-lg` | `12px` | Cards, modals |
| `--radius-xl` | `16px` | Large cards, drawers |
| `--radius-full` | `9999px` | Pills, avatars |

### Blur (Overlay Only)

```css
/* Allowed: modal overlay, sticky header scroll state */
backdrop-filter: blur(8px);
background: rgba(255, 255, 255, 0.8);

/* Prohibited: "Liquid Glass", frosted card surfaces, decorative blur */
```

---

## 5. Transitions & Motion

| Property | Duration | Easing |
|----------|----------|--------|
| Color, opacity, shadow | `150ms` | `ease` |
| Transform (hover lift) | `200ms` | `ease-out` |
| Layout (drawer open) | `300ms` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Page transition | `250ms` | `ease` |

**Rules:**
- Always respect `prefers-reduced-motion: reduce` — disable transforms and animations.
- No layout-shifting hover transforms (e.g., `scale` that pushes siblings). Use `translateY(-2px)` + shadow only.
- No decorative animations. Motion must convey state change or guide attention.

---

## 6. Component Specifications

### 6.1 Button

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| **Primary** | `--color-brand` | `#ffffff` | none |
| **Secondary** | `transparent` | `--color-primary` | `1px solid --color-border` |
| **Ghost** | `transparent` | `--color-brand` | none |
| **Destructive** | `--color-error` | `#ffffff` | none |

**Sizing:**

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| `sm` | `32px` | `8px 16px` | `14px` (500) |
| `md` | `40px` | `10px 20px` | `14px` (600) |
| `lg` | `48px` | `12px 24px` | `16px` (600) |
| `xl` | `56px` | `16px 32px` | `16px` (600) |

**States:**

| State | Behavior |
|-------|----------|
| `default` | As defined above |
| `hover` | Primary: `--color-brand-hover`. Secondary: `bg --color-bg`. Ghost: underline. |
| `focus-visible` | `0 0 0 3px rgba(0,113,227,0.3)` focus ring. Never remove outline. |
| `active` | Primary: `--color-brand-active`. Scale `0.98`. |
| `disabled` | `opacity: 0.4`, `cursor: not-allowed`, no hover effect. |
| `loading` | Replace label with spinner (16 px). Keep button width stable. |

**Definition of Done (DoD):**
- [ ] All 4 variants rendered
- [ ] All 6 states functional
- [ ] Keyboard accessible (Enter/Space triggers click)
- [ ] `aria-disabled` when disabled, `aria-busy` when loading

---

### 6.2 ProductCard

Used on PLP, home featured, related products.

**Structure:**
```
┌─────────────────────┐
│  [Image 4:3]        │  ← aspect-ratio: 4/3; object-fit: cover
│  [Badge?]           │  ← absolute top-left, e.g., "新着" "SALE"
├─────────────────────┤
│  Category            │  ← caption, --color-secondary
│  Product Name        │  ← body, 600 weight, max 2 lines (line-clamp-2)
│  ¥12,000 (税込)     │  ← price token; strikethrough for original if on sale
│  ¥9,800 (税込)      │  ← sale price in --color-error
└─────────────────────┘
```

**States:**

| State | Behavior |
|-------|----------|
| `default` | `--shadow-sm`, `--radius-lg`, `bg --color-surface` |
| `hover` | `--shadow-md`, image scale `1.03` (overflow hidden on container), cursor pointer |
| `focus-visible` | Brand focus ring on the card link |
| `out-of-stock` | Image overlay `rgba(255,255,255,0.6)`, "在庫切れ" badge, no hover scale |
| `loading` | Skeleton: gray rect for image, 3 text lines shimmer |

**DoD:**
- [ ] Entire card is a single `<a>` link (no nested interactive elements)
- [ ] Image lazy-loaded with `loading="lazy"` and `decoding="async"`
- [ ] Price formatted with `Intl.NumberFormat("ja-JP")`, tax-inclusive display
- [ ] Badge variants: 新着 (blue), SALE (red), 残りわずか (amber), 在庫切れ (gray)
- [ ] Responsive: 1 col (< 640px), 2 col (640-1023px), 3-4 col (≥ 1024px)

---

### 6.3 ProductGallery

Used on PDP. Shows product images.

**Desktop (≥ 1024px):**
```
┌──────┐ ┌───────────────────────┐
│ thumb│ │                       │
│ thumb│ │    Main Image         │
│ thumb│ │    (click → lightbox) │
│ thumb│ │                       │
│ thumb│ │                       │
└──────┘ └───────────────────────┘
  80px         remaining width
```

**Mobile (< 1024px):**
- Horizontal scroll carousel with dot indicators.
- Swipe support via `scroll-snap-type: x mandatory`.

**States:**

| State | Behavior |
|-------|----------|
| `default` | First image selected, thumbnails listed vertically (desktop) |
| `thumb-hover` | `border: 2px solid --color-brand`, cursor pointer |
| `thumb-active` | `border: 2px solid --color-brand`, slight scale |
| `lightbox` | Full-viewport overlay, `--shadow-xl`, close button top-right, arrow navigation |
| `loading` | Skeleton rectangle, aspect-ratio 4:3 |
| `no-image` | Placeholder icon (image-off) on `--color-bg` background |

**DoD:**
- [ ] Keyboard navigation (arrow keys for thumbnails, Escape for lightbox)
- [ ] Pinch-to-zoom disabled on mobile (handled by lightbox)
- [ ] Images use `srcset` with 400w, 800w, 1200w variants
- [ ] Thumbnail scroll when > 5 images

---

### 6.4 PriceBlock

Displays product pricing with tax info.

**Variants:**

```
/* Standard */
¥12,000 (税込)

/* Sale */
¥15,000  ← strikethrough, --color-muted, text-small
¥12,000 (税込)  ← --text-price, --color-primary
20% OFF  ← badge, --color-error bg

/* Range (variants with different prices) */
¥9,800 〜 ¥15,000 (税込)

/* Free */
無料
```

**Rules:**
- Always display tax-inclusive price as the primary price (Japanese EC law).
- Use `Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" })`.
- Sale badge shows percentage or absolute discount.
- Font: `--text-price` token for primary price. `--text-small` for original/strikethrough.

**DoD:**
- [ ] Correct `aria-label` describing the price (e.g., "価格 12,000円 税込")
- [ ] Sale percentage calculated correctly
- [ ] No floating-point display errors on JPY

---

### 6.5 VariantSelector

Allows selecting product options (size, color, etc.).

**Structure:**
```
サイズ: M              ← label + selected value
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│  S  │ │ [M] │ │  L  │ │ XL  │  ← button group
└─────┘ └─────┘ └─────┘ └─────┘

カラー: レッド
● ● ● ●               ← color swatches (28px circles)
```

**States:**

| State | Behavior |
|-------|----------|
| `default` | Unselected: `border --color-border`, `bg transparent` |
| `selected` | `border --color-primary` (2px), `font-weight 600` |
| `hover` | `border --color-primary`, `bg --color-bg` |
| `focus-visible` | Brand focus ring |
| `disabled` (out of stock) | `opacity 0.3`, strikethrough on text, `cursor not-allowed` |
| `error` (nothing selected) | Red border, error message below |

**Color Swatch States:**
- Selected: 2px border `--color-primary` + checkmark overlay.
- Unavailable: Diagonal line-through.

**DoD:**
- [ ] Updates PriceBlock when variant changes price
- [ ] Updates stock status display
- [ ] `aria-pressed` on selected option
- [ ] Keyboard navigable (arrow keys within group)

---

### 6.6 AddToCart

Primary purchase action component.

**Structure:**
```
┌────────────────────────────────────────┐
│  [ − ]  2  [ + ]                       │  ← Quantity selector
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│         カートに追加                     │  ← Primary button (xl size)
└────────────────────────────────────────┘
```

**States:**

| State | Behavior |
|-------|----------|
| `default` | Brand primary button, full width |
| `hover` | `--color-brand-hover` |
| `loading` | Spinner replaces text, button disabled |
| `success` | Checkmark + "追加しました" for 2s, then revert |
| `disabled` | When out of stock: "在庫切れ" text, `opacity 0.4` |
| `error` | Toast notification for failures (network, stock change) |

**Quantity Selector:**
- Min 1, max = available stock.
- `−` disabled at min, `+` disabled at max.
- Direct number input allowed.

**DoD:**
- [ ] Full-width on mobile, fixed bottom bar with price summary
- [ ] Optimistic UI: immediately updates cart count badge
- [ ] Error recovery: revert cart count if API fails
- [ ] `aria-live="polite"` region announces success/error

---

### 6.7 CartDrawer

Slide-in panel showing cart contents.

**Structure (320px wide, right side):**
```
┌──────────────────────────┐
│  カート (3)        [✕]   │  ← Header with count
├──────────────────────────┤
│  ┌────┐ Product Name     │
│  │ img│ Size: M          │
│  └────┘ ¥12,000          │
│         [−] 2 [+]  [🗑]  │
├──────────────────────────┤
│  ┌────┐ Product Name     │
│  │ img│ ...              │
│  └────┘                  │
├──────────────────────────┤
│  小計:        ¥24,000    │
│  送料:        ¥500       │
│  ─────────────────────── │
│  合計:        ¥24,500    │
│                          │
│  [レジに進む] (primary)   │
│  [買い物を続ける] (ghost)  │
└──────────────────────────┘
```

**States:**

| State | Behavior |
|-------|----------|
| `open` | Slide in from right, 300ms, overlay bg `rgba(0,0,0,0.4)` |
| `close` | Slide out, click overlay or press Escape |
| `empty` | Illustration + "カートは空です" + CTA to products |
| `loading` | Skeleton for items, disabled checkout button |
| `updating` | Item being modified shows inline spinner |

**DoD:**
- [ ] Focus trap when open
- [ ] Close on Escape key
- [ ] Overlay click closes drawer
- [ ] Scroll within item list, fixed footer
- [ ] Remove item with confirmation (or undo toast)

---

### 6.8 CheckoutSummary

Order summary displayed during checkout.

**Structure:**
```
┌──────────────────────────────┐
│  注文内容                      │
├──────────────────────────────┤
│  Product A × 2    ¥24,000    │
│  Product B × 1    ¥5,000     │
├──────────────────────────────┤
│  小計              ¥29,000   │
│  送料              ¥500      │
│  クーポン割引       -¥2,000   │  ← --color-success
│  ────────────────────────── │
│  合計 (税込)       ¥27,500   │  ← --text-price, 700 weight
│  (うち消費税        ¥2,500)  │  ← --text-small, --color-secondary
└──────────────────────────────┘
```

**DoD:**
- [ ] Itemized list with thumbnails (48px)
- [ ] Coupon input field with apply button
- [ ] Real-time total recalculation
- [ ] Shipping calculated after address entry (or "計算中..." placeholder)
- [ ] Tax breakdown per Japanese invoicing requirements

---

### 6.9 SpecTable

Product specifications in tabular format.

**Structure:**
```
| 項目       | 値                |
|-----------|-------------------|
| サイズ     | W120 × D80 × H45 |
| 重量       | 2.5 kg           |
| 素材       | ステンレス鋼      |
| 原産国     | 日本              |
```

**Styling:**
- Alternating row backgrounds: `#ffffff` / `--color-bg`.
- Border: `--color-border-light` horizontal only.
- Label column: `--text-small`, 600 weight, `--color-secondary`, `width: 140px`.
- Value column: `--text-body`, `--color-primary`.
- Responsive: Stacked layout below `640px` (label above value).

---

### 6.10 ComparisonTable

Side-by-side product comparison.

**Structure:**
```
|              | Product A | Product B | Product C |
|--------------|-----------|-----------|-----------|
| 価格         | ¥12,000   | ¥15,000   | ¥9,800   |
| サイズ       | M / L     | S-XL      | フリー    |
| 素材         | 綿100%    | ポリ混    | 綿100%   |
| [カートに追加] | [btn]    | [btn]     | [btn]    |
```

**Styling:**
- Sticky first column on mobile (horizontal scroll for products).
- Header row: product image (80px) + name.
- Highlight best value with `--color-brand` background pill.
- Max 4 products at a time.

---

### 6.11 ShippingReturns

Shipping and returns information block.

**Structure:**
```
📦 配送について
  ・通常配送: 3-5営業日 (¥500、¥10,000以上で送料無料)
  ・速達配送: 1-2営業日 (¥1,200)

↩️ 返品について
  ・商品到着後14日以内
  ・未使用・未開封に限る
  ・返品送料はお客様負担
```

**Styling:**
- Icon (SVG, 20px) + heading + body format.
- Background: `--color-bg`, padding `--space-6`, radius `--radius-lg`.
- Collapsible on mobile (accordion).

---

### 6.12 Warranty

Warranty information display.

**Structure:**
```
🛡️ 保証
  メーカー保証: 1年間
  延長保証: +2年 (¥2,000)
```

**Styling:** Same as ShippingReturns. Grouped in the same info section on PDP.

---

### 6.13 FAQ

Expandable question/answer list.

**Structure:**
```
┌────────────────────────────────┐
│  Q. 送料はいくらですか？    [▼] │
├────────────────────────────────┤
│  A. ¥10,000以上のご注文で       │
│     送料無料です。              │
└────────────────────────────────┘
```

**Implementation:**
- HTML `<details>` / `<summary>` or headless UI accordion.
- Transition: `max-height` with 200ms ease.
- Only one item open at a time (optional, configurable).
- Border: `--color-border-light` between items.

**States:**

| State | Behavior |
|-------|----------|
| `closed` | Question visible, chevron down |
| `open` | Answer visible, chevron up, subtle bg change |
| `hover` | `bg --color-bg` on question row |
| `focus-visible` | Brand focus ring on summary |

---

### 6.14 Reviews

Product review section with ratings.

**Structure:**
```
レビュー (24件)                    ★ 4.3 / 5.0

[レビューを書く] (secondary btn)

Rating breakdown:
★★★★★  ████████████  60%
★★★★☆  ████████      30%
★★★☆☆  ██            5%
★★☆☆☆  █             3%
★☆☆☆☆  ░             2%

───────────────────────
★★★★★  田中太郎  2026-01-15
とても良い製品です。品質が素晴らしい。
[役に立った (3)]
───────────────────────
```

**Stars:**
- SVG icons, 16px. Filled: `#f59e0b` (amber-400). Empty: `--color-border`.
- Half-star support for averages.

**States:**

| State | Behavior |
|-------|----------|
| `loading` | Skeleton list (3 items) |
| `empty` | "まだレビューはありません" + CTA to write first review |
| `error` | "レビューの読み込みに失敗しました" + retry button |
| `submitting` | Form disabled, spinner on submit button |

---

### 6.15 Empty / Loading / Error States

Applies to **all** data-dependent components.

#### EmptyState
```
┌─────────────────────────┐
│      [Illustration]      │  ← SVG, 120px, --color-muted
│                          │
│   タイトル               │  ← --text-h3
│   説明テキスト            │  ← --text-body, --color-secondary
│                          │
│   [CTA Button]           │  ← primary or secondary
└─────────────────────────┘
```

Context-specific messages:
- Cart: "カートは空です" → "商品を探す"
- Search: "該当する商品が見つかりませんでした" → "フィルタをリセット"
- Wishlist: "お気に入りはまだありません" → "商品を探す"
- Orders: "注文履歴はありません" → "商品を探す"

#### LoadingState (Skeleton)

- Use animated `shimmer` (gray gradient sweep, left to right, 1.5s loop).
- Mirror the exact layout of the loaded content (same heights, widths, spacing).
- Skeleton color: `#e5e5ea` → `#f5f5f7` gradient.
- Never show a full-page spinner. Always show structural skeletons.

#### ErrorState
```
┌─────────────────────────┐
│      [Warning icon]      │  ← --color-error, 48px
│                          │
│   エラーが発生しました     │
│   説明テキスト            │
│                          │
│   [再試行]               │  ← secondary button
└─────────────────────────┘
```

---

## 7. Icons

- **Library**: Heroicons (outline, 24px default) or Lucide.
- **Stroke width**: 1.5px.
- **Size tokens**: 16px (inline), 20px (buttons), 24px (navigation), 48px (empty states).
- **Color**: Inherit from text color via `currentColor`.
- **No emoji as icons.** Ever.

---

## 8. Anti-Patterns (Prohibited)

| Pattern | Why |
|---------|-----|
| Bodoni Moda or decorative serif fonts | Reduces readability, inconsistent with system |
| "Liquid Glass" / decorative blur/frost effects | Distracting, performance cost, no information value |
| Black × gold luxury color scheme | Off-brand. Trust > luxury signaling |
| Emojis as functional icons | Inconsistent rendering, unprofessional |
| `transform: scale()` on hover that shifts layout | Causes layout jank |
| Instant state changes (no transition) | Feels broken |
| Full-page loading spinners | Show structural skeletons instead |
| Gradient backgrounds on content sections | Use flat colors and spacing |
| Auto-playing video or animation | Respect user attention and bandwidth |
| Overlapping / negative-margin decorative elements | Fragile layout, z-index issues |
| Low contrast text (< 4.5:1) | WCAG AA violation |
| Hidden focus indicators | Accessibility violation |

---

## 9. Accessibility Checklist

- [ ] Color contrast ≥ 4.5:1 (text), ≥ 3:1 (large text, UI elements)
- [ ] All interactive elements keyboard-accessible
- [ ] Focus indicators visible on all focusable elements
- [ ] `prefers-reduced-motion` disables animations
- [ ] `prefers-color-scheme` respected if dark mode implemented
- [ ] Form inputs have associated `<label>` elements
- [ ] Error messages linked to inputs via `aria-describedby`
- [ ] Images have meaningful `alt` text (or `alt=""` if decorative)
- [ ] Touch targets ≥ 44×44 px on mobile
- [ ] Skip-to-content link as first focusable element

---

## 10. Pre-Delivery Checklist

Before delivering any UI code:

- [ ] Uses only `Inter` / `Noto Sans JP` / `system-ui` fonts
- [ ] No decorative blur, glass, or gradient effects on content
- [ ] Brand color used only for CTAs and interactive elements
- [ ] All interactive elements have all 6 states (default/hover/focus/active/disabled/loading)
- [ ] Skeletons match loaded content layout
- [ ] Empty and error states handled
- [ ] `cursor: pointer` on all clickable elements
- [ ] Transitions on all state changes (150-300ms)
- [ ] Responsive at 375px, 640px, 768px, 1024px, 1280px
- [ ] No horizontal scroll on mobile
- [ ] `prefers-reduced-motion` respected
- [ ] WCAG AA contrast ratios met
- [ ] No console.log statements
- [ ] Price display uses `Intl.NumberFormat` with JPY
