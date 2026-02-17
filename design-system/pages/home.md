# Page Spec — Home (Landing Page)

> Overrides `master.md` where specified. All other rules from `master.md` apply.

---

## Layout

**Single-column layout.** This is the only page where single-column is the default pattern.

```
┌──────────────────────────────────────────┐
│  SiteHeader (sticky)                      │
├──────────────────────────────────────────┤
│  1. Hero                                  │
├──────────────────────────────────────────┤
│  2. Value Propositions                    │
├──────────────────────────────────────────┤
│  3. Featured Products                     │
├──────────────────────────────────────────┤
│  4. Category Grid                         │
├──────────────────────────────────────────┤
│  5. Social Proof / Testimonials           │
├──────────────────────────────────────────┤
│  6. Newsletter CTA                        │
├──────────────────────────────────────────┤
│  SiteFooter                               │
└──────────────────────────────────────────┘
```

**Container**: `max-width: 1280px` for all sections except Hero (full-width).

---

## Section 1: Hero

**Purpose**: Single clear CTA. Communicate brand value in < 3 seconds.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│     [Headline — H1, max 2 lines]                     │
│     [Subheadline — body, --color-secondary, 1-2 lines]│
│                                                      │
│     [Primary CTA — xl button]   [Secondary CTA?]     │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Specs:**
- Full viewport width, content constrained to container.
- Background: `--color-bg` or high-quality product image with text overlay.
- If image background: scrim gradient `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.1))`, text color white.
- Minimum height: `60vh` desktop, `50vh` mobile.
- Headline: `--text-h1`, may scale up to `3rem` (48px) on `≥ 1024px` for hero only.
- One primary CTA. Optional secondary CTA (ghost style).
- No autoplay carousel. If multiple heroes, use manual navigation dots.

**Admin-managed**: Hero content is managed via admin `/admin/home-heroes`.

---

## Section 2: Value Propositions

**Purpose**: Communicate key differentiators and build trust.

**Layout:**
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   [Icon]    │  │   [Icon]    │  │   [Icon]    │  │   [Icon]    │
│   Title     │  │   Title     │  │   Title     │  │   Title     │
│   Desc      │  │   Desc      │  │   Desc      │  │   Desc      │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

**Specs:**
- 4-column grid on desktop, 2-column on tablet, 1-column on mobile.
- Icon: Heroicons outline, 32px, `--color-brand`.
- Title: `--text-h3`.
- Description: `--text-small`, `--color-secondary`, max 2 lines.
- Background: `--color-surface` (white), or same as page bg with subtle top/bottom border.
- Section padding: `--space-16` top/bottom.
- Examples: "送料無料 (¥10,000以上)", "品質保証", "安心決済", "サポート対応".

---

## Section 3: Featured Products

**Purpose**: Showcase curated products to drive discovery.

**Layout:**
```
Section Heading: おすすめ商品         [すべて見る →]
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ProductCard│  │ProductCard│  │ProductCard│  │ProductCard│
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Specs:**
- Section heading: `--text-h2`, left-aligned, with "すべて見る" link right-aligned.
- 4-column grid desktop, 2-column tablet/mobile.
- Uses `ProductCard` component from master.md (§6.2).
- Max 8 products. Horizontal scroll carousel on mobile if > 4 items.
- Section padding: `--space-16` top/bottom.
- Products selected via admin or algorithm (new arrivals, bestsellers).

---

## Section 4: Category Grid

**Purpose**: Enable browsing by category.

**Layout:**
```
カテゴリから探す

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  [Image]         │  │  [Image]         │  │  [Image]         │
│  Category Name   │  │  Category Name   │  │  Category Name   │
└──────────────────┘  └──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  [Image]         │  │  [Image]         │  │  [Image]         │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Specs:**
- 3-column grid desktop, 2-column tablet, 1-column mobile.
- Each card: image (aspect-ratio 3:2) + category name overlay at bottom.
- Image has subtle `linear-gradient(transparent 50%, rgba(0,0,0,0.5))` overlay for text legibility.
- Text: white, `--text-h3`, 600 weight, positioned bottom-left with `--space-4` padding.
- Hover: image scale `1.05` with `overflow: hidden` on container.
- Entire card is a link to `/categories/[slug]`.
- `--radius-lg` on cards.

---

## Section 5: Social Proof

**Purpose**: Build credibility through customer evidence.

**Layout** (choose one or combine):

### Option A: Testimonials
```
┌─────────────────────────────────────────┐
│  "素晴らしい品質です。リピート確定。"      │
│                                         │
│  ★★★★★  田中太郎                        │
└─────────────────────────────────────────┘
```

- 3-column grid of quote cards, or horizontal scroll carousel.
- Quote: `--text-body`, italic style.
- Author: `--text-small`, `--color-secondary`.
- Stars: amber fill.

### Option B: Stats
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  10,000+ │  │   4.8★   │  │   98%    │
│  販売実績  │  │ 平均評価  │  │ 満足度   │
└──────────┘  └──────────┘  └──────────┘
```

- Numbers: `--text-h1`, `--color-primary`, 700 weight.
- Labels: `--text-small`, `--color-secondary`.
- Optional: count-up animation on scroll into view (respect `prefers-reduced-motion`).

### Option C: Partner Logos
- Horizontal row of grayscale logos, `opacity: 0.5`, hover `opacity: 1`.
- Max 6 logos, evenly spaced.

---

## Section 6: Newsletter CTA

**Purpose**: Capture email leads.

**Layout:**
```
┌──────────────────────────────────────────┐
│  bg: --color-bg                          │
│                                          │
│  最新情報をお届けします                    │
│  新商品やセール情報をメールでお届け。       │
│                                          │
│  [email input          ] [登録する]       │
│                                          │
│  ※ いつでも配信停止可能です                │
└──────────────────────────────────────────┘
```

**Specs:**
- Background: `--color-bg` to differentiate from surrounding white sections.
- Text centered.
- Input + button inline on desktop, stacked on mobile.
- Input: `--radius-md`, height matches button.
- Privacy note: `--text-caption`, `--color-muted`.
- Success state: Replace form with "ご登録ありがとうございます" message.
- Error state: Inline error below input.

---

## Responsive Behavior

| Section | Desktop (≥ 1024px) | Tablet (768-1023px) | Mobile (< 768px) |
|---------|-------------------|--------------------|--------------------|
| Hero | `60vh`, `3rem` headline | `50vh`, `2.25rem` headline | `50vh`, `1.75rem` headline |
| Value Props | 4-column | 2-column | 1-column stacked |
| Featured Products | 4-column grid | 2-column grid | 2-column grid or carousel |
| Category Grid | 3-column | 2-column | 1-column |
| Social Proof | 3-column | 2-column | Carousel |
| Newsletter | Inline form | Inline form | Stacked form |

---

## Performance Notes

- Hero image: preload via `<link rel="preload">`, WebP format, max 200 KB.
- Product images: lazy-load below fold.
- Stats animation: use `IntersectionObserver`, no libraries.
- Target LCP < 2.5s (hero image is likely LCP element).
