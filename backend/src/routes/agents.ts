import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { systemFlags, agentInstances, agentLogs } from '../db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { sseEmitter } from '../services/sse';

const router = Router();

router.get('/system/kill-switch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [flag] = await db
      .select()
      .from(systemFlags)
      .where(eq(systemFlags.key, 'global_kill_switch'));

    res.json({ active: flag?.value === true });
  } catch (err) {
    next(err);
  }
});

router.post('/system/kill-switch', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { active } = req.body;
    const boolVal = Boolean(active);

    const [existing] = await db
      .select()
      .from(systemFlags)
      .where(eq(systemFlags.key, 'global_kill_switch'));

    if (existing) {
      await db
        .update(systemFlags)
        .set({
          value: boolVal,
          updatedAt: new Date(),
          updatedBy: 'admin',
        })
        .where(eq(systemFlags.key, 'global_kill_switch'));
    } else {
      await db.insert(systemFlags).values({
        key: 'global_kill_switch',
        value: boolVal,
        updatedBy: 'admin',
      });
    }

    sseEmitter.emit('event', {
      type: 'kill_switch_toggled',
      active: boolVal,
      message: boolVal ? 'Global Kill Switch ACTIVATED' : 'Global Kill Switch DEACTIVATED',
    });

    res.json({ success: true, active: boolVal });
  } catch (err) {
    next(err);
  }
});

router.get('/agents', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const instances = await db
      .select()
      .from(agentInstances)
      .orderBy(desc(agentInstances.startedAt))
      .limit(50);

    res.json({ instances });
  } catch (err) {
    next(err);
  }
});

router.get('/agents/:id/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;

    const logs = await db
      .select()
      .from(agentLogs)
      .where(eq(agentLogs.agentInstanceId, id))
      .orderBy(asc(agentLogs.timestamp));

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
