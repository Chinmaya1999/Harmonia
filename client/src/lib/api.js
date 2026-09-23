const TOKEN_KEY = 'harmonia.token';

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Request failed');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, body, { raw = false } = {}) {
  const token = tokenStore.get();
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (raw) return res;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
  raw: (m, p) => request(m, p, undefined, { raw: true }),
  async upload(files) {
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    return request('POST', '/uploads', fd);
  },
  async download(path, filename) {
    const res = await request('GET', path, undefined, { raw: true });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
