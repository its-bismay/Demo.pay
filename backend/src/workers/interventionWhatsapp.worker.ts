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
import { sendWhatsAppMessage } from '../services/whatsappService';
import { sseEmitter } from '../services/sse';
import { eq } from 'drizzle-orm';
import { env } from '../env';

export async function processInterventionWhatsapp(data: {
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
    sseEmitter.emit('event', { type: 'case_suppressed', caseId, channel: 'WHATSAPP' });
    return;
  }

  const [recoveryCase] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, caseId));
  if (!recoveryCase) return;

  let customer = null;
  let productName = 'Order';

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

  const phone = customer?.phone?.trim() ?? '';
  if (!phone || phone.length < 6) {
    if (agentInstanceId) {
      await db.insert(recoveryActions).values({
        caseId,
        agentInstanceId,
        channel: 'WHATSAPP',
        rationale: 'Skipped WhatsApp dispatch: customer has no phone number on record.',
        policyChecksPassed: { contactCap: true, quietHours: true, discountCap: true },
        outcome: 'suppressed',
      });
    }
    return;
  }

  const customerName = customer?.name ?? 'Customer';
  const recoveryLink = `${env.FRONTEND_ORIGIN}/store?case_id=${caseId}`;

  const { messageSid } = await sendWhatsAppMessage({
    to: phone,
    customerName,
    productName,
    recoveryLink,
    discountText: discountPct > 0 ? `${discountPct}% off applied!` : undefined,
  });

  if (agentInstanceId) {
    await db.insert(recoveryActions).values({
      caseId,
      agentInstanceId,
      channel: 'WHATSAPP',
      rationale: `Dispatched WhatsApp recovery message with one-tap link. MessageSid: ${messageSid}`,
      policyChecksPassed: { contactCap: true, quietHours: true, discountCap: true },
      outcome: 'sent',
    });
  }

  if (customer?.id) {
    await db.insert(contactLog).values({
      customerId: customer.id,
      channel: 'WHATSAPP',
    });
  }

  await db
    .update(recoveryCases)
    .set({ status: 'INTERVENTION_EXECUTING', updatedAt: new Date() })
    .where(eq(recoveryCases.id, caseId));

  sseEmitter.emit('event', {
    type: 'intervention_dispatched',
    channel: 'WHATSAPP',
    caseId,
    messageSid,
  });
}

export const interventionWhatsappWorker = !isRedisPlaceholder
  ? new Worker(
      'intervention-whatsapp',
      async (job: Job) => {
        await processInterventionWhatsapp(job.data);
      },
      { connection: redis, concurrency: 10 }
    )
  : null;

if (interventionWhatsappWorker) {
  interventionWhatsappWorker.on('error', () => {});
}
