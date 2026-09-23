import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useToast } from '../context/ToastContext.jsx';

export function useFetch(path, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled && !!path });
  const live = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!path || !enabled) return null;
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api.get(path);
      if (live.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (live.current) setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, [path, enabled]);

  useEffect(() => {
    live.current = true;
    load();
    return () => { live.current = false; };
  }, [load]);

  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

// Wrap a mutation: busy flag, toast on error, optional success toast.
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = useCallback(async (key, fn, { success } = {}) => {
    setBusy(key);
    try {
      const out = await fn();
      if (success) toast({ title: success, tone: 'success' });
      return out;
    } catch (err) {
      toast({ title: err.message || 'Something went wrong', tone: 'error' });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return { busy, run };
}

// A job, kept live: refetches whenever the server says it changed.
export function useLiveJob(id) {
  const q = useFetch(id ? `/jobs/${id}` : null);
  const { reload } = q;
  useEffect(() => {
    if (!id) return undefined;
    const s = getSocket();
    if (!s) return undefined;
    const watch = () => s.emit('job:watch', id);
    watch();
    s.on('connect', watch);
    const onUpdate = (p) => { if (p.jobId === id) reload({ silent: true }); };
    s.on('job:update', onUpdate);
    // Safety net if a socket event is missed (mobile networks).
    const poll = setInterval(() => reload({ silent: true }), 15000);
    return () => {
      s.emit('job:unwatch', id);
      s.off('connect', watch);
      s.off('job:update', onUpdate);
      clearInterval(poll);
    };
  }, [id, reload]);
  return q;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const fn = (p) => ref.current(p);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}
