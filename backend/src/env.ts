import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  GOOGLE_API_KEY: z.string().min(1),
  EMAIL_SERVICE_URL: z.string().url(),
  MERCHANT_ID: z.string().uuid(),
  FRONTEND_ORIGIN: z.string().url(),
  SARVAM_API_KEY: z.string().optional().default(''),
  META_WHATSAPP_TOKEN: z.string().optional().default(''),
  META_WHATSAPP_PHONE_ID: z.string().optional().default(''),
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
