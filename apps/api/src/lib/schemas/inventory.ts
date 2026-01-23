import { z } from 'zod';

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

// Type exports
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
export type ThresholdParam = z.infer<typeof thresholdParamSchema>;
