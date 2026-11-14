import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ code: 'not_found', message: `Rota não encontrada: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
  if (status >= 500) logger.error({ err }, 'erro não tratado');
  res.status(status).json({
    code: err?.code && typeof err.code === 'string' ? err.code : 'server_error',
    message: status >= 500 ? 'Erro interno.' : String(err?.message ?? 'Erro.')
  });
};
