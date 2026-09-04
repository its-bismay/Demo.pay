import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode ?? 500;
  logger.error({ err, url: req.url, method: req.method }, err.message);
  res.status(statusCode).json({
    success: false,
    message: err.message ?? 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
