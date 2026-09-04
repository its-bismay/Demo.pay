import { db } from './index';
import { merchants, policies, systemFlags, products } from './schema';
import { env } from '../env';

async function seed() {
  console.log('Seeding...');

  await db.insert(merchants).values({
    id: env.MERCHANT_ID,
    name: 'Acme Gear',
    razorpayKeyId: env.RAZORPAY_KEY_ID,
    razorpayKeySecretEnc: env.RAZORPAY_KEY_SECRET, // encrypt in production
  }).onConflictDoNothing();

  await db.insert(policies).values({
    merchantId: env.MERCHANT_ID,
  }).onConflictDoNothing();

  await db.insert(systemFlags).values({
    key: 'global_kill_switch',
    value: false,
  }).onConflictDoNothing();

  // Seed the 4 mock products from the frontend
  await db.insert(products).values([
    { merchantId: env.MERCHANT_ID, name: 'Pro Wireless Headphones', category: 'Electronics', priceInPaise: 1499900, description: 'High quality noise cancelling headphones.', ratingValue: '4.8', ratingCount: 1204, imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80', discountEligible: true, maxDiscountOverridePct: 10 },
    { merchantId: env.MERCHANT_ID, name: 'Ergonomic Office Chair', category: 'Furniture', priceInPaise: 1250000, description: 'Comfortable chair for long working hours.', ratingValue: '4.5', ratingCount: 840, imageUrl: 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=500&q=80', discountEligible: false },
    { merchantId: env.MERCHANT_ID, name: 'Mechanical Keyboard v2', category: 'Electronics', priceInPaise: 899900, description: 'Tactile mechanical switches, RGB.', ratingValue: '4.9', ratingCount: 2150, imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&q=80', discountEligible: true },
    { merchantId: env.MERCHANT_ID, name: 'Minimalist Desk Lamp', category: 'Home & Household', priceInPaise: 349900, description: 'Adjustable LED desk lamp.', ratingValue: '4.2', ratingCount: 310, imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500&q=80', discountEligible: true },
  ]).onConflictDoNothing();

  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch(console.error);
