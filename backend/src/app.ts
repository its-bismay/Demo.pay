import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './env';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import checkoutRouter from './routes/checkout';
import webhooksRouter from './routes/webhooks';
import './workers/webhookIngestion.worker';

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));

// Structured logging on every request
app.use(pinoHttp());

// Body parsing — NOTE: /api/webhooks/razorpay must use raw body,
// so express.json() is NOT applied globally for that route.
// It is applied to all other routes here:
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

// Centralized error handler — must be LAST
app.use(errorHandler);

export default app;
