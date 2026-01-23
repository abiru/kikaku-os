import { z } from 'zod';

// === Product Schemas ===

export const productStatusSchema = z.enum(['active', 'draft', 'archived']);

export const createProductSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  description: z
    .string()
    .max(10000, 'Description must be 10000 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  status: productStatusSchema.optional().default('active'),
  category: z
    .string()
    .max(255, 'Category must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  tax_rate_id: z
    .number()
    .int()
    .positive('Tax rate ID must be a positive integer')
    .optional()
    .nullable(),
});

export const updateProductSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  description: z
    .string()
    .max(10000, 'Description must be 10000 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  status: productStatusSchema.optional().default('active'),
  category: z
    .string()
    .max(255, 'Category must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  tax_rate_id: z
    .number()
    .int()
    .positive('Tax rate ID must be a positive integer')
    .optional()
    .nullable(),
});

export const productIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const productListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'active', 'draft', 'archived']).optional().default('all'),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

// Storefront products query (public-facing, no status filter)
export const storefrontProductsQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  category: z.string().max(50).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

// === Order Schemas ===

export const orderIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const orderListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

// === Variant Schemas ===

export const createVariantSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  sku: z
    .string()
    .max(100, 'SKU must be 100 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  options: z.record(z.string(), z.string()).optional().nullable(),
});

export const updateVariantSchema = createVariantSchema;

export const variantIdParamSchema = z.object({
  variantId: z
    .string()
    .regex(/^\d+$/, 'Variant ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Variant ID must be greater than 0'),
});

export const productVariantParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'Product ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Product ID must be greater than 0'),
  variantId: z
    .string()
    .regex(/^\d+$/, 'Variant ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Variant ID must be greater than 0'),
});

// === Price Schemas ===

