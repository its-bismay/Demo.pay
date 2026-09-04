import express, { Request, Response, NextFunction } from 'express';
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

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));

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

app.use(errorHandler);

export default app;
