import { z } from 'zod';

// === Daily Close Schemas ===

export const backfillSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD format'),
  force: z.boolean().optional().default(false),
  skipExisting: z.boolean().optional().default(true),
});

// Type exports
export type BackfillInput = z.infer<typeof backfillSchema>;
