import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { env } from '../config/env.js';
import { badRequest } from '../lib/errors.js';

fs.mkdirSync(env.uploadDir, { recursive: true });
const name = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 20);
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

export const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${name()}${ALLOWED[file.mimetype] || ''}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(badRequest('Only JPG, PNG, WEBP or PDF files'))),
});

// Hash each stored file — the hash travels with every reference to it, so the
// dispute file can prove a photo has not been swapped.
export async function describeFiles(files = []) {
  return Promise.all(
    files.map(async (f) => {
      const buf = await fs.promises.readFile(f.path);
      return { url: `/uploads/${path.basename(f.path)}`, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: f.size, type: f.mimetype };
    }),
  );
}

export async function verifyFileHash(url, sha256) {
  try {
    const buf = await fs.promises.readFile(path.join(env.uploadDir, path.basename(url)));
    return crypto.createHash('sha256').update(buf).digest('hex') === sha256;
  } catch {
    return false;
  }
}
