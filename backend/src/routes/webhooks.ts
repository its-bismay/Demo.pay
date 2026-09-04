import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { webhookEvents } from '../db/schema';
import { eq } from 'drizzle-orm';
import { rawBodyMiddleware, verifyRazorpayHmac } from '../middleware/hmac';
import { webhookIngestionQueue } from '../config/queues';

const router = Router();

router.post(
  '/webhooks/razorpay',
  rawBodyMiddleware,
  verifyRazorpayHmac,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body;
      const eventId = payload.payload?.payment?.entity?.id ?? `evt_${Date.now()}`;

      const existing = await db.select().from(webhookEvents)
        .where(eq(webhookEvents.razorpayEventId, eventId));
      if (existing.length > 0) {
        res.json({ status: 'duplicate_ignored' });
        return;
      }

      const [event] = await db.insert(webhookEvents).values({
        razorpayEventId: eventId,
        eventType: payload.event,
        rawPayload: payload,
      }).returning();

      res.json({ status: 'ok' });

      try {
        await webhookIngestionQueue.add('process', { webhookEventId: event.id });
      } catch (queueErr) {
        console.error('Queue add failed:', queueErr);
      }
    } catch (err) {
      next(err);
    }
  }
);

export default router;
