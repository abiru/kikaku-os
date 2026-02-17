export type StorefrontRow = {
  product_id: number;
  product_title: string;
  product_description: string | null;
  product_metadata: string | null;
  tax_rate_id: number | null;
  tax_rate: number | null;
  variant_id: number;
  variant_title: string;
  sku: string | null;
  price_id: number;
  amount: number;
  currency: string;
  provider_price_id: string | null;
  image_id: number | null;
  image_r2_key: string | null;
  image_position: number | null;
  on_hand: number;
};

export type StorefrontVariant = {
  id: number;
  title: string;
  sku: string | null;
  stock: number;
  price: {
    id: number;
    amount: number;
    currency: string;
    provider_price_id: string | null;
  };
};

export type StorefrontProduct = {
  id: number;
  title: string;
  description: string | null;
  tax_rate: number | null;
  image: string | null;
  mainImage: string | null;
  images: string[];
  variants: StorefrontVariant[];
};

export type CategoryRow = { category: string | null };
export type PriceRangeRow = { minPrice: number | null; maxPrice: number | null };

export type OrderItemRow = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

export type OrderRow = {
  id: number;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  metadata: string | null;
  customer_email: string | null;
  shipping_fee: number;
  total_discount: number;
};

export type FulfillmentRow = {
  id: number;
  status: string;
  tracking_number: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

export type StaticPageRow = {
  id: number;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  body: string;
  status: string;
  updated_at: string;
};

export type HeroSectionRow = {
  id: number;
  title: string;
  subtitle: string | null;
  image_r2_key: string | null;
  image_r2_key_small: string | null;
  cta_primary_text: string | null;
  cta_primary_url: string | null;
  cta_secondary_text: string | null;
  cta_secondary_url: string | null;
  position: number;
};

export type FeaturedProductRow = {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  product_metadata: string | null;
  r2_key: string | null;
};
