export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have access to this') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, code);

export function assert(cond, err) {
  if (!cond) throw err;
}
