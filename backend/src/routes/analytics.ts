import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { recoveryCases } from '../db/schema';
import { inArray, eq, sql } from 'drizzle-orm';
import { env } from '../env';

export interface KpiSummary {
  atRiskAmountInPaise: number;
  recoveredAmountInPaise: number;
  activeInterventionsCount: number;
  atRisk: number;
  recovered: number;
  activeInterventions: number;
  recoveryRate: number;
}

export async function getKpiSummary(): Promise<KpiSummary> {
  const [atRiskResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${recoveryCases.atRiskAmountInPaise}), 0)`,
    })
    .from(recoveryCases)
    .where(
      inArray(recoveryCases.status, [
        'DETECTED',
        'DIAGNOSED',
        'INTERVENTION_SCHEDULED',
        'INTERVENTION_EXECUTING',
      ])
    );

  const [recoveredResult] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${recoveryCases.status} = 'RECOVERED' then ${recoveryCases.atRiskAmountInPaise} else ${recoveryCases.recoveredAmountInPaise} end), 0)`,
    })
    .from(recoveryCases);

  const [activeResult] = await db
    .select({
      count: sql<string>`count(*)`,
    })
    .from(recoveryCases)
    .where(
      inArray(recoveryCases.status, [
        'INTERVENTION_SCHEDULED',
        'INTERVENTION_EXECUTING',
      ])
    );

  const atRiskAmountInPaise = parseInt(atRiskResult?.total ?? '0', 10);
  const recoveredAmountInPaise = parseInt(recoveredResult?.total ?? '0', 10);
  const activeInterventionsCount = parseInt(activeResult?.count ?? '0', 10);

  const total = atRiskAmountInPaise + recoveredAmountInPaise;
  const recoveryRate = total > 0 ? Math.round((recoveredAmountInPaise / total) * 100) : 0;

  return {
    atRiskAmountInPaise,
    recoveredAmountInPaise,
    activeInterventionsCount,
    atRisk: Math.round(atRiskAmountInPaise / 100),
    recovered: Math.round(recoveredAmountInPaise / 100),
    activeInterventions: activeInterventionsCount,
    recoveryRate,
  };
}

const router = Router();

router.get('/analytics/summary', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const summary = await getKpiSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
