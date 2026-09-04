import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import {
  recoveryCases,
  orders,
  customers,
  orderItems,
  products,
  agentInstances,
  agentLogs,
  recoveryActions,
  paymentPromises,
} from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

const failureModeLabels: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Insufficient Funds',
  GATEWAY_TIMEOUT: 'Bank Timeout',
  UPI_UNREACHABLE: 'UPI App Unreachable',
  AUTH_FAILED: 'Authentication Failed',
  CHECKOUT_ABANDONED: 'Cart Abandoned',
  MANDATE_DECLINED: 'Mandate Declined',
  INVOICE_OVERDUE: 'Invoice Overdue',
};

const router = Router();

router.get('/cases', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const statusFilter = req.query.status as string;

    const query = db
      .select({
        id: recoveryCases.id,
        orderId: recoveryCases.orderId,
        failureMode: recoveryCases.failureMode,
        status: recoveryCases.status,
        atRiskAmountInPaise: recoveryCases.atRiskAmountInPaise,
        recoveredAmountInPaise: recoveryCases.recoveredAmountInPaise,
        createdAt: recoveryCases.createdAt,
        updatedAt: recoveryCases.updatedAt,
        customerId: orders.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(recoveryCases)
      .leftJoin(orders, eq(recoveryCases.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(recoveryCases.createdAt))
      .limit(limit)
      .offset(offset);

    const rows = await query;

    const formatted = rows
      .filter((r) => !statusFilter || r.status === statusFilter)
      .map((r) => {
        const timeAgo = formatTimeAgo(r.createdAt);
        return {
          id: r.id,
          time: timeAgo,
          rawTime: r.createdAt,
          user: r.customerName ?? 'Guest Shopper',
          customerEmail: r.customerEmail,
          customerPhone: r.customerPhone,
          trigger: failureModeLabels[r.failureMode] ?? r.failureMode,
          failureMode: r.failureMode,
          status: r.status,
          amount: Math.round(r.atRiskAmountInPaise / 100),
          atRiskAmountInPaise: r.atRiskAmountInPaise,
          recoveredAmountInPaise: r.recoveredAmountInPaise,
        };
      });

    res.json({ cases: formatted, total: formatted.length });
  } catch (err) {
    next(err);
  }
});

router.get('/cases/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;

    const [recCase] = await db
      .select()
      .from(recoveryCases)
      .where(eq(recoveryCases.id, id));

    if (!recCase) {
      res.status(404).json({ success: false, message: 'Recovery case not found' });
      return;
    }

    let customer = null;
    let order = null;
    let items: any[] = [];

    if (recCase.orderId) {
      const [ord] = await db.select().from(orders).where(eq(orders.id, recCase.orderId));
      order = ord ?? null;

      if (order?.customerId) {
        const [cust] = await db.select().from(customers).where(eq(customers.id, order.customerId));
        customer = cust ?? null;
      }

      const ordItems = await db
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          priceAtTimeInPaise: orderItems.priceAtTimeInPaise,
          productName: products.name,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, recCase.orderId));
      items = ordItems;
    }

    const instances = await db
      .select()
      .from(agentInstances)
      .where(eq(agentInstances.caseId, id))
      .orderBy(desc(agentInstances.startedAt));

    const instanceIds = instances.map((i) => i.id);
    let logs: any[] = [];
    if (instanceIds.length > 0) {
      logs = await db
        .select()
        .from(agentLogs)
        .where(inArray(agentLogs.agentInstanceId, instanceIds))
        .orderBy(desc(agentLogs.timestamp));
    }

    const actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.caseId, id))
      .orderBy(desc(recoveryActions.createdAt));

    const promises = await db
      .select()
      .from(paymentPromises)
      .where(eq(paymentPromises.caseId, id))
      .orderBy(desc(paymentPromises.promisedAt));

    res.json({
      case: {
        ...recCase,
        triggerLabel: failureModeLabels[recCase.failureMode] ?? recCase.failureMode,
        customer,
        order,
        items,
        agentInstances: instances,
        logs,
        actions,
        promises,
      },
    });
  } catch (err) {
    next(err);
  }
});

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(date).toLocaleDateString();
}

export default router;
