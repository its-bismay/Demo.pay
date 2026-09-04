import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { webhookEvents, customers, recoveryCases, orders } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { rawBodyMiddleware, verifyRazorpayHmac } from '../middleware/hmac';
import { webhookIngestionQueue } from '../config/queues';
import { processWebhookIngestion } from '../workers/webhookIngestion.worker';
import { parsePromiseIntent, recordPromiseToPay } from '../services/promiseService';
import { env } from '../env';

const router = Router();

router.post(
  '/webhooks/razorpay',
  rawBodyMiddleware,
  verifyRazorpayHmac,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = req.body;
      const eventId = payload.payload?.payment?.entity?.id ?? `evt_${Date.now()}`;

      const existing = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.razorpayEventId, eventId));
      if (existing.length > 0) {
        res.json({ status: 'duplicate_ignored' });
        return;
      }

      const [event] = await db
        .insert(webhookEvents)
        .values({
          razorpayEventId: eventId,
          eventType: payload.event,
          rawPayload: payload,
        })
        .returning();

      res.json({ status: 'ok' });

      try {
        await webhookIngestionQueue.add('process', { webhookEventId: event.id });
      } catch (queueErr) {
        console.warn('Razorpay webhook queue dispatch fallback to direct processing:', queueErr);
        await processWebhookIngestion(event.id);
      }
    } catch (err) {
      next(err);
    }
  }
);

router.get('/webhooks/whatsapp', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = env.META_WHATSAPP_VERIFY_TOKEN || 'dev_meta_verify_token';

  if (mode === 'subscribe' && token === expectedToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/webhooks/whatsapp', async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (!message) {
      res.sendStatus(200);
      return;
    }

    const fromPhone = message.from || '';
    const body = message.text?.body || '';

    const cleanPhone = fromPhone.replace(/[^\d]/g, '');
    const searchPhones = [
      cleanPhone,
      `+${cleanPhone}`,
      cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone,
      cleanPhone.startsWith('91') ? `+91${cleanPhone.slice(2)}` : `+91${cleanPhone}`,
    ];

    let matchedCustomer = null;
    for (const p of searchPhones) {
      const [found] = await db
        .select()
        .from(customers)
        .where(eq(customers.phone, p))
        .limit(1);
      if (found) {
        matchedCustomer = found;
        break;
      }
    }

    const { isPromise, hoursAhead } = parsePromiseIntent(body);

    if (isPromise && matchedCustomer) {
      const [activeCase] = await db
        .select()
        .from(recoveryCases)
        .innerJoin(orders, eq(recoveryCases.orderId, orders.id))
        .where(eq(orders.customerId, matchedCustomer.id))
        .orderBy(desc(recoveryCases.createdAt))
        .limit(1);

      if (activeCase?.recovery_cases) {
        await recordPromiseToPay({
          caseId: activeCase.recovery_cases.id,
          customerId: matchedCustomer.id,
          source: 'whatsapp_reply',
          hoursAhead,
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.warn('Meta WhatsApp webhook processing error:', err);
    res.sendStatus(200);
  }
});

export default router;
