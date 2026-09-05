import { db } from '../db';
import { sql } from 'drizzle-orm';
import { merchants, policies, systemFlags, products } from '../db/schema';
import { env } from '../env';

async function migrateAndSeed() {
  console.log('Running database schema updates...');

  await db.execute(sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash text;`);

  console.log('Purging previous test records...');
  await db.execute(sql`DELETE FROM agent_logs;`);
  await db.execute(sql`DELETE FROM recovery_actions;`);
  await db.execute(sql`DELETE FROM agent_instances;`);
  await db.execute(sql`DELETE FROM payment_promises;`);
  await db.execute(sql`DELETE FROM recovery_cases;`);
  await db.execute(sql`DELETE FROM order_items;`);
  await db.execute(sql`DELETE FROM orders;`);
  await db.execute(sql`DELETE FROM cart_sessions;`);
  await db.execute(sql`DELETE FROM contact_log;`);
  await db.execute(sql`DELETE FROM customers;`);
  await db.execute(sql`DELETE FROM products;`);

  await db.execute(sql`ALTER TABLE customers ALTER COLUMN phone SET NOT NULL;`);

  console.log('Seeding merchant and configuration...');
  await db.insert(merchants).values({
    id: env.MERCHANT_ID,
    name: 'Acme Gear',
    razorpayKeyId: env.RAZORPAY_KEY_ID,
    razorpayKeySecretEnc: env.RAZORPAY_KEY_SECRET,
  }).onConflictDoNothing();

  await db.insert(policies).values({
    merchantId: env.MERCHANT_ID,
  }).onConflictDoNothing();

  await db.insert(systemFlags).values({
    key: 'global_kill_switch',
    value: false,
  }).onConflictDoNothing();

  console.log('Seeding updated product catalog...');
  const newProducts = [
    {
      merchantId: env.MERCHANT_ID,
      name: 'Chef Artisanal Kitchen Accessories Set',
      category: 'Household',
      priceInPaise: 349900,
      description: 'Handcrafted premium kitchen utensil set made from sustainable organic teak and matte stainless steel. Heat-resistant and durable.',
      ratingValue: '4.9',
      ratingCount: 540,
      imageUrl: 'https://res.cloudinary.com/ddqr4cxgl/image/upload/v1788602050/pexels-drakenicolls-9098766_i12jnz.jpg',
      discountEligible: true,
      maxDiscountOverridePct: 15,
    },
    {
      merchantId: env.MERCHANT_ID,
      name: 'Ergonomic Executive Office Chair',
      category: 'Furniture',
      priceInPaise: 1299900,
      description: 'Dynamic 3D lumbar support with breathable mesh backrest, 4D adjustable armrests, and synchro-tilt mechanism for posture support.',
      ratingValue: '4.8',
      ratingCount: 1120,
      imageUrl: 'https://res.cloudinary.com/ddqr4cxgl/image/upload/v1788602131/pexels-esteban-santiago-gonzalez-239179106-12269763_pciicn.jpg',
      discountEligible: true,
      maxDiscountOverridePct: 15,
    },
    {
      merchantId: env.MERCHANT_ID,
      name: 'Apex Precision Smart Watch Pro',
      category: 'Electronics',
      priceInPaise: 599900,
      description: 'Ultra-bright AMOLED display with continuous heart rate monitoring, SpO2 sensor, 100+ sports modes, and 12-day battery life.',
      ratingValue: '4.7',
      ratingCount: 890,
      imageUrl: 'https://res.cloudinary.com/ddqr4cxgl/image/upload/v1788602222/pexels-deise-elen-2149983761-31406903_t9rayx.jpg',
      discountEligible: true,
      maxDiscountOverridePct: 20,
    },
    {
      merchantId: env.MERCHANT_ID,
      name: 'Studio Wireless Over-Ear Headphones',
      category: 'Electronics',
      priceInPaise: 1499900,
      description: 'Active Noise Cancellation with 40mm titanium drivers, spatial audio immersion, memory foam cushions, and 45-hour playback.',
      ratingValue: '4.9',
      ratingCount: 2450,
      imageUrl: 'https://res.cloudinary.com/ddqr4cxgl/image/upload/v1788602289/pexels-danielbalarezo-11199906_detgfg.jpg',
      discountEligible: true,
      maxDiscountOverridePct: 15,
    },
    {
      merchantId: env.MERCHANT_ID,
      name: 'Barista Ceramic Pour-Over Coffee Set',
      category: 'Household',
      priceInPaise: 249900,
      description: 'Double-walled ceramic pour-over cone with borosilicate glass decanter and precision flow control for artisanal brews.',
      ratingValue: '4.8',
      ratingCount: 380,
      imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80',
      discountEligible: true,
      maxDiscountOverridePct: 10,
    },
    {
      merchantId: env.MERCHANT_ID,
      name: 'Tactile Mechanical Keyboard v2',
      category: 'Electronics',
      priceInPaise: 799900,
      description: 'Hot-swappable linear mechanical switches, sound-dampening acoustic foams, anodized aluminum frame, and customizable per-key RGB.',
      ratingValue: '4.9',
      ratingCount: 1670,
      imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&q=80',
      discountEligible: true,
      maxDiscountOverridePct: 15,
    },
  ];

  await db.insert(products).values(newProducts);

  console.log('✅ Database migration and catalog re-seed completed successfully!');
  process.exit(0);
}

migrateAndSeed().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
