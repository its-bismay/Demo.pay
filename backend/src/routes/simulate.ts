import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { customers, orders, orderItems, products, webhookEvents } from '../db/schema';
import { processWebhookIngestion } from '../workers/webhookIngestion.worker';
import { getKpiSummary } from './analytics';
import { sseEmitter } from '../services/sse';
import { env } from '../env';
import { eq } from 'drizzle-orm';

const router = Router();

const scenarios = [
  { scenario: 'insufficient_funds', errorCode: 'INSUFFICIENT_FUNDS', errorDesc: 'Payment failed due to insufficient balance' },
  { scenario: 'gateway_timeout', errorCode: 'GATEWAY_TIMEOUT', errorDesc: 'Gateway Timeout' },
  { scenario: 'upi_unreachable', errorCode: 'UPI_UNREACHABLE', errorDesc: 'UPI collect request expired' },
  { scenario: 'auth_failed', errorCode: 'BAD_REQUEST_ERROR', errorDesc: 'authentication_failed' },
  { scenario: 'checkout_abandoned', errorCode: null, errorDesc: null },
];

router.post('/simulate/batch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = Math.min(Math.max(Number(req.body.count) || 10, 1), 100);

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.merchantId, env.MERCHANT_ID))
      .limit(1);

    const [prod] = await db
      .select()
      .from(products)
      .where(eq(products.active, true))
      .limit(1);

    const baseAmount = prod?.priceInPaise ?? 99900;
    const batchId = Date.now().toString().slice(-6);

    const createdEventIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const item = scenarios[i % scenarios.length];
      const isAbandon = item.scenario === 'checkout_abandoned';
      const eventType = isAbandon ? 'cart.abandoned' : 'payment.failed';
      const rzpOrderId = `order_sim_${batchId}_${i}`;

      const [order] = await db
        .insert(orders)
        .values({
          merchantId: env.MERCHANT_ID,
          customerId: customer?.id ?? '00000000-0000-0000-0000-000000000000',
          razorpayOrderId: rzpOrderId,
          amountInPaise: baseAmount + (i % 5) * 50000,
          status: 'attempted',
        })
        .returning();

      if (prod) {
        await db.insert(orderItems).values({
          orderId: order.id,
          productId: prod.id,
          quantity: 1,
          priceAtTimeInPaise: baseAmount,
        });
      }

      const syntheticPayload = isAbandon
        ? {
            event: 'cart.abandoned',
            customerId: customer?.id,
            amount: baseAmount,
          }
        : {
            entity: 'event',
            account_id: 'acc_batch',
            event: 'payment.failed',
            contains: ['payment'],
            payload: {
              payment: {
                entity: {
                  id: `pay_batch_${batchId}_${i}`,
                  entity: 'payment',
                  amount: order.amountInPaise,
                  currency: 'INR',
                  status: 'failed',
                  order_id: rzpOrderId,
                  method: 'upi',
                  email: customer?.email ?? 'customer@example.com',
                  contact: customer?.phone ?? '+919876543210',
                  error_code: item.errorCode,
                  error_description: item.errorDesc,
                },
              },
            },
            created_at: Math.floor(Date.now() / 1000),
          };

      const eventId = `batch_${batchId}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      const [storedEvent] = await db
        .insert(webhookEvents)
        .values({
          razorpayEventId: eventId,
          eventType,
          rawPayload: syntheticPayload,
        })
        .returning();

      createdEventIds.push(storedEvent.id);
    }

    // Process events in parallel batches of 5 for high throughput (<20s for 100)
    const BATCH_CHUNK = 5;
    for (let i = 0; i < createdEventIds.length; i += BATCH_CHUNK) {
      const chunk = createdEventIds.slice(i, i + BATCH_CHUNK);
      await Promise.all(chunk.map((evtId) => processWebhookIngestion(evtId)));
    }

    const metrics = await getKpiSummary();
    sseEmitter.emit('metrics_update', metrics);

    res.json({
      success: true,
      count,
      message: `${count} events simulated and processed`,
      metrics,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
