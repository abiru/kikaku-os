/**
 * Seed data definitions and helper functions for the /dev/seed endpoint.
 *
 * Extracted from dev.ts to keep route handlers lean.
 */

export type ProductSeedDef = {
  title: string;
  description: string;
  category: string;
  status: string;
  featured: number;
  sku: string;
  price: number;
  stock: number;
  imageUrl: string;
};

export const HERO_IMAGE_PAIRS: ReadonlyArray<{ main: string; small: string }> = [
  { main: '/seed/heroes/hero-01-main.svg', small: '/seed/heroes/hero-01-small.svg' },
  { main: '/seed/heroes/hero-02-main.svg', small: '/seed/heroes/hero-02-small.svg' },
  { main: '/seed/heroes/hero-03-main.svg', small: '/seed/heroes/hero-03-small.svg' },
];

export const HERO_TEMPLATES: ReadonlyArray<{
  title: string;
  subtitle: string;
  ctaPrimaryText: string;
  ctaPrimaryUrl: string;
}> = [
  {
    title: '高品質LED照明で暮らしを変える',
    subtitle: 'プロ仕様の照明機器をお手頃価格で。送料無料キャンペーン実施中。',
    ctaPrimaryText: '商品を見る',
    ctaPrimaryUrl: '/products'
  },
  {
    title: '新商品入荷',
    subtitle: '最新のスマート照明・電源機器が続々登場。',
    ctaPrimaryText: '新商品をチェック',
    ctaPrimaryUrl: '/products'
  },
  {
    title: 'レビュー高評価アイテム',
    subtitle: '実際の導入ユーザーから支持される人気モデルを掲載中。',
    ctaPrimaryText: '人気商品へ',
    ctaPrimaryUrl: '/products'
  }
];

export const ADDITIONAL_PRODUCTS: ReadonlyArray<ProductSeedDef> = [
  {
    title: 'LEDデスクライト Pro',
    description: 'プロフェッショナル向け高演色デスクライト。調光・調色機能付き。',
    category: 'LED照明',
    status: 'active',
    featured: 1,
    sku: 'LED-DESK-PRO',
    price: 12800,
    stock: 25,
    imageUrl: '/seed/products/led-desk-pro.svg'
  },
  {
    title: 'LEDシーリングライト 8畳',
    description: '8畳用LEDシーリングライト。リモコン付き、省エネ設計。',
    category: 'LED照明',
    status: 'active',
    featured: 1,
    sku: 'LED-CEIL-8',
    price: 15800,
    stock: 15,
    imageUrl: '/seed/products/led-ceiling-8.svg'
  },
  {
    title: 'USB充電アダプター 65W',
    description: '65W GaN充電器。USB-C×2、USB-A×1。PD3.0対応。',
    category: 'アクセサリー',
    status: 'active',
    featured: 0,
    sku: 'USB-CHG-65W',
    price: 4980,
    stock: 50,
    imageUrl: '/seed/products/usb-charger-65w.svg'
  },
  {
    title: 'LEDテープライト 5m',
    description: 'RGB LEDテープライト5m。リモコン付き、切断可能。',
    category: 'アクセサリー',
    status: 'active',
    featured: 0,
    sku: 'LED-TAPE-5M',
    price: 3280,
    stock: 40,
    imageUrl: '/seed/products/led-tape-5m.svg'
  },
  {
    title: 'スマート電源タップ',
    description: 'Wi-Fi対応スマート電源タップ。4口+USB。タイマー・音声操作対応。',
    category: '電源機器',
    status: 'active',
    featured: 0,
    sku: 'PWR-TAP-SMART',
    price: 6980,
    stock: 30,
    imageUrl: '/seed/products/smart-power-strip.svg'
  },
];

export const REVIEW_DEFS: ReadonlyArray<{
  email: string;
  name: string;
  rating: number;
  title: string;
  body: string;
  status: string;
}> = [
  { email: 'tanaka@example.com', name: '田中太郎', rating: 5, title: '素晴らしい品質', body: 'とても明るくて目に優しいです。仕事用に最適。', status: 'approved' },
  { email: 'suzuki@example.com', name: '鈴木花子', rating: 4, title: 'コスパが良い', body: '価格の割に品質が良く、満足しています。', status: 'approved' },
  { email: 'sato@example.com', name: '佐藤健', rating: 5, title: '期待通り', body: 'デザインも機能も期待通りでした。リピート購入予定です。', status: 'approved' },
  { email: 'yamada@example.com', name: '山田美咲', rating: 3, title: '普通です', body: '可もなく不可もなく。もう少し明るさが欲しい。', status: 'pending' },
  { email: 'ito@example.com', name: '伊藤誠', rating: 4, title: '取り付け簡単', body: '説明書がわかりやすく、10分で取り付けできました。', status: 'pending' },
];

export const INQUIRY_DEFS: ReadonlyArray<{
  name: string;
  email: string;
  subject: string;
  body: string;
  status: string;
}> = [
  { name: '高橋一郎', email: 'takahashi@example.com', subject: '大量注文の割引について', body: 'オフィス用に50台のデスクライトを検討しています。法人割引はありますか？', status: 'open' },
  { name: '渡辺真理', email: 'watanabe@example.com', subject: '返品について', body: '先日購入した商品のサイズが合いませんでした。返品手続きを教えてください。', status: 'open' },
  { name: '小林健太', email: 'kobayashi@example.com', subject: '商品の保証期間', body: 'LEDシーリングライトの保証期間を教えてください。', status: 'closed' },
];

