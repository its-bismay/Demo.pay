import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { orders, orderItems, products, cartSessions, webhookEvents, customers } from '../db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { requireCustomerSession, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { checkoutOrderSchema, simulateSchema, abandonCartSchema } from '../schemas';
import { createRazorpayOrder } from '../services/razorpay';
import { webhookIngestionQueue } from '../config/queues';
import { processWebhookIngestion } from '../workers/webhookIngestion.worker';
import { hashPassword } from '../lib/password';
import { env } from '../env';

const router = Router();

router.post(
  '/checkout/order',
  requireCustomerSession,
  validate(checkoutOrderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items } = req.body;
      const productIds = items.map((i: { productId: string }) => i.productId);

      const dbProducts = await db
        .select()
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.active, true)));

      if (dbProducts.length !== items.length) {
        res.status(400).json({ success: false, message: 'One or more products are invalid or inactive' });
        return;
      }

      const productMap = new Map(dbProducts.map((p) => [p.id, p]));
      let totalAmountInPaise = 0;

      for (const item of items) {
        const prod = productMap.get(item.productId)!;
        totalAmountInPaise += prod.priceInPaise * item.quantity;
      }

      const receiptId = `rcpt_${Date.now().toString().slice(-8)}`;
      let rzpOrder;
      try {
        rzpOrder = await createRazorpayOrder(totalAmountInPaise, receiptId);
      } catch (rzpErr: any) {
        rzpOrder = { id: `order_mock_${Date.now()}` };
      }

      const [order] = await db
        .insert(orders)
        .values({
          merchantId: env.MERCHANT_ID,
          customerId: req.customerId!,
          razorpayOrderId: rzpOrder.id,
          amountInPaise: totalAmountInPaise,
          status: 'created',
        })
        .returning();

      const itemsToInsert = items.map((i: { productId: string; quantity: number }) => ({
        orderId: order.id,
        productId: i.productId,
        quantity: i.quantity,
        priceAtTimeInPaise: productMap.get(i.productId)!.priceInPaise,
      }));

      await db.insert(orderItems).values(itemsToInsert);

      await db
        .update(cartSessions)
        .set({ status: 'converted', updatedAt: new Date() })
        .where(
          and(
            eq(cartSessions.customerId, req.customerId!),
            eq(cartSessions.status, 'active')
          )
        );

      res.json({
        success: true,
        orderId: order.id,
        razorpayOrderId: rzpOrder.id,
        amountInPaise: totalAmountInPaise,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/checkout/simulate',
  validate(simulateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId, scenario, paymentMethod = 'upi' } = req.body;

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        res.status(404).json({ success: false, message: 'Order not found' });
        return;
      }

      const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));

      const isSuccess = scenario === 'successful_payment';
      const eventType = isSuccess ? 'payment.captured' : 'payment.failed';
      const paymentId = `pay_${Date.now()}`;

      let errorCode: string | null = null;
      let errorDesc: string | null = null;

      switch (scenario) {
        case 'gateway_timeout':
          errorCode = 'GATEWAY_TIMEOUT';
          errorDesc = 'Gateway Timeout';
          break;
        case 'insufficient_funds':
          errorCode = 'INSUFFICIENT_FUNDS';
          errorDesc = 'Payment failed due to insufficient balance';
          break;
        case 'upi_unreachable':
          errorCode = 'UPI_UNREACHABLE';
          errorDesc = 'UPI collect request expired';
          break;
        case 'auth_failed':
          errorCode = 'BAD_REQUEST_ERROR';
          errorDesc = 'authentication_failed';
          break;
        default:
          if (!isSuccess) {
            errorCode = 'INSUFFICIENT_FUNDS';
            errorDesc = 'Payment simulation failure';
          }
      }

      const syntheticPayload = {
        entity: 'event',
        account_id: 'acc_test',
        event: eventType,
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: 'payment',
              amount: order.amountInPaise,
              currency: 'INR',
              status: isSuccess ? 'captured' : 'failed',
              order_id: order.razorpayOrderId,
              method: paymentMethod,
              email: customer?.email ?? 'customer@example.com',
              contact: customer?.phone ?? '+919876543210',
              error_code: errorCode,
              error_description: errorDesc,
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      };

      const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const [storedEvent] = await db
        .insert(webhookEvents)
        .values({
          razorpayEventId: eventId,
          eventType,
          rawPayload: syntheticPayload,
        })
        .returning();

      try {
        await webhookIngestionQueue.add('process', { webhookEventId: storedEvent.id });
      } catch (qErr) {
        console.warn('Webhook queue dispatch fallback to direct processing:', qErr);
        await processWebhookIngestion(storedEvent.id);
      }

      res.json({ success: true, message: 'Simulation triggered', eventId: storedEvent.id });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/checkout/abandon-cart',
  validate(abandonCartSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cartItems: items } = req.body;
      const productIds = items.map((i: { productId: string }) => i.productId);

      const dbProducts = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));

      const productMap = new Map(dbProducts.map((p) => [p.id, p]));
      let totalInPaise = 0;

      for (const item of items) {
        const prod = productMap.get(item.productId);
        if (prod) totalInPaise += prod.priceInPaise * item.quantity;
      }

      let customerId = req.customerId;
      if (!customerId) {
        const [anyCustomer] = await db
          .select()
          .from(customers)
          .where(eq(customers.merchantId, env.MERCHANT_ID))
          .limit(1);
        customerId = anyCustomer?.id;
      }

      if (!customerId) {
        const [newCustomer] = await db
          .insert(customers)
          .values({
            merchantId: env.MERCHANT_ID,
            name: 'Anonymous Shopper',
            email: 'anonymous@example.com',
            phone: '+919999999999',
            passwordHash: hashPassword('anon1234'),
          })
          .returning();
        customerId = newCustomer.id;
      }

      const [cartSession] = await db
        .insert(cartSessions)
        .values({
          customerId,
          items,
          totalInPaise,
          status: 'abandoned',
        })
        .returning();

      const eventId = `abandon_${crypto.randomUUID()}`;
      const syntheticPayload = {
        event: 'cart.abandoned',
        cartSessionId: cartSession.id,
        customerId,
        amount: totalInPaise,
      };

      const [storedEvent] = await db
        .insert(webhookEvents)
        .values({
          razorpayEventId: eventId,
          eventType: 'cart.abandoned',
          rawPayload: syntheticPayload,
        })
        .returning();

      try {
        await webhookIngestionQueue.add('process', { webhookEventId: storedEvent.id });
      } catch (qErr) {
        console.warn('Queue add failed for abandon-cart, processing directly:', qErr);
        await processWebhookIngestion(storedEvent.id);
      }

      res.json({ success: true, cartSessionId: cartSession.id });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
