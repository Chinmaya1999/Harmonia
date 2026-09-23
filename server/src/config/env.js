import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const env = {
  port: Number(process.env.PORT) || 5050,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/harmonia',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5050',
  isProd: process.env.NODE_ENV === 'production',
  uploadDir: path.join(root, 'uploads'),
};

if (env.isProd && env.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