export const priceItemSchema = z.object({
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters')
    .toUpperCase()
    .default('JPY'),
  amount: z
    .number()
    .int('Amount must be an integer')
    .min(0, 'Amount must be 0 or greater'),
  provider_price_id: z
    .string()
    .max(100, 'Stripe Price ID must be 100 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

export const updatePricesSchema = z.object({
  prices: z
    .array(priceItemSchema)
    .min(1, 'At least one price is required')
    .max(10, 'Maximum 10 prices allowed'),
});

// === Inventory Schemas ===

export const movementReasonSchema = z.enum([
  'restock',
  'adjustment',
  'damaged',
  'return',
  'sale',
  'other',
]);

export const createMovementSchema = z.object({
  variant_id: z
    .number()
    .int('Variant ID must be an integer')
    .positive('Variant ID must be positive'),
  delta: z.number().int('Delta must be an integer'),
  reason: movementReasonSchema,
});

export const updateThresholdSchema = z.object({
  threshold: z
    .number()
    .int('Threshold must be an integer')
    .min(0, 'Threshold must be 0 or greater'),
});

export const thresholdParamSchema = z.object({
  variantId: z
    .string()
    .regex(/^\d+$/, 'Variant ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Variant ID must be greater than 0'),
});

// Type exports for use in handlers
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductIdParam = z.infer<typeof productIdParamSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StorefrontProductsQuery = z.infer<typeof storefrontProductsQuerySchema>;
export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type VariantIdParam = z.infer<typeof variantIdParamSchema>;
export type ProductVariantParam = z.infer<typeof productVariantParamSchema>;
export type UpdatePricesInput = z.infer<typeof updatePricesSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type ThresholdParam = z.infer<typeof thresholdParamSchema>;

// === Customer Schemas ===

export const customerListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

export const customerIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const createCustomerSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .transform((v) => v.trim()),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

export const updateCustomerSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .transform((v) => v.trim()),
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// === Fulfillment Schemas ===

export const fulfillmentStatusSchema = z.enum([
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);

export const fulfillmentIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const orderFulfillmentParamSchema = z.object({
  orderId: z
    .string()
    .regex(/^\d+$/, 'Order ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Order ID must be greater than 0'),
});

export const createFulfillmentSchema = z.object({
  status: fulfillmentStatusSchema.optional().default('pending'),
  tracking_number: z
    .string()
    .max(100, 'Tracking number must be 100 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

export const updateFulfillmentSchema = z.object({
  status: fulfillmentStatusSchema,
  tracking_number: z
    .string()
    .max(100, 'Tracking number must be 100 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

export type FulfillmentIdParam = z.infer<typeof fulfillmentIdParamSchema>;
export type OrderFulfillmentParam = z.infer<typeof orderFulfillmentParamSchema>;
export type CreateFulfillmentInput = z.infer<typeof createFulfillmentSchema>;
export type UpdateFulfillmentInput = z.infer<typeof updateFulfillmentSchema>;

// === Product Image Schemas ===

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_IMAGES_PER_PRODUCT = 10;

export const productImageParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'Product ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Product ID must be greater than 0'),
  imageId: z
    .string()
    .regex(/^\d+$/, 'Image ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'Image ID must be greater than 0'),
});

export const updateImageOrderSchema = z.object({
  imageIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one image ID is required'),
});

export type ProductImageParam = z.infer<typeof productImageParamSchema>;
export type UpdateImageOrderInput = z.infer<typeof updateImageOrderSchema>;

// === Category Schemas ===

export const categoryNameParamSchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(255, 'Category name must be 255 characters or less')
    .transform((v) => decodeURIComponent(v.trim())),
});

export const categoryListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
});

export const renameCategorySchema = z.object({
  newName: z
    .string()
    .min(1, 'New category name is required')
    .max(255, 'Category name must be 255 characters or less')
    .transform((v) => v.trim()),
});

export const deleteCategorySchema = z.object({
  moveTo: z
    .string()
    .max(255, 'Category name must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

export type CategoryNameParam = z.infer<typeof categoryNameParamSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;

// === Coupon Schemas ===

export const couponTypeSchema = z.enum(['percentage', 'fixed']);
export const couponStatusSchema = z.enum(['active', 'inactive']);

export const couponIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const couponListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50, 'Code must be 50 characters or less')
    .transform((v) => v.trim().toUpperCase()),
  type: couponTypeSchema,
  value: z
    .number()
    .int('Value must be an integer')
    .positive('Value must be positive'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters')
    .toUpperCase()
    .optional()
    .default('JPY'),
  min_order_amount: z
    .number()
    .int('Minimum order amount must be an integer')
    .min(0, 'Minimum order amount must be 0 or greater')
    .optional()
    .default(0),
  max_uses: z
    .number()
    .int('Max uses must be an integer')
    .positive('Max uses must be positive')
    .optional()
    .nullable(),
  uses_per_customer: z
    .number()
    .int('Uses per customer must be an integer')
    .positive('Uses per customer must be positive')
    .optional()
    .default(1),
  status: couponStatusSchema.optional().default('active'),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export const updateCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50, 'Code must be 50 characters or less')
    .transform((v) => v.trim().toUpperCase()),
  type: couponTypeSchema,
  value: z
    .number()
    .int('Value must be an integer')
    .positive('Value must be positive'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters')
    .toUpperCase()
    .optional()
    .default('JPY'),
  min_order_amount: z
    .number()
    .int('Minimum order amount must be an integer')
    .min(0, 'Minimum order amount must be 0 or greater')
    .optional()
    .default(0),
  max_uses: z
    .number()
    .int('Max uses must be an integer')
    .positive('Max uses must be positive')
    .optional()
    .nullable(),
  uses_per_customer: z
    .number()
    .int('Uses per customer must be an integer')
    .positive('Uses per customer must be positive')
    .optional()
    .default(1),
  status: couponStatusSchema.optional().default('active'),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export type CouponIdParam = z.infer<typeof couponIdParamSchema>;
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

// === Static Page Schemas ===

export const pageStatusSchema = z.enum(['published', 'draft']);

export const pageIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const pageSlugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

export const pageListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'published', 'draft']).optional().default('all'),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

export const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((v) => v.trim().toLowerCase()),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  meta_title: z
    .string()
    .max(255, 'Meta title must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  meta_description: z
    .string()
    .max(500, 'Meta description must be 500 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  body: z
    .string()
    .max(100000, 'Body must be 100000 characters or less')
    .optional()
    .default(''),
  status: pageStatusSchema.optional().default('draft'),
});

export const updatePageSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((v) => v.trim().toLowerCase()),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  meta_title: z
    .string()
    .max(255, 'Meta title must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  meta_description: z
    .string()
    .max(500, 'Meta description must be 500 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  body: z
    .string()
    .max(100000, 'Body must be 100000 characters or less')
    .optional()
    .default(''),
  status: pageStatusSchema.optional().default('draft'),
});

export type PageIdParam = z.infer<typeof pageIdParamSchema>;
export type PageSlugParam = z.infer<typeof pageSlugParamSchema>;
export type PageListQuery = z.infer<typeof pageListQuerySchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

// === Email Template Schemas ===

export const emailTemplateSlugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

export const updateEmailTemplateSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(255, 'Subject must be 255 characters or less')
    .transform((v) => v.trim()),
  body_html: z
    .string()
    .max(100000, 'HTML body must be 100000 characters or less'),
  body_text: z
    .string()
    .max(50000, 'Text body must be 50000 characters or less'),
});

export const previewEmailTemplateSchema = z.object({
  to: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less'),
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
});

export type EmailTemplateSlugParam = z.infer<typeof emailTemplateSlugParamSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;

// === Tax Rate Schemas ===

export const createTaxRateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .transform((v) => v.trim()),
  rate: z
    .number()
    .min(0, 'Rate must be non-negative')
    .max(1, 'Rate must be between 0 and 1')
    .refine((val) => val >= 0 && val <= 1, 'Rate must be a decimal between 0 and 1 (e.g., 0.10 for 10%)'),
  applicable_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform((v) => v.trim()),
  applicable_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform((v) => v.trim())
    .optional()
    .nullable(),
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  is_active: z.boolean().optional().default(true),
});

export const updateTaxRateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .transform((v) => v.trim())
    .optional(),
  rate: z
    .number()
    .min(0, 'Rate must be non-negative')
    .max(1, 'Rate must be between 0 and 1')
    .optional(),
  applicable_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform((v) => v.trim())
    .optional(),
  applicable_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform((v) => v.trim())
    .optional()
    .nullable(),
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .transform((v) => v?.trim() || null)
    .optional()
    .nullable(),
  is_active: z.boolean().optional(),
});

