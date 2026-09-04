import { db } from '../db';
import { policies, contactLog } from '../db/schema';
import { eq, and, gt } from 'drizzle-orm';

function isInQuietWindow(now: string, start: string, end: string): boolean {
  if (start > end) {
    return now >= start || now < end;
  }
  return now >= start && now < end;
}

export async function runGuardrailChecks(
  customerId: string,
  merchantId: string,
  discountPct?: number
): Promise<{
  passed: boolean;
  checks: { contactCap: boolean; quietHours: boolean; discountCap: boolean };
}> {
  const [policy] = await db.select().from(policies).where(eq(policies.merchantId, merchantId));

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentContacts = await db
    .select()
    .from(contactLog)
    .where(and(eq(contactLog.customerId, customerId), gt(contactLog.sentAt, twentyFourHoursAgo)));
  const contactCapOk = policy ? recentContacts.length < policy.maxContactsPer24h : true;

  const now = new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const quietHoursOk = policy
    ? !isInQuietWindow(now, policy.quietHoursStart, policy.quietHoursEnd)
    : true;

  const discountCapOk =
    discountPct == null || (policy ? discountPct <= policy.maxDiscountPct : true);

  const checks = { contactCap: contactCapOk, quietHours: quietHoursOk, discountCap: discountCapOk };
  return { passed: Object.values(checks).every(Boolean), checks };
}
