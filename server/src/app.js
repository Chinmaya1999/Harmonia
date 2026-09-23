import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { Professional } from './models/index.js';
import { TIERS } from './config/constants.js';
import { authenticate } from './middleware/auth.js';
import { upload, describeFiles } from './middleware/upload.js';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import catalogueRoutes from './routes/catalogue.js';
import customerRoutes from './routes/customer.js';
import jobRoutes from './routes/jobs.js';
import proRoutes from './routes/pro.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  if (!env.isProd) app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date() }));
  app.use('/uploads', express.static(env.uploadDir, { maxAge: '30d', immutable: true }));

  app.post('/api/uploads', authenticate, upload.array('files', 6), async (req, res) => {
    res.status(201).json(await describeFiles(req.files));
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/catalogue', catalogueRoutes);
  app.use('/api/me', customerRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/pro', proRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }));

  // SKP-04 — a link pasted into WhatsApp must render a proper preview, which a
  // client-rendered SPA cannot do. This page carries Open Graph tags and then
  // forwards people to the live profile.
  app.get('/share/p/:hid', async (req, res) => {
    const pro = await Professional.findOne({ harmoniaId: req.params.hid.toUpperCase() }).lean();
    const target = `${env.clientUrl}/p/${encodeURIComponent(req.params.hid.toUpperCase())}`;
    if (!pro) return res.redirect(target);
    const title = `${pro.displayName} · ${TIERS[pro.tier]?.name} · Harmonia`;
    const desc = `${pro.stats?.jobsCompleted || 0} verified jobs${pro.stats?.ratingAvg ? ` · ${pro.stats.ratingAvg}★` : ''} · Harmonia ID ${pro.harmoniaId}. Verified identity and work history.`;
    const img = pro.photoUrl ? `${env.publicUrl}${pro.photoUrl}` : '';
    res.set('Content-Type', 'text/html').send(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}<meta property="og:url" content="${esc(target)}"><meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">${esc(title)}</a></body></html>`);
  });

  // In production the built client is served by the same process.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