export const taxRateIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Tax rate ID must be a positive integer'),
});

export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
export type TaxRateIdParam = z.infer<typeof taxRateIdParamSchema>;

// === Google Ads Schemas ===

export const adTypeSchema = z.enum(['search', 'display', 'performance_max']);
export const adStatusSchema = z.enum(['draft', 'ready']);
export const adLanguageSchema = z.enum(['ja', 'en']);
export const adToneSchema = z.enum(['professional', 'casual', 'urgent', 'informative']);

// AI Generation Request Schema
export const adGenerateRequestSchema = z.object({
  productName: z.string().min(1, 'Product name is required').max(255).transform((v) => v.trim()),
  productDescription: z.string().min(1, 'Product description is required').max(5000).transform((v) => v.trim()),
  targetAudience: z.string().min(1, 'Target audience is required').max(500).transform((v) => v.trim()),
  keywords: z.array(z.string().max(100)).min(1, 'At least one keyword required').max(20, 'Maximum 20 keywords'),
  tone: adToneSchema,
  language: adLanguageSchema,
  adType: adTypeSchema,
  finalUrl: z.string().url('Invalid URL format'),
  draftId: z.number().int().positive().optional(),
});

// Ad Draft Create Schema
export const createAdDraftSchema = z.object({
  campaign_name: z.string().min(1, 'Campaign name is required').max(255).transform((v) => v.trim()),
  ad_type: adTypeSchema.optional().default('search'),
  status: adStatusSchema.optional().default('draft'),
  language: adLanguageSchema.optional().default('ja'),

  product_id: z.number().int().positive().optional().nullable(),
  product_name: z.string().max(255).optional().nullable().transform((v) => v?.trim() || null),
  product_description: z.string().max(5000).optional().nullable().transform((v) => v?.trim() || null),
  target_audience: z.string().max(500).optional().nullable().transform((v) => v?.trim() || null),

  headlines: z.array(z.string().max(30)).min(1, 'At least 1 headline required').max(15, 'Maximum 15 headlines'),
  descriptions: z.array(z.string().max(90)).min(1, 'At least 1 description required').max(4, 'Maximum 4 descriptions'),
  keywords: z.array(z.string().max(100)).optional().nullable(),

  final_url: z.string().url('Invalid URL format'),
  daily_budget: z.number().int().nonnegative().optional().nullable(),
  tone: adToneSchema.optional().nullable(),

  last_prompt: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Ad Draft Update Schema (all fields optional)
export const updateAdDraftSchema = z.object({
  campaign_name: z.string().min(1).max(255).optional(),
  ad_type: adTypeSchema.optional(),
  status: adStatusSchema.optional(),
  language: adLanguageSchema.optional(),

  product_id: z.number().int().positive().optional().nullable(),
  product_name: z.string().max(255).optional().nullable(),
  product_description: z.string().max(5000).optional().nullable(),
  target_audience: z.string().max(500).optional().nullable(),

  headlines: z.array(z.string().max(30)).min(1).max(15).optional(),
  descriptions: z.array(z.string().max(90)).min(1).max(4).optional(),
  keywords: z.array(z.string().max(100)).optional().nullable(),

  final_url: z.string().url().optional(),
  daily_budget: z.number().int().nonnegative().optional().nullable(),
  tone: adToneSchema.optional().nullable(),

  last_prompt: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Ad Draft ID Param Schema
export const adDraftIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

// Ad Draft List Query Schema
export const adDraftListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'draft', 'ready']).optional().default('all'),
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('1')
    .transform((v) => Math.max(1, parseInt(v, 10))),
  perPage: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .default('20')
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
});

