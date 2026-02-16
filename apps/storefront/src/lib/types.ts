export type HeroSection = {
  id: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  image?: string | null;
  imageSmall?: string | null;
  link_url: string | null;
  link_text: string | null;
  cta_primary_text?: string | null;
  cta_primary_url?: string | null;
  cta_secondary_text?: string | null;
  cta_secondary_url?: string | null;
  sort_order: number;
  position: number;
  status: string;
  updated_at: string;
};

export type ProductVariant = {
  id: number;
  title?: string | null;
  sku: string | null;
  price: { amount: number; currency: string };
  stock?: number | null;
  inventory?: number | null;
  metadata: string | null;
};

export type ProductImage = {
  id: number;
  url: string;
  alt: string | null;
  sort_order: number;
};

export type Product = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  image: string | null;
  mainImage?: string | null;
  category: string | null;
  tax_rate?: number | null;
  tax_rate_id?: number | null;
  details?: string[] | null;
  featured?: number | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  variants: ProductVariant[];
  images: ProductImage[];
};

export type OrderItem = {
  id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  product_title: string | null;
  variant_sku: string | null;
};

export type Order = {
  id: number;
  email: string | null;
  customer_email: string | null;
  status: string;
  fulfillment_status: string | null;
  total: number;
  total_net: number;
  total_amount?: number | null;
  currency: string;
  tax_amount: number;
  discount_amount: number;
  shipping_amount: number;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  items: OrderItem[];
};

export type Payment = {
  id: number;
  order_id: number;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_id: string | null;
  created_at: string;
};

export type Refund = {
  id: number;
  order_id: number;
  amount: number;
  reason: string | null;
  status: string;
  provider_refund_id: string | null;
  created_at: string;
};

export type StripeEvent = {
  id: number;
  event_id: string;
  event_type: string;
  payload: string;
  processed_at: string;
};

export type InboxItem = {
  id: number;
  title: string;
  body: string | null;
  severity: string;
  status: string;
  kind: string | null;
  date: string | null;
  metadata: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: number;
  date: string;
  account: string;
  debit: number;
  credit: number;
  memo: string | null;
  created_at: string;
};

export type DailyReport = {
  id: number;
  date: string;
  total_orders: number;
  total_revenue: number;
  total_refunds: number;
  net_revenue: number;
  created_at: string;
};

export type ContactInquiry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

export type AdDraft = {
  id: number;
  name: string;
  headlines: string | null;
  descriptions: string | null;
  keywords: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Quotation = {
  id: number;
  quote_id: string;
  email: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_amount: number;
  total: number;
  currency: string;
  items: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type StaticPage = {
  id: number;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  body: string;
  status: string;
  updated_at: string;
};
