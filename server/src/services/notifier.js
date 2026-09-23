// Thin wrapper over Socket.IO so services never import the server.
let io = null;

export function attachIo(instance) {
  io = instance;
}

export function toUser(userId, event, payload) {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}

export function toJob(jobId, event, payload) {
  if (io && jobId) io.to(`job:${jobId}`).emit(event, payload);
}

export function toOps(event, payload) {
  if (io) io.to('ops').emit(event, payload);
}

// Clients refetch the job on this event; keeps one source of truth (the API).
export function jobChanged(job, extra = {}) {
  const payload = { jobId: String(job._id), state: job.state, ...extra };
  toJob(job._id, 'job:update', payload);
  toUser(job.customer, 'job:update', payload);
  toOps('job:update', payload);
}

export function notify(userId, { title, body, link, tone = 'info' }) {
  toUser(userId, 'notify', { title, body, link, tone, at: new Date().toISOString() });
}