// Select History Schema
export const selectHistorySchema = z.object({
  historyId: z.number().int().positive('History ID must be a positive integer'),
});

export type AdGenerateRequest = z.infer<typeof adGenerateRequestSchema>;
export type CreateAdDraftInput = z.infer<typeof createAdDraftSchema>;
export type UpdateAdDraftInput = z.infer<typeof updateAdDraftSchema>;
export type AdDraftIdParam = z.infer<typeof adDraftIdParamSchema>;
export type AdDraftListQuery = z.infer<typeof adDraftListQuerySchema>;
export type SelectHistoryInput = z.infer<typeof selectHistorySchema>;

// === App Settings Schemas ===

export const settingKeyParamSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .max(100, 'Key must be 100 characters or less')
    .regex(/^[a-z0-9_]+$/, 'Key must contain only lowercase letters, numbers, and underscores'),
});

export const updateSettingSchema = z.object({
  value: z.string().max(10000, 'Value must be 10000 characters or less'),
});

export const updateBulkSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z
          .string()
          .min(1, 'Key is required')
          .max(100, 'Key must be 100 characters or less')
          .regex(/^[a-z0-9_]+$/, 'Key must contain only lowercase letters, numbers, and underscores'),
        value: z.string().max(10000),
      })
    )
    .min(1, 'At least one setting is required')
    .max(50, 'Maximum 50 settings can be updated at once'),
});

export type SettingKeyParam = z.infer<typeof settingKeyParamSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type UpdateBulkSettingsInput = z.infer<typeof updateBulkSettingsSchema>;
