import { Router, Request, Response } from 'express';
import { sseEmitter } from '../services/sse';
import { getKpiSummary } from './analytics';

const router = Router();

router.get('/stream/events', (req: Request, res: Response): void => {
  sseEmitter.addClient(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
});

router.get('/stream/metrics', async (req: Request, res: Response): Promise<void> => {
  sseEmitter.addClient(res);
  try {
    const metrics = await getKpiSummary();
    res.write(`event: metrics_update\ndata: ${JSON.stringify(metrics)}\n\n`);
  } catch (err) {
    console.warn('Initial SSE metrics push error:', err);
  }
});

export default router;
