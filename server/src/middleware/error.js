import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: { code: 'VALIDATION', message: `${first.path.join('.') || 'input'}: ${first.message}`, issues: err.issues } });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: { code: 'BAD_ID', message: 'Invalid identifier' } });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: { code: 'VALIDATION', message: Object.values(err.errors)[0]?.message || err.message } });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'Files must be under 8 MB' } });
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } });
}
