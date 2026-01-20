import { z } from 'zod';

// === Product Schemas ===

export const productStatusSchema = z.enum(['active', 'draft']);

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
