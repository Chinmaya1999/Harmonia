import { cloneElement, isValidElement, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Inbox, Info } from 'lucide-react';
import { money } from '../lib/format.js';

export function Button({ variant, size, block, loading, icon: Icon, children, className = '', ...rest }) {
  const cls = ['btn', variant, size, block && 'block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 className="spin" size={16} /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function Card({ as: As = 'div', pad = true, className = '', children, ...rest }) {
  return <As className={['card', pad === 'lg' ? 'pad-lg' : pad ? 'pad' : '', className].filter(Boolean).join(' ')} {...rest}>{children}</As>;
}

export function Badge({ tone = '', children, className = '', ...rest }) {
  return <span className={`badge ${tone} ${className}`} {...rest}>{children}</span>;
}

export function Field({ label, hint, error, children }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { id: children.props.id || id }) : children;
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {child}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export const Input = (p) => <input className={`input ${p.className || ''}`} {...p} />;
export const Textarea = (p) => <textarea className="textarea" {...p} />;
export function Select({ options, ...rest }) {
  return (
    <select className="select" {...rest}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function MoneyInput({ value, onChange, ...rest }) {
  return (
    <div className="input-group">
      <span className="prefix">₹</span>
      <input className="input num" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} {...rest} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 style={{ fontSize: 20 }}>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="empty" aria-busy="true">
      <Loader2 className="spin" size={26} />
      <div className="small" style={{ marginTop: 8 }}>{label}</div>
    </div>
  );
}

export function Skeleton({ h = 18, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon size={24} /></div>
      <div className="strong" style={{ color: 'var(--ink)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 4, maxWidth: 420, marginInline: 'auto' }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Card className="danger">
      <div className="row between wrap">
        <div><div className="strong">Could not load this</div><div className="small muted">{error?.message}</div></div>
        {onRetry && <Button size="sm" onClick={() => onRetry()}>Try again</Button>}
      </div>
    </Card>
  );
}

export function Callout({ tone = '', icon: Icon = Info, children }) {
  return <div className={`callout ${tone}`}><Icon size={18} /><div>{children}</div></div>;
}

export function Stat({ label, value, sub, tone }) {
  return (
    <Card pad={false} className="stat">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </Card>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Choice({ on, onClick, title, children, right }) {
  return (
    <button type="button" className={`choice ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="radio" />
      <span className="grow">
        <span className="strong" style={{ display: 'block' }}>{title}</span>
        {children && <span className="small muted" style={{ display: 'block', marginTop: 2 }}>{children}</span>}
      </span>
      {right}
    </button>
  );
}

export const Money = ({ value, exact }) => <span className="num">{money(value, { exact })}</span>;

export function Meter({ value, max = 100, tone }) {
  return <div className={`meter ${tone || ''}`}><span style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div>;
}
