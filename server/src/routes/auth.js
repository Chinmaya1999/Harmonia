import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User, Professional, Community } from '../models/index.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { env } from '../config/env.js';
import { issueHarmoniaId } from '../services/identity.js';
import { audit } from '../services/audit.js';

const r = Router();
const hash = (s) => crypto.createHash('sha256').update(`${s}:${env.jwtSecret}`).digest('hex');
const phoneSchema = z.string().transform((s) => s.replace(/\D/g, '').slice(-10)).refine((s) => /^[6-9]\d{9}$/.test(s), 'Enter a valid 10-digit Indian mobile number');

// OTPs for not-yet-registered numbers live in memory for five minutes.
const pending = new Map();

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: env.isProd ? 8 : 500, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again in a few minutes.' } } });

r.post('/otp', otpLimiter, async (req, res) => {
  const phone = phoneSchema.parse(req.body.phone);
  const otp = String(crypto.randomInt(100000, 1000000));
  const existing = await User.findOne({ phone });
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { 'otp.hash': hash(`${phone}:${otp}`), 'otp.expiresAt': new Date(Date.now() + 5 * 60000), 'otp.attempts': 0 } });
  } else {
    pending.set(phone, { hash: hash(`${phone}:${otp}`), expiresAt: Date.now() + 5 * 60000, attempts: 0 });
  }
  // In production this goes out by SMS/WhatsApp through the notification BSP.
  if (!env.isProd) console.log(`[otp] ${phone} → ${otp}`);
  res.json({ ok: true, isNew: !existing, devOtp: env.isProd ? undefined : otp });
});

const verifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  role: z.enum(['customer', 'professional']).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  city: z.string().optional(),
});

r.post('/verify', otpLimiter, async (req, res) => {
  const body = verifySchema.parse(req.body);
  let user = await User.findOne({ phone: body.phone }).select('+otp.hash +otp.expiresAt +otp.attempts');

  if (user) {
    if (!user.otp?.hash || user.otp.expiresAt < new Date()) throw unauthorized('The code has expired. Request a new one.');
    if (user.otp.attempts >= 5) throw unauthorized('Too many wrong attempts. Request a new code.');
    if (user.otp.hash !== hash(`${body.phone}:${body.otp}`)) {
      await User.updateOne({ _id: user._id }, { $inc: { 'otp.attempts': 1 } });
      throw unauthorized('That code is not right');
    }
    await User.updateOne({ _id: user._id }, { $unset: { otp: 1 }, $set: { lastLoginAt: new Date() } });
  } else {
    const p = pending.get(body.phone);
    if (!p || p.expiresAt < Date.now()) throw unauthorized('The code has expired. Request a new one.');
    if (p.hash !== hash(`${body.phone}:${body.otp}`)) {
      p.attempts += 1;
      if (p.attempts >= 5) pending.delete(body.phone);
      throw unauthorized('That code is not right');
    }
    if (!body.role || !body.name) throw badRequest('Tell us your name and how you will use Harmonia', { needsProfile: true });
    pending.delete(body.phone);
    const community = await Community.findOne({ stage: { $in: ['live', 'contracted', 'panel_ready', 'signed'] } }).sort({ createdAt: 1 });
    user = await User.create({
      phone: body.phone, name: body.name, role: body.role, lastLoginAt: new Date(), community: community?._id,
      consents: [{ purpose: 'service_delivery', grantedAt: new Date() }],
    });
    if (body.role === 'professional') {
      await Professional.create({
        user: user._id, harmoniaId: await issueHarmoniaId(body.city || 'Bengaluru'), displayName: body.name, homeCity: body.city || 'Bengaluru',
        community: community?._id, baseLocation: community?.location, location: community?.location,
      });
    }
    audit({ actor: user._id, actorRole: user.role, action: 'user.registered', entity: 'User', entityId: user._id });
  }

  user = await User.findById(user._id);
  const pro = user.role === 'professional' ? await Professional.findOne({ user: user._id }) : null;
  res.json({ token: signToken(user), user: user.toSafeJSON(), pro });
});

r.get('/me', authenticate, async (req, res) => {
  const community = req.user.community ? await Community.findById(req.user.community).lean() : null;
  res.json({ user: req.user.toSafeJSON(), pro: req.pro, community });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['female', 'male', 'other', 'undisclosed']).optional(),
  language: z.enum(['en', 'hi', 'kn', 'ta']).optional(),
  community: z.string().optional(),
});

r.patch('/me', authenticate, async (req, res) => {
  const body = profileSchema.parse(req.body);
  req.user.set(body);
  await req.user.save();
  if (req.pro && (body.gender || body.name)) {
    await Professional.updateOne({ _id: req.pro._id }, { $set: { ...(body.gender && { gender: body.gender }), ...(body.name && { displayName: body.name }) } });
  }
  res.json({ user: req.user.toSafeJSON() });
});

// DPDP — consent granted and withdrawn with equal ease.
r.post('/consents', authenticate, async (req, res) => {
  const { purpose, granted } = z.object({ purpose: z.enum(['location', 'home_record', 'marketing_harmonia', 'contacts_import']), granted: z.boolean() }).parse(req.body);
  const list = req.user.consents.filter((c) => c.purpose !== purpose);
  list.push({ purpose, grantedAt: granted ? new Date() : undefined, withdrawnAt: granted ? undefined : new Date() });
  req.user.consents = list;
  await req.user.save();
  audit({ actor: req.user._id, actorRole: req.user.role, action: `consent.${granted ? 'granted' : 'withdrawn'}`, entity: 'User', entityId: req.user._id, data: { purpose } });
  res.json({ consents: req.user.consents });
});

export default r;
