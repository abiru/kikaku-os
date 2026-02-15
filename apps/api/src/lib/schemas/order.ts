import { z } from 'zod';

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
  carrier: z
    .string()
    .max(50, 'Carrier must be 50 characters or less')
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
  carrier: z
    .string()
    .max(50, 'Carrier must be 50 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

// === Cancel Order Schemas ===

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be 500 characters or less'),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// Statuses that can be cancelled
export const CANCELLABLE_STATUSES = ['pending', 'paid'] as const;

// === Refund Schemas ===

export const createRefundSchema = z.object({
  amount: z
    .number()
    .int('Amount must be an integer')
    .min(1, 'Amount must be at least 1')
    .optional(),
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be 500 characters or less'),
});

// Type exports
export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type FulfillmentIdParam = z.infer<typeof fulfillmentIdParamSchema>;
export type OrderFulfillmentParam = z.infer<typeof orderFulfillmentParamSchema>;
export type CreateFulfillmentInput = z.infer<typeof createFulfillmentSchema>;
export type UpdateFulfillmentInput = z.infer<typeof updateFulfillmentSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
