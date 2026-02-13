import { z } from 'zod';

export const contactInquirySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Message is required').max(5000),
});

export const inquiryReplySchema = z.object({
  reply: z.string().min(1, 'Reply is required').max(10000),
});

export const inquiryListQuerySchema = z.object({
  status: z.enum(['open', 'replied', 'closed']).optional().default('open'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const inquiryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
