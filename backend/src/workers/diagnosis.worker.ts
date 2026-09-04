import { Worker, Job } from 'bullmq';
import { redis, isRedisPlaceholder } from '../config/redis';
import { db } from '../db';
import {
  recoveryCases,
  orders,
  customers,
  policies,
  systemFlags,
  agentInstances,
  agentLogs,
  recoveryActions,
} from '../db/schema';
import { emailQueue, whatsappQueue, voiceQueue } from '../config/queues';
import { classifyFailure, FailureMode } from '../services/ruleEngine';
import { runGuardrailChecks } from '../services/guardrail';
import { runDiagnosisAgent } from '../agents/diagnosisAgent';
import { sseEmitter } from '../services/sse';
import { processInterventionEmail } from './interventionEmail.worker';
import { processInterventionWhatsapp } from './interventionWhatsapp.worker';
import { processInterventionVoice } from './interventionVoice.worker';
import { eq } from 'drizzle-orm';
import { env } from '../env';

export async function processDiagnosis(data: {
  caseId: string;
  webhookPayload: any;
}): Promise<void> {
  const { caseId, webhookPayload } = data;

  const [recoveryCase] = await db
    .select()
    .from(recoveryCases)
    .where(eq(recoveryCases.id, caseId));
  if (!recoveryCase) throw new Error(`Recovery case ${caseId} not found`);

  let order = null;
  let customer = null;
  if (recoveryCase.orderId) {
    const [ord] = await db.select().from(orders).where(eq(orders.id, recoveryCase.orderId));
    order = ord ?? null;
    if (order?.customerId) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, order.customerId));
      customer = cust ?? null;
    }
  }

  if (!customer) {
    const [anyCust] = await db
      .select()
      .from(customers)
      .where(eq(customers.merchantId, env.MERCHANT_ID))
      .limit(1);
    customer = anyCust ?? {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Shopper',
      email: 'customer@example.com',
      phone: '',
    };
  }

  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.merchantId, env.MERCHANT_ID));

  const classified = classifyFailure(webhookPayload);
  const failureMode: FailureMode = classified ?? recoveryCase.failureMode;

  const [instance] = await db
    .insert(agentInstances)
    .values({
      caseId,
      agentType: 'diagnosis',
      status: 'running',
    })
    .returning();

  const hasPhone = Boolean(customer?.phone && customer.phone.trim().length > 5);

  const diagnosis = await runDiagnosisAgent({
    failureMode,
    amountInPaise: recoveryCase.atRiskAmountInPaise,
    customerName: customer.name,
    historyCount: 1,
    policy,
    hasPhone,
  });

  await db.insert(agentLogs).values({
    agentInstanceId: instance.id,
    level: 'reasoning',
    message: diagnosis.reasoning,
    metadata: {
      rootCause: diagnosis.rootCause,
      confidence: diagnosis.confidence,
      recommendedChannels: diagnosis.recommendedChannels,
    },
  });

  await db
    .update(recoveryCases)
    .set({
      failureMode,
      status: 'DIAGNOSED',
      updatedAt: new Date(),
    })
    .where(eq(recoveryCases.id, caseId));

  sseEmitter.emit('event', { type: 'case_diagnosed', caseId, failureMode });

  const guardrails = await runGuardrailChecks(
    customer.id,
    env.MERCHANT_ID,
    diagnosis.recommendedDiscountPct
  );

  const [killFlag] = await db
    .select()
    .from(systemFlags)
    .where(eq(systemFlags.key, 'global_kill_switch'));
  const isKilled = killFlag?.value === true;

  if (!guardrails.passed || isKilled) {
    const rationale = isKilled
      ? 'Intervention halted by Global Kill Switch'
      : 'Intervention suppressed by Guardrail policy (contact cap / quiet hours)';

    await db
      .update(recoveryCases)
      .set({
        status: 'SUPPRESSED',
        updatedAt: new Date(),
      })
      .where(eq(recoveryCases.id, caseId));

    await db.insert(recoveryActions).values({
      caseId,
      agentInstanceId: instance.id,
      channel: 'RETRY',
      rationale,
      policyChecksPassed: guardrails.checks,
      outcome: 'suppressed',
    });

    await db
      .update(agentInstances)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(agentInstances.id, instance.id));

    sseEmitter.emit('event', {
      type: 'case_suppressed',
      caseId,
      rationale,
      checks: guardrails.checks,
    });
    return;
  }

  const channels = diagnosis.recommendedChannels;
  for (const ch of channels) {
    const jobData = {
      caseId,
      agentInstanceId: instance.id,
      discountPct: diagnosis.recommendedDiscountPct,
    };

    if (isRedisPlaceholder) {
      try {
        if (ch === 'EMAIL') await processInterventionEmail(jobData);
        if (ch === 'WHATSAPP') await processInterventionWhatsapp(jobData);
        if (ch === 'VOICE') await processInterventionVoice(jobData);
      } catch (directErr) {
        console.error(`Direct intervention dispatch for ${ch} failed:`, directErr);
      }
    } else {
      try {
        if (ch === 'EMAIL') await emailQueue.add('send', jobData);
        if (ch === 'WHATSAPP') await whatsappQueue.add('send', jobData);
        if (ch === 'VOICE') await voiceQueue.add('call', jobData);
      } catch (err) {
        console.warn(`Failed to enqueue ${ch} intervention, executing directly:`, err);
        try {
          if (ch === 'EMAIL') await processInterventionEmail(jobData);
          if (ch === 'WHATSAPP') await processInterventionWhatsapp(jobData);
          if (ch === 'VOICE') await processInterventionVoice(jobData);
        } catch (directErr) {
          console.error(`Direct intervention dispatch for ${ch} failed:`, directErr);
        }
      }
    }
  }

  await db
    .update(recoveryCases)
    .set({
      status: 'INTERVENTION_SCHEDULED',
      updatedAt: new Date(),
    })
    .where(eq(recoveryCases.id, caseId));

  await db
    .update(agentInstances)
    .set({ status: 'completed', finishedAt: new Date() })
    .where(eq(agentInstances.id, instance.id));

  sseEmitter.emit('event', {
    type: 'intervention_dispatched',
    caseId,
    channels,
  });
}

export const diagnosisWorker = !isRedisPlaceholder
  ? new Worker(
      'diagnosis',
      async (job: Job) => {
        await processDiagnosis(job.data);
      },
      { connection: redis, concurrency: 5 }
    )
  : null;

if (diagnosisWorker) {
  diagnosisWorker.on('error', () => {});
}
