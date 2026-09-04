import express from 'express';
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
import './workers';

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));

// Structured logging on every request
app.use(pinoHttp());

// Rate limiters (Phase 10.2)
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

// Body parsing — NOTE: /api/webhooks/razorpay must use raw body,
// so express.json() is NOT applied globally for that route.
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/razorpay') return next();
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// Routes
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

// Centralized error handler — must be LAST
app.use(errorHandler);

export default app;
