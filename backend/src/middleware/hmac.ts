import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../env';

export const rawBodyMiddleware = express.raw({ type: '*/*' });

export const verifyRazorpayHmac = (req: Request, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) {
    res.status(400).json({ success: false, message: 'Missing signature' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    res.status(400).json({ success: false, message: 'Invalid signature' });
    return;
  }

  req.body = JSON.parse(req.body.toString());
  next();
};
