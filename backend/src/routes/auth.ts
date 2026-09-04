import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { customers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { customerSessionSchema } from '../schemas';
import { env } from '../env';

const router = Router();

// POST /api/auth/customer/session
router.post(
  '/auth/customer/session',
  validate(customerSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, phone } = req.body;

      // Upsert customer (same phone+merchantId = same customer)
      let [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.phone, phone), eq(customers.merchantId, env.MERCHANT_ID)));

      if (!customer) {
        [customer] = await db.insert(customers).values({
          merchantId: env.MERCHANT_ID,
          name,
          email,
          phone,
        }).returning();
      } else {
        // Update name/email in case they changed
        [customer] = await db.update(customers)
          .set({ name, email })
          .where(eq(customers.id, customer.id))
          .returning();
      }

      const token = jwt.sign(
        { customerId: customer.id, merchantId: env.MERCHANT_ID },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      res.json({ success: true, token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/customer/logout — just a signal; JWT is stateless so frontend clears it
router.post('/auth/customer/logout', (req: Request, res: Response): void => {
  res.json({ success: true, message: 'Session cleared' });
});

export default router;
