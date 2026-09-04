import { db } from '../db';
import { paymentPromises, recoveryCases, orders } from '../db/schema';
import { promiseTrackerQueue } from '../config/queues';
import { sseEmitter } from '../services/sse';
import { eq } from 'drizzle-orm';

export function parsePromiseIntent(text: string): { isPromise: boolean; hoursAhead: number } {
  const lower = text.toLowerCase();
  if (
    lower.includes('kal') ||
    lower.includes('tomorrow') ||
    lower.includes('next day')
  ) {
    return { isPromise: true, hoursAhead: 24 };
  }
  if (
    lower.includes('sham') ||
    lower.includes('evening') ||
    lower.includes('later') ||
    lower.includes('baad mein') ||
    lower.includes('thodi der')
  ) {
    return { isPromise: true, hoursAhead: 6 };
  }
  if (
    lower.includes('monday') ||
    lower.includes('somwar') ||
    lower.includes('weekend')
  ) {
    return { isPromise: true, hoursAhead: 48 };
  }
  return { isPromise: false, hoursAhead: 0 };
}

export async function recordPromiseToPay(params: {
  caseId: string;
  customerId: string;
  source: 'voice' | 'whatsapp_reply';
  hoursAhead?: number;
}): Promise<any> {
  const { caseId, customerId, source, hoursAhead = 24 } = params;

  const promisedFor = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);

  const [promise] = await db
    .insert(paymentPromises)
    .values({
      caseId,
      customerId,
      promisedFor,
      status: 'pending',
      source,
    })
    .returning();

  const [recCase] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, caseId));

  const jobData = {
    promiseId: promise.id,
    caseId,
    orderId: recCase?.orderId ?? null,
    customerId,
  };

  const delayMs = hoursAhead * 60 * 60 * 1000;

  try {
    await promiseTrackerQueue.add('track', jobData, { delay: delayMs });
  } catch (err) {
    console.warn('BullMQ promiseTrackerQueue delay schedule failed:', err);
  }

  sseEmitter.emit('event', {
    type: 'promise_created',
    promiseId: promise.id,
    caseId,
    source,
    promisedFor: promise.promisedFor,
  });

  return promise;
}
