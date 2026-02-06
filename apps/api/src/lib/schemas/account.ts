import { z } from 'zod';

// === Customer Account Schemas ===

export const accountOrdersQuerySchema = z.object({
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
    .default('10')
    .transform((v) => Math.min(50, Math.max(1, parseInt(v, 10)))),
});

export const accountOrderIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const updateAccountProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be 255 characters or less')
    .transform((v) => v.trim()),
  shipping_address: z
    .object({
      postal_code: z.string().max(20).optional(),
      prefecture: z.string().max(50).optional(),
      city: z.string().max(100).optional(),
      address1: z.string().max(255).optional(),
      address2: z.string().max(255).optional(),
      phone: z.string().max(20).optional(),
    })
    .optional()
    .nullable(),
});

// Type exports
export type AccountOrdersQuery = z.infer<typeof accountOrdersQuerySchema>;
export type AccountOrderIdParam = z.infer<typeof accountOrderIdParamSchema>;
export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileSchema>;
