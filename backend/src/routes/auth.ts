import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { customers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { validate } from '../middleware/validate';
import { customerSignupSchema, customerLoginSchema, customerSessionSchema } from '../schemas';
import { hashPassword, verifyPassword } from '../lib/password';
import { env } from '../env';

const router = Router();

router.post(
  '/auth/customer/signup',
  validate(customerSignupSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, phone, password } = req.body;

      const normalizedEmail = email.toLowerCase().trim();

      const [existing] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.email, normalizedEmail), eq(customers.merchantId, env.MERCHANT_ID)));

      if (existing) {
        res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please log in.',
        });
        return;
      }

      const passwordHash = hashPassword(password);

      const [newCustomer] = await db
        .insert(customers)
        .values({
          merchantId: env.MERCHANT_ID,
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
          passwordHash,
        })
        .returning();

      const token = jwt.sign(
        { customerId: newCustomer.id, merchantId: env.MERCHANT_ID },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      res.status(201).json({
        success: true,
        token,
        customer: {
          id: newCustomer.id,
          name: newCustomer.name,
          email: newCustomer.email,
          phone: newCustomer.phone,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/auth/customer/login',
  validate(customerLoginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const normalizedEmail = email.toLowerCase().trim();

      const [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.email, normalizedEmail), eq(customers.merchantId, env.MERCHANT_ID)));

      if (!customer || !customer.passwordHash) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
        return;
      }

      const isValid = verifyPassword(password, customer.passwordHash);
      if (!isValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
        return;
      }

      const token = jwt.sign(
        { customerId: customer.id, merchantId: env.MERCHANT_ID },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      res.json({
        success: true,
        token,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/auth/customer/session',
  validate(customerSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, phone = '' } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      let [customer] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.email, normalizedEmail), eq(customers.merchantId, env.MERCHANT_ID)));

      if (!customer) {
        const defaultHash = hashPassword('demo1234');
        [customer] = await db
          .insert(customers)
          .values({
            merchantId: env.MERCHANT_ID,
            name: name.trim(),
            email: normalizedEmail,
            phone: phone.trim() || '+91 98765 43210',
            passwordHash: defaultHash,
          })
          .returning();
      }

      const token = jwt.sign(
        { customerId: customer.id, merchantId: env.MERCHANT_ID },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      res.json({
        success: true,
        token,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/auth/customer/logout', (req: Request, res: Response): void => {
  res.json({ success: true, message: 'Session cleared' });
});

export default router;
