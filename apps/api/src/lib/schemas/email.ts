import { z } from 'zod';

// === Email Template Schemas ===

export const emailTemplateSlugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be 100 characters or less')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

export const updateEmailTemplateSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(255, 'Subject must be 255 characters or less')
    .transform((v) => v.trim()),
  body_html: z
    .string()
    .max(100000, 'HTML body must be 100000 characters or less'),
  body_text: z
    .string()
    .max(50000, 'Text body must be 50000 characters or less'),
});

export const previewEmailTemplateSchema = z.object({
  to: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be 255 characters or less'),
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
});

// Type exports
export type EmailTemplateSlugParam = z.infer<typeof emailTemplateSlugParamSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type PreviewEmailTemplateInput = z.infer<typeof previewEmailTemplateSchema>;
