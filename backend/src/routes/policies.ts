import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { policies } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../env';

const router = Router();

router.get('/policies', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [policy] = await db
      .select()
      .from(policies)
      .where(eq(policies.merchantId, env.MERCHANT_ID));

    if (!policy) {
      const [seeded] = await db
        .insert(policies)
        .values({
          merchantId: env.MERCHANT_ID,
          maxContactsPer24h: 2,
          maxDiscountPct: 15,
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          minOrderValuePaise: 200000,
          voiceType: 'Female (Professional / Empathetic)',
          languageMode: 'Hinglish (Hindi + English blend)',
          personaPrompt:
            'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.',
        })
        .returning();

      res.json({ policy: seeded });
      return;
    }

    res.json({ policy });
  } catch (err) {
    next(err);
  }
});

router.put('/policies', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [existing] = await db
      .select()
      .from(policies)
      .where(eq(policies.merchantId, env.MERCHANT_ID));

    const body = req.body;

    const maxContactsPer24h =
      body.maxContactsPer24h !== undefined
        ? Number(body.maxContactsPer24h)
        : body.maxContactsPerDay !== undefined
        ? Number(body.maxContactsPerDay)
        : existing?.maxContactsPer24h ?? 2;

    const maxDiscountPct =
      body.maxDiscountPct !== undefined
        ? Number(body.maxDiscountPct)
        : existing?.maxDiscountPct ?? 15;

    const quietHoursStart = body.quietHoursStart ?? existing?.quietHoursStart ?? '22:00';
    const quietHoursEnd = body.quietHoursEnd ?? existing?.quietHoursEnd ?? '08:00';

    const minOrderValuePaise =
      body.minOrderValuePaise !== undefined
        ? Number(body.minOrderValuePaise)
        : body.minOrderValue !== undefined
        ? Number(body.minOrderValue) * 100
        : existing?.minOrderValuePaise ?? 200000;

    const voiceType = body.voiceType ?? existing?.voiceType ?? 'Female (Professional / Empathetic)';
    const languageMode = body.languageMode ?? existing?.languageMode ?? 'Hinglish (Hindi + English blend)';
    const personaPrompt =
      body.personaPrompt ??
      existing?.personaPrompt ??
      'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.';

    let updated;
    if (existing) {
      [updated] = await db
        .update(policies)
        .set({
          maxContactsPer24h,
          maxDiscountPct,
          quietHoursStart,
          quietHoursEnd,
          minOrderValuePaise,
          voiceType,
          languageMode,
          personaPrompt,
          updatedAt: new Date(),
        })
        .where(eq(policies.merchantId, env.MERCHANT_ID))
        .returning();
    } else {
      [updated] = await db
        .insert(policies)
        .values({
          merchantId: env.MERCHANT_ID,
          maxContactsPer24h,
          maxDiscountPct,
          quietHoursStart,
          quietHoursEnd,
          minOrderValuePaise,
          voiceType,
          languageMode,
          personaPrompt,
        })
        .returning();
    }

    res.json({ success: true, policy: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
