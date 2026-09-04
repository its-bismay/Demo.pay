import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import { webhookEvents, orders, recoveryCases } from '../db/schema';
import { diagnosisQueue } from '../config/queues';
import { sseEmitter } from '../services/sse';
import { processDiagnosis } from './diagnosis.worker';
import { env } from '../env';
import { eq } from 'drizzle-orm';

export async function processWebhookIngestion(webhookEventId: string): Promise<void> {
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

  if (isRedisPlaceholder) {
    await processDiagnosis({
      caseId: recoveryCase.id,
      webhookPayload: payload,
    });
    return;
  }

  try {
    await diagnosisQueue.add('diagnose', {
      caseId: recoveryCase.id,
      webhookPayload: payload,
    });
  } catch (qErr) {
    console.warn('Diagnosis queue add failed, executing diagnosis directly:', qErr);
    await processDiagnosis({
      caseId: recoveryCase.id,
      webhookPayload: payload,
    });
  }
}

export const webhookIngestionWorker = !isRedisPlaceholder
  ? new Worker(
      'webhook-ingestion',
      async (job: Job) => {
        await processWebhookIngestion(job.data.webhookEventId);
      },
      { connection: redis, concurrency: 10 }
    )
  : null;

if (webhookIngestionWorker) {
  webhookIngestionWorker.on('error', () => {});
}
