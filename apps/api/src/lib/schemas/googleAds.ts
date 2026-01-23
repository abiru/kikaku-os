import { z } from 'zod';

// === Google Ads Schemas ===

export const adTypeSchema = z.enum(['search', 'display', 'performance_max']);
export const adStatusSchema = z.enum(['draft', 'ready']);
export const adLanguageSchema = z.enum(['ja', 'en']);
export const adToneSchema = z.enum(['professional', 'casual', 'urgent', 'informative']);

// AI Generation Request Schema
export const adGenerateRequestSchema = z.object({
  productName: z.string().min(1, 'Product name is required').max(255).transform((v) => v.trim()),
  productDescription: z.string().min(1, 'Product description is required').max(5000).transform((v) => v.trim()),
  targetAudience: z.string().min(1, 'Target audience is required').max(500).transform((v) => v.trim()),
  keywords: z.array(z.string().max(100)).min(1, 'At least one keyword required').max(20, 'Maximum 20 keywords'),
  tone: adToneSchema,
  language: adLanguageSchema,
  adType: adTypeSchema,
  finalUrl: z.string().url('Invalid URL format'),
  draftId: z.number().int().positive().optional(),
});

// Ad Draft Create Schema
export const createAdDraftSchema = z.object({
  campaign_name: z.string().min(1, 'Campaign name is required').max(255).transform((v) => v.trim()),
  ad_type: adTypeSchema.optional().default('search'),
  status: adStatusSchema.optional().default('draft'),
  language: adLanguageSchema.optional().default('ja'),

  product_id: z.number().int().positive().optional().nullable(),
  product_name: z.string().max(255).optional().nullable().transform((v) => v?.trim() || null),
  product_description: z.string().max(5000).optional().nullable().transform((v) => v?.trim() || null),
  target_audience: z.string().max(500).optional().nullable().transform((v) => v?.trim() || null),

  headlines: z.array(z.string().max(30)).min(1, 'At least 1 headline required').max(15, 'Maximum 15 headlines'),
  descriptions: z.array(z.string().max(90)).min(1, 'At least 1 description required').max(4, 'Maximum 4 descriptions'),
  keywords: z.array(z.string().max(100)).optional().nullable(),

  final_url: z.string().url('Invalid URL format'),
  daily_budget: z.number().int().nonnegative().optional().nullable(),
  tone: adToneSchema.optional().nullable(),

  last_prompt: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Ad Draft Update Schema (all fields optional)
export const updateAdDraftSchema = z.object({
  campaign_name: z.string().min(1).max(255).optional(),
  ad_type: adTypeSchema.optional(),
  status: adStatusSchema.optional(),
  language: adLanguageSchema.optional(),

  product_id: z.number().int().positive().optional().nullable(),
  product_name: z.string().max(255).optional().nullable(),
  product_description: z.string().max(5000).optional().nullable(),
  target_audience: z.string().max(500).optional().nullable(),

  headlines: z.array(z.string().max(30)).min(1).max(15).optional(),
  descriptions: z.array(z.string().max(90)).min(1).max(4).optional(),
  keywords: z.array(z.string().max(100)).optional().nullable(),

  final_url: z.string().url().optional(),
  daily_budget: z.number().int().nonnegative().optional().nullable(),
  tone: adToneSchema.optional().nullable(),

  last_prompt: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Ad Draft ID Param Schema
export const adDraftIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

// Ad Draft List Query Schema
export const adDraftListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'draft', 'ready']).optional().default('all'),
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

// Select History Schema
export const selectHistorySchema = z.object({
  historyId: z.number().int().positive('History ID must be a positive integer'),
});

// Type exports
export type AdGenerateRequest = z.infer<typeof adGenerateRequestSchema>;
export type CreateAdDraftInput = z.infer<typeof createAdDraftSchema>;
export type UpdateAdDraftInput = z.infer<typeof updateAdDraftSchema>;
export type AdDraftIdParam = z.infer<typeof adDraftIdParamSchema>;
export type AdDraftListQuery = z.infer<typeof adDraftListQuerySchema>;
export type SelectHistoryInput = z.infer<typeof selectHistorySchema>;
