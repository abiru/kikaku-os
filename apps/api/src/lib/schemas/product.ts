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

// Type exports
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductIdParam = z.infer<typeof productIdParamSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StorefrontProductsQuery = z.infer<typeof storefrontProductsQuerySchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type VariantIdParam = z.infer<typeof variantIdParamSchema>;
export type ProductVariantParam = z.infer<typeof productVariantParamSchema>;
export type UpdatePricesInput = z.infer<typeof updatePricesSchema>;
export type ProductImageParam = z.infer<typeof productImageParamSchema>;
export type UpdateImageOrderInput = z.infer<typeof updateImageOrderSchema>;
export type CategoryNameParam = z.infer<typeof categoryNameParamSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;
