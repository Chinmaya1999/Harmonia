import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { getSocket } from '../lib/socket.js';
import { useAuth } from './AuthContext.jsx';

const ToastCtx = createContext(() => {});
const ICONS = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((input) => {
    const t = typeof input === 'string' ? { title: input } : input;
    const id = ++idRef.current;
    setToasts((list) => [...list.slice(-3), { id, tone: 'info', ...t }]);
    setTimeout(() => dismiss(id), t.duration || 5000);
  }, [dismiss]);

  // Server-pushed notifications (offer accepted, dispute decided, …)
  useEffect(() => {
    if (!user) return undefined;
    const s = getSocket();
    if (!s) return undefined;
    const onNotify = (n) => toast({ title: n.title, body: n.body, tone: n.tone === 'warning' ? 'warning' : n.tone === 'success' ? 'success' : 'info', link: n.link });
    s.on('notify', onNotify);
    return () => s.off('notify', onNotify);
  }, [user, toast]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={`toast ${t.tone}`} onClick={() => { if (t.link) navigate(t.link); dismiss(t.id); }} style={{ cursor: t.link ? 'pointer' : 'default' }}>
              <Icon size={18} style={{ flex: 'none', marginTop: 1 }} />
              <div className="grow">
                <div className="t">{t.title}</div>
                {t.body && <div className="b">{t.body}</div>}
              </div>
              <button className="btn ghost icon sm" style={{ width: 28, minHeight: 28 }} onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} aria-label="Dismiss"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
