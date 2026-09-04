import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { db } from '../db';
import { webhookEvents, orders, recoveryCases } from '../db/schema';
import { diagnosisQueue } from '../config/queues';
import { sseEmitter } from '../services/sse';
import { env } from '../env';
import { eq } from 'drizzle-orm';

export const webhookIngestionWorker = new Worker(
  'webhook-ingestion',
  async (job: Job) => {
    const { webhookEventId } = job.data;

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, webhookEventId));
    if (!event) throw new Error(`Webhook event ${webhookEventId} not found`);

    const payload = event.rawPayload as any;
    const isSuccess = payload.event === 'payment.captured' || payload.event === 'order.paid';
    const isAbandonment = payload.event === 'cart.abandoned';

    if (isSuccess) {
      const razorpayOrderId =
        payload.payload?.payment?.entity?.order_id ?? payload.payload?.order?.entity?.id;
      if (razorpayOrderId) {
        await db
          .update(orders)
          .set({ status: 'paid' })
          .where(eq(orders.razorpayOrderId, razorpayOrderId));
      }
      sseEmitter.emit('event', { type: 'order_paid', razorpayOrderId });
      return;
    }

    let order = null;
    const razorpayOrderId = payload.payload?.payment?.entity?.order_id;
    if (razorpayOrderId) {
      const [foundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.razorpayOrderId, razorpayOrderId));
      order = foundOrder ?? null;
    }

    const [recoveryCase] = await db
      .insert(recoveryCases)
      .values({
        merchantId: env.MERCHANT_ID,
        orderId: order?.id ?? null,
        webhookEventId: event.id,
        failureMode: isAbandonment ? 'CHECKOUT_ABANDONED' : 'INSUFFICIENT_FUNDS',
        status: 'DETECTED',
        atRiskAmountInPaise: order?.amountInPaise ?? payload.amount ?? 0,
      })
      .returning();

    sseEmitter.emit('event', { type: 'case_detected', caseId: recoveryCase.id });

    try {
      await diagnosisQueue.add('diagnose', {
        caseId: recoveryCase.id,
        webhookPayload: payload,
      });
    } catch (qErr) {
      console.error('Diagnosis queue add failed:', qErr);
    }
  },
  { connection: redis, concurrency: 10 }
);

webhookIngestionWorker.on('error', () => {});

