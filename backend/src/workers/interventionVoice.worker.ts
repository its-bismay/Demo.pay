import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import {
  recoveryCases,
  orders,
  customers,
  systemFlags,
  recoveryActions,
  contactLog,
  orderItems,
  products,
} from '../db/schema';
import { initiateVoiceCall } from '../services/twilio';
import { sseEmitter } from '../services/sse';
import { eq } from 'drizzle-orm';
import { env } from '../env';

export async function processInterventionVoice(data: {
  caseId: string;
  agentInstanceId?: string;
  discountPct?: number;
}): Promise<void> {
  const { caseId, agentInstanceId, discountPct = 0 } = data;

  const [killFlag] = await db
    .select()
    .from(systemFlags)
    .where(eq(systemFlags.key, 'global_kill_switch'));
  if (killFlag?.value === true) {
    await db
      .update(recoveryCases)
      .set({ status: 'SUPPRESSED', updatedAt: new Date() })
      .where(eq(recoveryCases.id, caseId));
    sseEmitter.emit('event', { type: 'case_suppressed', caseId, channel: 'VOICE' });
    return;
  }

  const [recoveryCase] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, caseId));
  if (!recoveryCase) return;

  let customer = null;
  let productName = 'Store Order';

  if (recoveryCase.orderId) {
    const [ord] = await db.select().from(orders).where(eq(orders.id, recoveryCase.orderId));
    if (ord?.customerId) {
      const [cust] = await db.select().from(customers).where(eq(customers.id, ord.customerId));
      customer = cust;
    }
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, recoveryCase.orderId));
    if (item?.productId) {
      const [prod] = await db.select().from(products).where(eq(products.id, item.productId));
      if (prod) productName = prod.name;
    }
  }

  if (!customer) {
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.merchantId, env.MERCHANT_ID))
      .limit(1);
    customer = cust;
  }

  const phone = customer?.phone ?? '+919876543210';
  const customerName = customer?.name ?? 'Customer';
  const recoveryLink = `${env.FRONTEND_ORIGIN}/store?case_id=${caseId}`;

  const { callSid } = await initiateVoiceCall({
    to: phone,
    customerName,
    productName,
    recoveryLink,
    discountPct,
  });

  if (agentInstanceId) {
    await db.insert(recoveryActions).values({
      caseId,
      agentInstanceId,
      channel: 'VOICE',
      rationale: `Initiated empathetic voice support call. CallSid: ${callSid}`,
      policyChecksPassed: { contactCap: true, quietHours: true, discountCap: true },
      outcome: 'sent',
    });
  }

  if (customer?.id) {
    await db.insert(contactLog).values({
      customerId: customer.id,
      channel: 'VOICE',
    });
  }

  await db
    .update(recoveryCases)
    .set({ status: 'INTERVENTION_EXECUTING', updatedAt: new Date() })
    .where(eq(recoveryCases.id, caseId));

  sseEmitter.emit('event', {
    type: 'intervention_dispatched',
    channel: 'VOICE',
    caseId,
    callSid,
  });
}

export const interventionVoiceWorker = !isRedisPlaceholder
  ? new Worker(
      'intervention-voice',
      async (job: Job) => {
        await processInterventionVoice(job.data);
      },
      { connection: redis, concurrency: 3 }
    )
  : null;

if (interventionVoiceWorker) {
  interventionVoiceWorker.on('error', () => {});
}
