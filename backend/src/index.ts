import app from './app';
import { env } from './env';
import { db } from './db';
import { sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ level: 'info' });

const startServer = async (): Promise<void> => {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info('✅ Database connected');

    const server = app.listen(Number(env.PORT), () => {
      logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
    });

    const shutDownServer = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('✅ HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutDownServer('SIGINT'));
    process.on('SIGTERM', () => shutDownServer('SIGTERM'));

  } catch (error) {
    logger.error({ err: error }, '❌ Failed to start server');
    process.exit(1);
  }
};

startServer();
