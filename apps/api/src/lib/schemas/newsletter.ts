import { z } from 'zod';

export const newsletterSubscribeSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
});

export const newsletterListQuerySchema = z.object({
  status: z.enum(['active', 'unsubscribed', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const newsletterUnsubscribeQuerySchema = z.object({
  token: z.string().min(1, 'Token is required'),
});
