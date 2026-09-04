import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import { recoveryCases, orders } from '../db/schema';
import { sseEmitter } from '../services/sse';
import { eq } from 'drizzle-orm';

export async function processRetrySchedule(data: {
  caseId: string;
  orderId: string;
}): Promise<void> {
  const { caseId, orderId } = data;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (order?.status === 'paid') return;

  await db
    .update(recoveryCases)
    .set({ status: 'INTERVENTION_EXECUTING', updatedAt: new Date() })
    .where(eq(recoveryCases.id, caseId));

  sseEmitter.emit('event', {
    type: 'retry_attempted',
    caseId,
    orderId,
  });
}

export const retrySchedulerWorker = !isRedisPlaceholder
  ? new Worker(
      'retry-scheduler',
      async (job: Job) => {
        await processRetrySchedule(job.data);
      },
      { connection: redis, concurrency: 5 }
    )
  : null;

if (retrySchedulerWorker) {
  retrySchedulerWorker.on('error', () => {});
}
