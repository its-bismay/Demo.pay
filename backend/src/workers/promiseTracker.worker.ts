import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import { recoveryCases, orders, paymentPromises } from '../db/schema';
import { runGuardrailChecks } from '../services/guardrail';
import { whatsappQueue } from '../config/queues';
import { sseEmitter } from '../services/sse';
import { processInterventionWhatsapp } from './interventionWhatsapp.worker';
import { eq } from 'drizzle-orm';
import { env } from '../env';

export async function processPromiseCheck(data: {
  promiseId: string;
  caseId: string;
  orderId?: string | null;
  customerId: string;
}): Promise<void> {
  const { promiseId, caseId, orderId, customerId } = data;

  const [promise] = await db
    .select()
    .from(paymentPromises)
    .where(eq(paymentPromises.id, promiseId));

  if (!promise || promise.status !== 'pending') return;

  let isPaid = false;
  if (orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    isPaid = order?.status === 'paid';
  }

  if (isPaid) {
    await db
      .update(paymentPromises)
      .set({ status: 'kept' })
      .where(eq(paymentPromises.id, promiseId));

    await db
      .update(recoveryCases)
      .set({ status: 'RECOVERED', updatedAt: new Date() })
      .where(eq(recoveryCases.id, caseId));

    sseEmitter.emit('event', {
      type: 'promise_kept',
      promiseId,
      caseId,
    });
    return;
  }

  await db
    .update(paymentPromises)
    .set({ status: 'broken' })
    .where(eq(paymentPromises.id, promiseId));

  const guardrail = await runGuardrailChecks(customerId, env.MERCHANT_ID);
  if (guardrail.passed) {
    if (isRedisPlaceholder) {
      await processInterventionWhatsapp({ caseId, discountPct: 15 });
    } else {
      try {
        await whatsappQueue.add('send', { caseId, discountPct: 15 });
      } catch (err) {
        console.warn('Promise reminder enqueue fallback directly:', err);
        await processInterventionWhatsapp({ caseId, discountPct: 15 });
      }
    }
  }

  sseEmitter.emit('event', {
    type: 'promise_broken',
    promiseId,
    caseId,
  });
}

export const promiseTrackerWorker = !isRedisPlaceholder
  ? new Worker(
      'promise-tracker',
      async (job: Job) => {
        await processPromiseCheck(job.data);
      },
      { connection: redis, concurrency: 5 }
    )
  : null;

if (promiseTrackerWorker) {
  promiseTrackerWorker.on('error', () => {});
}
