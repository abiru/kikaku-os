import { z } from 'zod';

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

// Type exports
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
export type TaxRateIdParam = z.infer<typeof taxRateIdParamSchema>;
