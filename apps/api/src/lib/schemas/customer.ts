import { z } from 'zod';

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

// Type exports
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerIdParam = z.infer<typeof customerIdParamSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
