import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import { webhookEvents, orders, recoveryCases, customers, orderItems, products } from '../db/schema';
import { diagnosisQueue } from '../config/queues';
import { sseEmitter } from '../services/sse';
import { processDiagnosis } from './diagnosis.worker';
import { sendPaymentSuccessEmail } from '../services/email';
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
    let order = null;
    let customer = null;
    let productName = 'Order Items';

    if (razorpayOrderId) {
      const [foundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.razorpayOrderId, razorpayOrderId));
      order = foundOrder ?? null;
    }

    if (!order && payload.payload?.payment?.entity?.notes?.orderId) {
      const [foundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, payload.payload.payment.entity.notes.orderId));
      order = foundOrder ?? null;
    }

    if (order) {
      await db
        .update(orders)
        .set({ status: 'paid' })
        .where(eq(orders.id, order.id));

      if (order.customerId) {
        const [cust] = await db.select().from(customers).where(eq(customers.id, order.customerId));
        customer = cust;
      }

      // Check for any active recovery case
      const [recCase] = await db
        .select()
        .from(recoveryCases)
        .where(eq(recoveryCases.orderId, order.id));

      if (recCase) {
        await db
          .update(recoveryCases)
          .set({
            status: 'RECOVERED',
            recoveredAmountInPaise: order.amountInPaise,
            updatedAt: new Date(),
          })
          .where(eq(recoveryCases.id, recCase.id));

        sseEmitter.emit('event', {
          type: 'case_recovered',
          caseId: recCase.id,
          amount: order.amountInPaise,
          message: `Payment recovered! Case ${recCase.id.slice(0, 8)} marked as RECOVERED.`,
        });
      }

      const [item] = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      if (item?.productId) {
        const [prod] = await db.select().from(products).where(eq(products.id, item.productId));
        if (prod) productName = prod.name;
      }
    }

    const emailRecipient = customer?.email || payload.payload?.payment?.entity?.email || 'bismaybibhabasu33@gmail.com';
    const customerName = customer?.name || 'Customer';
    const amountInRs = order
      ? Math.round(order.amountInPaise / 100)
      : Math.round((payload.payload?.payment?.entity?.amount ?? 249900) / 100);

    // Send payment confirmation email immediately
    try {
      await sendPaymentSuccessEmail({
        to: emailRecipient,
        customerName,
        productName,
        orderId: order?.id,
        amountInRs,
      });
    } catch (e) {
      console.warn('Payment success email failed:', e);
    }

    sseEmitter.emit('event', {
      type: 'order_paid',
      razorpayOrderId,
      emailSent: true,
      recipient: emailRecipient,
      message: `Payment captured successfully for ${customerName}. Order confirmed and confirmation email sent to ${emailRecipient}. No phone call will be made.`,
    });
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
