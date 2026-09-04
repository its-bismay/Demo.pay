import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';

export interface AuthenticatedRequest extends Request {
  customerId?: string;
  merchantId?: string;
}

export const requireCustomerSession = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ success: false, message: 'No token provided' }); return; }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { customerId: string; merchantId: string };
    req.customerId = payload.customerId;
    req.merchantId = payload.merchantId;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
