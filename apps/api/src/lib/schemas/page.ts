import { z } from 'zod';

// === Static Page Schemas ===

export const pageStatusSchema = z.enum(['published', 'draft']);

export const pageIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, 'ID must be a positive integer')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0, 'ID must be greater than 0'),
});

export const pageSlugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

export const pageListQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  status: z.enum(['all', 'published', 'draft']).optional().default('all'),
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

export const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((v) => v.trim().toLowerCase()),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  meta_title: z
    .string()
    .max(255, 'Meta title must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  meta_description: z
    .string()
    .max(500, 'Meta description must be 500 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  body: z
    .string()
    .max(100000, 'Body must be 100000 characters or less')
    .optional()
    .default(''),
  status: pageStatusSchema.optional().default('draft'),
});

export const updatePageSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((v) => v.trim().toLowerCase()),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or less')
    .transform((v) => v.trim()),
  meta_title: z
    .string()
    .max(255, 'Meta title must be 255 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  meta_description: z
    .string()
    .max(500, 'Meta description must be 500 characters or less')
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
  body: z
    .string()
    .max(100000, 'Body must be 100000 characters or less')
    .optional()
    .default(''),
  status: pageStatusSchema.optional().default('draft'),
});

// Type exports
export type PageIdParam = z.infer<typeof pageIdParamSchema>;
export type PageSlugParam = z.infer<typeof pageSlugParamSchema>;
export type PageListQuery = z.infer<typeof pageListQuerySchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
