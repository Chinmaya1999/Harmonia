import http from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { verifyToken } from './middleware/auth.js';
import { attachIo } from './services/notifier.js';
import { startSweeper } from './services/sweeper.js';
import { Job, Professional, User } from './models/index.js';

async function main() {
  await mongoose.connect(env.mongoUri);
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  console.log(`[db] connected ${env.mongoUri}`);

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: env.clientUrl, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      const user = await User.findById(payload.sub).select('role').lean();
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === 'admin') socket.join('ops');

    // Join a job room only if this user is a party to the job.
    socket.on('job:watch', async (jobId, ack) => {
      try {
        const job = await Job.findById(jobId).select('customer professional').lean();
        if (!job) return ack?.({ ok: false });
        let allowed = socket.data.role === 'admin' || String(job.customer) === socket.data.userId;
        if (!allowed && socket.data.role === 'professional' && job.professional) {
          const pro = await Professional.findById(job.professional).select('user').lean();
          allowed = String(pro?.user) === socket.data.userId;
        }
        if (allowed) socket.join(`job:${jobId}`);
        return ack?.({ ok: allowed });
      } catch {
        return ack?.({ ok: false });
      }
    });
    socket.on('job:unwatch', (jobId) => socket.leave(`job:${jobId}`));
  });

  attachIo(io);
  const stopSweeper = startSweeper();

  server.listen(env.port, () => console.log(`[api] http://localhost:${env.port}`));

  const shutdown = async () => {
    stopSweeper();
    io.close();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
