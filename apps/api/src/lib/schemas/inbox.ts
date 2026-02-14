import { z } from 'zod';

// === Inbox Schemas ===

export const createInboxSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  body: z.string().max(10000).optional(),
  kind: z.string().min(1).max(100).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional().default('info'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .optional(),
  metadata: z.string().max(10000).optional(),
});

// Type exports
export type CreateInboxInput = z.infer<typeof createInboxSchema>;
