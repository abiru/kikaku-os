import { z } from 'zod';

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

// Type exports
export type CouponIdParam = z.infer<typeof couponIdParamSchema>;
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