export const getStaticPageBody = (slug: string): string | null => {
  const bodies: Record<string, string> = {
    privacy: [
      '<h2>個人情報保護方針</h2>',
      '<p>当社は、お客様の個人情報を適切に保護し、以下の方針に基づき取り扱います。</p>',
      '<h2>収集する情報</h2>',
      '<p>当サイトでは、ご注文・お問い合わせの際に、お名前、メールアドレス、住所等の情報をお預かりします。</p>',
      '<h2>利用目的</h2>',
      '<p>取得した個人情報は、商品の発送、お問い合わせへの対応、サービス改善の目的でのみ利用いたします。</p>',
      '<h2>第三者への提供</h2>',
      '<p>法令に基づく場合を除き、お客様の同意なく個人情報を第三者に提供することはありません。</p>',
    ].join('\n'),
    terms: [
      '<h2>利用規約</h2>',
      '<p>本規約は、当社が提供するオンラインストアの利用条件を定めるものです。</p>',
      '<h2>売買契約</h2>',
      '<p>利用者が注文を行い、当社が注文確認メールを送信した時点で売買契約が成立します。</p>',
      '<h2>禁止事項</h2>',
      '<p>不正アクセス、なりすまし、その他法令に違反する行為を禁止します。</p>',
      '<h2>免責事項</h2>',
      '<p>天災やシステム障害等の不可抗力による損害について、当社は責任を負いかねます。</p>',
    ].join('\n'),
    refund: [
      '<h2>返品・返金ポリシー</h2>',
      '<p>お客様に安心してご利用いただくため、以下のポリシーを定めています。</p>',
      '<h2>お客様都合による返品</h2>',
      '<p>未使用・未開封の商品に限り、到着後7日以内にご連絡いただければ返品を承ります。返送料はお客様負担となります。</p>',
      '<h2>不良品・誤配送</h2>',
      '<p>不良品や誤配送の場合は、当社負担にて交換または返金いたします。到着後7日以内にご連絡ください。</p>',
      '<h2>返金方法</h2>',
      '<p>返金はご購入時の決済方法へ行います。処理には通常5〜10営業日を要します。</p>',
    ].join('\n'),
  };
  return bodies[slug] ?? null;
};

export const ensureImageMetadata = (
  rawMetadata: string | null,
  imageUrl: string
): { metadata: string; changed: boolean } => {
  let base: Record<string, unknown> = {};

  if (rawMetadata) {
    try {
      const parsed = JSON.parse(rawMetadata) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore parse errors and replace invalid metadata with a clean JSON object.
    }
  }

  if (base.image_url === imageUrl) {
    return { metadata: JSON.stringify(base), changed: false };
  }

  return {
    metadata: JSON.stringify({ ...base, image_url: imageUrl }),
    changed: true
  };
};

export const seedProductWithVariant = async (
  db: D1Database,
  def: ProductSeedDef,
  timestamp: string
): Promise<{
  productCreated: number;
  variantCreated: number;
  priceCreated: number;
  inventoryCreated: number;
  metadataUpdated: number;
}> => {
  const existing = await db.prepare(
    `SELECT id, metadata FROM products WHERE title=?`
  ).bind(def.title).first<{ id: number; metadata: string | null }>();

  let productId = existing?.id;
  let productCreated = 0;
  let metadataUpdated = 0;
  const metadataResult = def.imageUrl
    ? ensureImageMetadata(existing?.metadata ?? null, def.imageUrl)
    : null;

  if (!productId) {
    const res = await db.prepare(
      `INSERT INTO products (title, description, status, category, featured, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      def.title,
      def.description,
      def.status,
      def.category,
      def.featured,
      metadataResult?.metadata ?? null,
      timestamp,
      timestamp
    ).run();
    productId = Number(res.meta.last_row_id);
    productCreated = 1;
    if (metadataResult?.changed) metadataUpdated = 1;
  } else if (metadataResult?.changed) {
    await db.prepare(
      `UPDATE products SET metadata=?, updated_at=? WHERE id=?`
    ).bind(metadataResult.metadata, timestamp, productId).run();
    metadataUpdated = 1;
  }

  const existingVariant = await db.prepare(
    `SELECT id FROM variants WHERE sku=?`
  ).bind(def.sku).first<{ id: number }>();

  let variantId = existingVariant?.id;
  let variantCreated = 0;
  if (!variantId) {
    const res = await db.prepare(
      `INSERT INTO variants (product_id, title, sku, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(productId, 'Default', def.sku, timestamp, timestamp).run();
    variantId = Number(res.meta.last_row_id);
    variantCreated = 1;
  }

  const existingPrice = await db.prepare(
    `SELECT id FROM prices WHERE variant_id=? AND currency='JPY'`
  ).bind(variantId).first<{ id: number }>();

  let priceCreated = 0;
  if (!existingPrice) {
    await db.prepare(
      `INSERT INTO prices (variant_id, currency, amount, created_at, updated_at) VALUES (?, 'JPY', ?, ?, ?)`
    ).bind(variantId, def.price, timestamp, timestamp).run();
    priceCreated = 1;
  }

  const existingMovement = await db.prepare(
    `SELECT id FROM inventory_movements WHERE variant_id=? AND reason='seed_initial_stock'`
  ).bind(variantId).first<{ id: number }>();

  let inventoryCreated = 0;
  if (!existingMovement) {
    await db.prepare(
      `INSERT INTO inventory_movements (variant_id, delta, reason, created_at, updated_at) VALUES (?, ?, 'seed_initial_stock', ?, ?)`
    ).bind(variantId, def.stock, timestamp, timestamp).run();
    inventoryCreated = 1;
  }

  return { productCreated, variantCreated, priceCreated, inventoryCreated, metadataUpdated };
};
