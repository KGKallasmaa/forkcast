import { Router, type Request, type Response } from 'express';
import { generateMealPlan, regenerateMeals } from '../services/aiService.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (payload: Record<string, unknown>) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  try {
    if (req.body.slotsToGenerate) {
      // Regeneration is a single call — no day events, same contract as before.
      const data = await regenerateMeals(req.body, (message) => emit({ type: 'progress', message }));
      emit({ type: 'done', success: true, data });
    } else {
      // Full plan: stream each day as it is written, then the full ordered
      // plan in `done` exactly as before.
      const data = await generateMealPlan(
        req.body,
        (message) => emit({ type: 'progress', message }),
        (day) => emit({ type: 'day', day })
      );
      emit({ type: 'done', success: true, data });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    emit({ type: 'error', success: false, error: message });
  } finally {
    res.end();
  }
});

export default router;