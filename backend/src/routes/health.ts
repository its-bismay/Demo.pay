import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: true });
  } catch {
    res.status(503).json({ status: 'degraded', db: false });
  }
});

export default router;
