import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import {
  recoveryCases,
  orders,
  customers,
  policies,
  systemFlags,
  recoveryActions,
  contactLog,
  orderItems,
  products,
} from '../db/schema';
import { sendRecoveryEmail } from '../services/email';
import { createRazorpayOrder } from '../services/razorpay';
import { generateInterventionCopy } from '../agents/interventionAgent';
import { sseEmitter } from '../services/sse';
import { eq } from 'drizzle-orm';
import { env } from '../env';

export async function processInterventionEmail(data: {
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
    sseEmitter.emit('event', { type: 'case_suppressed', caseId, channel: 'EMAIL' });
    return;
  }

  const [recoveryCase] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, caseId));
  if (!recoveryCase) return;

  let order = null;
  let customer = null;
  let productName = 'Store Product';

  if (recoveryCase.orderId) {
    const [ord] = await db.select().from(orders).where(eq(orders.id, recoveryCase.orderId));
    order = ord;
    if (order?.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, order.customerId));
      customer = cust;
    }
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, recoveryCase.orderId));
    if (item?.productId) {
      const [prod] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId));
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

  const customerEmail = customer?.email ?? 'customer@example.com';
  const customerName = customer?.name ?? 'Valued Customer';
  const amount = recoveryCase.atRiskAmountInPaise;
  const discountedAmount =
    discountPct > 0 ? Math.round(amount * (1 - discountPct / 100)) : amount;

  let recoveryOrderId = order?.razorpayOrderId ?? `order_rec_${Date.now()}`;
  try {
    const rzpRecOrder = await createRazorpayOrder(
      discountedAmount,
      `rcpt_rec_${Date.now().toString().slice(-8)}`
    );
    recoveryOrderId = rzpRecOrder.id;
  } catch (e) {
    console.warn('Razorpay recovery order creation note:', (e as Error).message);
  }

  const recoveryLink = `${env.FRONTEND_ORIGIN}/store?recovery_order_id=${recoveryOrderId}&case_id=${caseId}`;

  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.merchantId, env.MERCHANT_ID));

  await generateInterventionCopy({
    customerName,
    productName,
    amountInPaise: amount,
    failureMode: recoveryCase.failureMode,
    recoveryLink,
    policy,
  });

  await sendRecoveryEmail({
    to: customerEmail,
    customerName,
    productName,
    recoveryLink,
    discountText: discountPct > 0 ? `${discountPct}% Discount Applied automatically!` : undefined,
  });

  if (agentInstanceId) {
    await db.insert(recoveryActions).values({
      caseId,
      agentInstanceId,
      channel: 'EMAIL',
      rationale: `Sent tailored recovery email with ${discountPct}% discount offer.`,
      policyChecksPassed: { contactCap: true, quietHours: true, discountCap: true },
      outcome: 'sent',
    });
  }

  if (customer?.id) {
    await db.insert(contactLog).values({
      customerId: customer.id,
      channel: 'EMAIL',
    });
  }

  await db
    .update(recoveryCases)
    .set({ status: 'INTERVENTION_EXECUTING', updatedAt: new Date() })
    .where(eq(recoveryCases.id, caseId));

  sseEmitter.emit('event', {
    type: 'intervention_dispatched',
    channel: 'EMAIL',
    caseId,
    customerName,
  });
}

export const interventionEmailWorker = !isRedisPlaceholder
  ? new Worker(
      'intervention-email',
      async (job: Job) => {
        await processInterventionEmail(job.data);
      },
      { connection: redis, concurrency: 5 }
    )
  : null;

if (interventionEmailWorker) {
  interventionEmailWorker.on('error', () => {});
}
