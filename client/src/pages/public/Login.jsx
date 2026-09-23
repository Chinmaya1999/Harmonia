import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Wrench, ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, homePathFor } from '../../context/AuthContext.jsx';
import { Button, Card, Field, Input, Choice, Callout } from '../../components/ui.jsx';
import { SCENES, catImg } from '../../lib/media.js';
import { ShieldCheck, Star } from 'lucide-react';

const DEMO = [
  { phone: '9000000001', label: 'Ananya — customer' },
  { phone: '9000000002', label: 'Rahul — customer (open dispute)' },
  { phone: '9100000001', label: 'Ravi — electrician' },
  { phone: '9100000002', label: 'Venkatesh — plumber' },
  { phone: '9000000000', label: 'Aisha — operations' },
];

function OtpInput({ value, onChange }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const set = (i, ch) => {
    const next = digits.slice();
    next[i] = ch;
    onChange(next.join('').slice(0, 6));
  };
  return (
    <div className="otp" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(5, t.length)]?.focus(); } }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={d} aria-label={`Digit ${i + 1}`}
          onChange={(e) => { const ch = e.target.value.replace(/\D/g, '').slice(-1); set(i, ch); if (ch) refs.current[i + 1]?.focus(); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d) refs.current[i - 1]?.focus(); }} />
      ))}
    </div>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [role, setRole] = useState(params.get('as') === 'professional' ? 'professional' : 'customer');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate(params.get('next') || homePathFor(user.role), { replace: true }); }, [user, navigate, params]);

  const requestOtp = async (e, p = phone) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.post('/auth/otp', { phone: p });
      setIsNew(r.isNew);
      setDevOtp(r.devOtp || null);
      if (r.devOtp) setOtp(r.devOtp);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setError('');
    if (isNew && step === 'otp') { setStep('profile'); return; }
    setBusy(true);
    try {
      const body = { phone, otp, ...(isNew ? { role, name } : {}) };
      const r = await api.post('/auth/verify', body);
      const me = await signIn(r.token);
      navigate(params.get('next') || homePathFor(me?.user?.role), { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.details?.needsProfile) setStep('profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-art">
        <img src={role === 'professional' ? catImg('CARP') : SCENES.customer} alt="" />
        <div className="stack" style={{ '--gap': '14px', maxWidth: 460 }}>
          <span className="badge light" style={{ alignSelf: 'flex-start' }}><ShieldCheck size={12} />{role === 'professional' ? 'Paid the same day, every job' : 'Verified professionals only'}</span>
          <h2>{role === 'professional' ? 'Your skill. Your reputation. Your future.' : 'Your home. Your professionals. One trusted network.'}</h2>
          <div className="glass" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--ink)', animation: 'float 7s ease-in-out infinite' }}>
            <span className="avatar"><img src={catImg('ELEC')} alt="" /></span>
            <div className="grow"><div className="strong small">“Arrived on time and fixed it in one visit.”</div><div className="tiny muted">Customer review · Electrical repair</div></div>
            <span className="row small strong" style={{ '--gap': '4px' }}><Star size={14} fill="#e08a0b" color="#e08a0b" />5.0</span>
          </div>
        </div>
      </div>
      <div className="auth-form">
      <Card pad="lg" style={{ width: '100%', maxWidth: 440, border: 0, boxShadow: 'none' }}>
        {step !== 'phone' && <button className="back btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => { setStep(step === 'profile' ? 'otp' : 'phone'); setError(''); }}><ArrowLeft size={15} /> Back</button>}
        {step === 'phone' && (
          <form onSubmit={requestOtp} className="stack" style={{ '--gap': '18px' }}>
            <div>
              <h1 style={{ fontSize: 28 }}>Sign in to Harmonia</h1>
              <p className="muted" style={{ marginTop: 6 }}>One number for everything. We will send a 6-digit code.</p>
            </div>
            <Field label="Mobile number" error={error}>
              <div className="input-group">
                <span className="prefix">+91</span>
                <input className="input lg num" inputMode="numeric" autoFocus value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" aria-label="Mobile number" />
              </div>
            </Field>
            <Button variant="primary" size="lg" block loading={busy} disabled={phone.length !== 10}>Send code</Button>
            <div className="stack" style={{ '--gap': '8px' }}>
              <h4>Demo accounts</h4>
              <div className="pill-list">
                {DEMO.map((d) => <button type="button" key={d.phone} className="badge outline" style={{ cursor: 'pointer', padding: '6px 10px' }} onClick={() => { setPhone(d.phone); requestOtp(null, d.phone); }}>{d.label}</button>)}
              </div>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verify} className="stack" style={{ '--gap': '18px' }}>
            <div>
              <h1 style={{ fontSize: 26 }}>Enter the code</h1>
              <p className="muted" style={{ marginTop: 6 }}>Sent to +91 {phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</p>
            </div>
            {devOtp && <Callout tone="brand" icon={KeyRound}>Development mode — your code is <strong className="mono">{devOtp}</strong> and has been filled in.</Callout>}
            <OtpInput value={otp} onChange={setOtp} />
            {error && <div className="small" style={{ color: 'var(--danger)' }}>{error}</div>}
            <Button variant="primary" size="lg" block loading={busy} disabled={otp.length !== 6}>{isNew ? 'Continue' : 'Sign in'}</Button>
            <button type="button" className="btn ghost sm" onClick={requestOtp}>Resend code</button>
          </form>
        )}

        {step === 'profile' && (
          <form onSubmit={verify} className="stack" style={{ '--gap': '18px' }}>
            <div>
              <h1 style={{ fontSize: 26 }}>Welcome to Harmonia</h1>
              <p className="muted" style={{ marginTop: 6 }}>Tell us who you are.</p>
            </div>
            <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Full name" /></Field>
            <div className="stack" style={{ '--gap': '8px' }}>
              <span className="label">I want to…</span>
              <Choice on={role === 'customer'} onClick={() => setRole('customer')} title={<span className="row" style={{ '--gap': '8px' }}><Home size={16} />Get work done at home</span>}>Book verified professionals, keep your home's record.</Choice>
              <Choice on={role === 'professional'} onClick={() => setRole('professional')} title={<span className="row" style={{ '--gap': '8px' }}><Wrench size={16} />Work as a professional</span>}>Get a permanent Harmonia ID and a verified work record you own.</Choice>
            </div>
            {error && <div className="small" style={{ color: 'var(--danger)' }}>{error}</div>}
            <Button variant="primary" size="lg" block loading={busy} disabled={name.trim().length < 2}>Create my account</Button>
            <p className="tiny muted">By continuing you agree to Harmonia processing your data to deliver the service. You can see, export or withdraw consent any time.</p>
          </form>
        )}
      </Card>
      </div>
    </div>
  );
}
