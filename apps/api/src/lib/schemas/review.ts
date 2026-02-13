import { z } from 'zod';

export const reviewSubmitSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address').max(255),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1, 'Title is required').max(200),
  body: z.string().min(1, 'Review body is required').max(5000),
});

export const reviewProductIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const reviewListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const reviewIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
