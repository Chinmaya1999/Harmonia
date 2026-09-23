import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, Professional } from '../models/index.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: '30d' });

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return next(unauthorized());
    req.user = user;
    if (user.role === 'professional') req.pro = await Professional.findOne({ user: user._id });
    return next();
  } catch {
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  return next();
};
