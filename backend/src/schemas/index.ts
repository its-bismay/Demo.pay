import { z } from 'zod';

export const customerSessionSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
});

export const productCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  category: z.string().min(2),
  priceInPaise: z.number().int().positive(),
  imageUrl: z.string().url().optional(),
  ratingValue: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  discountEligible: z.boolean().default(true),
  maxDiscountOverridePct: z.number().int().min(0).max(100).nullable().optional(),
});
