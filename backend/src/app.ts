import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './env';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import checkoutRouter from './routes/checkout';
import webhooksRouter from './routes/webhooks';
import policiesRouter from './routes/policies';
import agentsRouter from './routes/agents';
import analyticsRouter from './routes/analytics';
import streamRouter from './routes/stream';
import casesRouter from './routes/cases';
import simulateRouter from './routes/simulate';
import voiceRouter from './routes/voice';
import './workers';

const app = express();

const allowedOrigins = [
  env.FRONTEND_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://demo-pay-jet.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(pinoHttp());

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/checkout', checkoutLimiter);
app.use('/api/webhooks', webhookLimiter);

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/webhooks/razorpay') return next();
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', db: true, timestamp: new Date().toISOString() });
});

app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', productsRouter);
app.use('/api', checkoutRouter);
app.use('/api', webhooksRouter);
app.use('/api', policiesRouter);
app.use('/api', agentsRouter);
app.use('/api', analyticsRouter);
app.use('/api', streamRouter);
app.use('/api', casesRouter);
app.use('/api', simulateRouter);
app.use('/api', voiceRouter);

app.get(['/test-mic', '/mic-test'], (_req: Request, res: Response) => {
  res.sendFile(path.resolve(__dirname, '../../mic_test.html'));
});

app.use(errorHandler);

export default app;
