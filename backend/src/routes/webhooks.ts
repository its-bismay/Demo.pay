import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { webhookEvents, customers, recoveryCases, orders } from '../db/schema';
import { eq, desc, and, or } from 'drizzle-orm';
import { rawBodyMiddleware, verifyRazorpayHmac } from '../middleware/hmac';
import { webhookIngestionQueue } from '../config/queues';
import { processWebhookIngestion } from '../workers/webhookIngestion.worker';
import { parsePromiseIntent, recordPromiseToPay } from '../services/promiseService';

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

router.post('/webhooks/twilio/whatsapp', async (req: Request, res: Response): Promise<void> => {
  const body = req.body?.Body ?? '';
  const fromRaw = req.body?.From ?? '';
  const phone = fromRaw.replace('whatsapp:', '').trim();

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  const { isPromise, hoursAhead } = parsePromiseIntent(body);

  if (isPromise && customer) {
    const [activeCase] = await db
      .select()
      .from(recoveryCases)
      .innerJoin(orders, eq(recoveryCases.orderId, orders.id))
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(recoveryCases.createdAt))
      .limit(1);

    if (activeCase?.recovery_cases) {
      await recordPromiseToPay({
        caseId: activeCase.recovery_cases.id,
        customerId: customer.id,
        source: 'whatsapp_reply',
        hoursAhead,
      });
    }
  }

  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Message>${
        isPromise
          ? "Thank you! We've noted your promise to pay. We'll remind you then."
          : 'Thank you for reaching out to Demo.pay support. Let us know if you need assistance completing your order.'
      }</Message>
    </Response>
  `);
});

router.post('/twilio/voice/response', async (req: Request, res: Response): Promise<void> => {
  const speech = req.body?.SpeechResult ?? '';
  const fromPhone = req.body?.From ?? '';

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, fromPhone))
    .limit(1);

  const { isPromise, hoursAhead } = parsePromiseIntent(speech);

  if (isPromise && customer) {
    const [activeCase] = await db
      .select()
      .from(recoveryCases)
      .innerJoin(orders, eq(recoveryCases.orderId, orders.id))
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(recoveryCases.createdAt))
      .limit(1);

    if (activeCase?.recovery_cases) {
      await recordPromiseToPay({
        caseId: activeCase.recovery_cases.id,
        customerId: customer.id,
        source: 'voice',
        hoursAhead,
      });
    }
  }

  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Say voice="Polly.Aditi" language="en-IN">
        ${
          isPromise
            ? 'Thank you! We have noted your request to pay later. Have a wonderful day!'
            : 'Thank you for your response. We have sent the recovery link to your phone. Have a wonderful day!'
        }
      </Say>
    </Response>
  `);
});

export default router;
