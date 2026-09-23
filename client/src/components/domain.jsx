import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Droplet, Wind, Hammer, Sparkles, BookOpen, Laptop, Wrench, Check, Star, Camera, Loader2, Home as HomeIcon, Send, ShieldCheck, MapPin, Briefcase, Heart,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { money, initials, STATE_LABEL, STATE_TONE, time, ago } from '../lib/format.js';
import { Badge } from './ui.jsx';
import { useNow } from '../hooks/useApi.js';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../lib/socket.js';
import { catImg } from '../lib/media.js';

const CAT_ICONS = { zap: Zap, droplet: Droplet, wind: Wind, hammer: Hammer, sparkles: Sparkles, 'book-open': BookOpen, laptop: Laptop };
const CODE_ICONS = { ELEC: Zap, PLMB: Droplet, ACRP: Wind, CARP: Hammer, DCLN: Sparkles, TUTR: BookOpen, ITSP: Laptop };

export function CategoryIcon({ icon, code, size = 22, lg, photo }) {
  const Icon = CAT_ICONS[icon] || CODE_ICONS[code] || Wrench;
  if (photo && code) return <span className={`cat-icon ${lg ? 'lg' : ''}`}><img src={catImg(code)} alt="" loading="lazy" /></span>;
  return <span className={`cat-icon ${lg ? 'lg' : ''}`}><Icon size={size} /></span>;
}

// Photo card for a bookable service (category or job type).
export function ServiceCard({ to, code, title, sub, price, badge, meta, img }) {
  return (
    <Link to={to} className="svc-card">
      <div className="img">
        <img src={img || catImg(code)} alt="" loading="lazy" />
        {badge && <span className="badge light">{badge}</span>}
      </div>
      <div className="body">
        <div className="strong" style={{ fontSize: 15 }}>{title}</div>
        {sub && <div className="tiny muted">{sub}</div>}
        <div className="row between" style={{ marginTop: 'auto', paddingTop: 8 }}>
          <span className="strong num">{price}</span>
          {meta && <span className="rating-pill">{meta}</span>}
        </div>
      </div>
    </Link>
  );
}

export function Avatar({ name, src, size = '' }) {
  return <span className={`avatar ${size}`}>{src ? <img src={src} alt="" /> : initials(name)}</span>;
}

const TIER_NAMES = ['Registered', 'Identity Verified', 'Background Verified', 'Skill Verified', 'Licence Verified', 'Harmonia Elite'];
const TIER_EXPLAIN = [
  'Phone confirmed. Not yet able to take jobs.',
  'PAN, DigiLocker identity, address and bank name match verified.',
  'Police verification through an empanelled agency and two work references.',
  'Practical assessment or a verified ITI / NCVET / NSDC certificate.',
  'Licence verified against the professional register.',
  'Earned through performance: high ratings, volume and low rework.',
];

// VER-01 — graded tier on every card, with a plain-language explanation.
export function TierBadge({ tier = 0, compact }) {
  return (
    <span className={`tier t${tier}`} title={`Tier ${tier} · ${TIER_NAMES[tier]} — ${TIER_EXPLAIN[tier]}`} aria-label={`Verification tier ${tier}: ${TIER_NAMES[tier]}`}>
      <span className="pips">{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= tier ? 'on' : ''} />)}</span>
      {!compact && TIER_NAMES[tier]}
    </span>
  );
}
TierBadge.names = TIER_NAMES;
TierBadge.explain = TIER_EXPLAIN;

export function StateBadge({ state }) {
  const live = ['DISPATCHING', 'EN_ROUTE', 'IN_PROGRESS'].includes(state);
  return <Badge tone={STATE_TONE[state]}>{live && <span className="dot live" />}{STATE_LABEL[state] || state}</Badge>;
}

export function Rating({ value, count }) {
  if (value == null) return <span className="small muted">New</span>;
  return (
    <span className="row" style={{ '--gap': '4px', display: 'inline-flex' }}>
      <Star size={14} fill="var(--accent)" color="var(--accent)" />
      <span className="strong num">{Number(value).toFixed(1)}</span>
      {count != null && <span className="small muted">({count})</span>}
    </span>
  );
}

export function ScoreRing({ value, size = 96, label = 'Score' }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  const color = v >= 85 ? 'var(--tier-5)' : v >= 70 ? 'var(--brand-2)' : v >= 55 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-2)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value == null ? 'var(--line-2)' : color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="v"><b>{value ?? '—'}</b><small>{label}</small></div>
    </div>
  );
}

export function StarInput({ value, onChange, label }) {
  return (
    <div className="row between">
      <span className="small strong">{label}</span>
      <span className="stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" className={i <= value ? 'on' : ''} onClick={() => onChange(i)} aria-label={`${i} star${i > 1 ? 's' : ''}`} aria-checked={value === i} role="radio">
            <Star size={24} fill={i <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </span>
    </div>
  );
}

const STEPS = [
  { key: 'DISPATCHING', label: 'Matching' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'EN_ROUTE', label: 'On the way' },
  { key: 'ARRIVED', label: 'Arrived' },
  { key: 'IN_PROGRESS', label: 'Working' },
  { key: 'WORK_COMPLETE', label: 'Done' },
  { key: 'PAID', label: 'Paid' },
];
const ORDER = { CREATED: 0, DISPATCHING: 0, REASSIGNED: 0, ASSIGNED: 1, EN_ROUTE: 2, ARRIVED: 3, IN_PROGRESS: 4, SCOPE_REVISED: 4, WORK_COMPLETE: 5, CUSTOMER_CONFIRMED: 5, PAID: 6, CLOSED: 7, DISPUTED: 5 };

export function JobStepper({ state }) {
  const idx = ORDER[state] ?? 0;
  return (
    <div className="stepper" aria-label={`Progress: ${STATE_LABEL[state]}`}>
      {STEPS.map((s, i) => (
        <div key={s.key} className={`step ${i < idx || state === 'CLOSED' ? 'done' : i === idx ? 'current' : ''}`}>
          <span className="bullet">{(i < idx || state === 'CLOSED') && <Check size={13} strokeWidth={3} />}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// DSP-01 — live dispatch state, never a static spinner.
export function DispatchRadar({ wave }) {
  const rings = [{ i: '38%', w: 0 }, { i: '24%', w: 1 }, { i: '12%', w: 2 }, { i: '0%', w: 3 }];
  return (
    <div className="radar" aria-hidden="true">
      {rings.map((r) => <div key={r.w} className={`ring ${wave >= r.w ? 'on' : ''}`} style={{ '--i': r.i }} />)}
      <div className="sweep" />
      <div className="home"><HomeIcon size={18} /></div>
    </div>
  );
}

export function Countdown({ to, total }) {
  const now = useNow(1000);
  const left = Math.max(0, Math.round((new Date(to) - now) / 1000));
  const pct = total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  return (
    <div className="stack" style={{ '--gap': '4px' }}>
      <span className="countdown">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      {total && <div className="countdown-bar"><span style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

export function PhotoUploader({ photos = [], onAdd, max = 6, label = 'Add photo', disabled }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (e) => {
    const files = [...e.target.files].slice(0, max - photos.length);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = await api.upload(files);
      await onAdd(uploaded);
    } catch (err) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="photo-grid">
      {photos.map((p) => <a key={p.url} className="ph" href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" loading="lazy" /></a>)}
      {photos.length < max && !disabled && (
        <button type="button" className="ph add" onClick={() => ref.current?.click()} disabled={busy} aria-label={label}>
          {busy ? <Loader2 className="spin" size={20} /> : <span className="stack center" style={{ '--gap': '4px', alignItems: 'center' }}><Camera size={20} /><span className="tiny">{label}</span></span>}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden onChange={pick} />
    </div>
  );
}

export function ProCard({ pro, to, action, footer }) {
  const body = (
    <div className="row top" style={{ '--gap': '14px' }}>
      <Avatar name={pro.displayName} src={pro.photoUrl} size="lg" />
      <div className="grow stack" style={{ '--gap': '6px' }}>
        <div className="row between top">
          <div>
            <div className="strong" style={{ fontSize: 16 }}>{pro.displayName}</div>
            <div className="tiny muted mono">{pro.harmoniaId}</div>
          </div>
          {pro.status && <AvailabilityDot status={pro.status} />}
        </div>
        <div className="row wrap" style={{ '--gap': '8px' }}>
          <TierBadge tier={pro.tier} />
          {pro.score != null && <Badge tone="brand">Score {pro.score}</Badge>}
        </div>
        <div className="row wrap small muted" style={{ '--gap': '12px' }}>
          <Rating value={pro.ratingAvg} count={pro.ratingCount} />
          <span className="row" style={{ '--gap': '4px' }}><Briefcase size={13} />{pro.jobsCompleted} verified jobs</span>
          {pro.distanceKm != null && <span className="row" style={{ '--gap': '4px' }}><MapPin size={13} />~{pro.distanceKm} km</span>}
          {pro.preferredBy > 0 && <span className="row" style={{ '--gap': '4px' }}><Heart size={13} />{pro.preferredBy} households</span>}
        </div>
        {footer}
      </div>
      {action}
    </div>
  );
  return to ? <Link to={to} className="card pad hover">{body}</Link> : <div className="card pad">{body}</div>;
}

export function AvailabilityDot({ status }) {
  const map = { available: ['success', 'Available now'], window: ['info', 'Available later today'], busy: ['warning', 'On a job'], offline: ['', 'Offline'] };
  const [tone, label] = map[status] || map.offline;
  return <Badge tone={tone}><span className={`dot ${status === 'available' ? 'live' : ''}`} />{label}</Badge>;
}

// PRC-04 / PRC-06 — every rupee accounted for.
export function PriceBreakdown({ price, split, priorityTip = 0, forPro }) {
  if (!price && !split) return null;
  return (
    <dl className="kv">
      {price && <>
        {price.visit > 0 && <><dt>Visit charge</dt><dd>{money(price.visit)}</dd></>}
        <dt>Labour</dt><dd>{money(price.labour)}</dd>
        {(price.parts || []).map((p, i) => <Fragment key={i}><dt>{p.name}{p.qty > 1 ? ` × ${p.qty}` : ''}</dt><dd>{money(p.qty * p.unitPrice)}</dd></Fragment>)}
        {priorityTip > 0 && <><dt>Priority tip (100% to professional)</dt><dd>{money(priorityTip)}</dd></>}
        <dt className="total">{forPro ? 'Customer pays' : 'Total, taxes included'}</dt><dd className="total">{money(price.total + priorityTip)}</dd>
      </>}
      {forPro && split && <>
        <dt>Platform fee ({(split.commissionBps / 100).toFixed(0)}% of visit + labour){split.feeHoliday ? ' — fee holiday' : ''}</dt><dd>−{money(split.platformFee, { exact: true })}</dd>
        <dt>TDS (194-O)</dt><dd>−{money(split.tds, { exact: true })}</dd>
        <dt>Welfare fee</dt><dd className="small muted">paid by Harmonia</dd>
        <dt className="total">You receive</dt><dd className="total" style={{ color: 'var(--success)' }}>{money(split.proReceives ?? split.netToPro + (split.priorityTip || 0), { exact: true })}</dd>
      </>}
    </dl>
  );
}

export function Chat({ jobId, meId, disabled }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef();
  const toast = useToast();
  useEffect(() => {
    let live = true;
    api.get(`/jobs/${jobId}/messages`).then((m) => live && setMsgs(m)).catch(() => {});
    const s = getSocket();
    const on = (m) => { if (String(m.job) === String(jobId)) setMsgs((x) => (x.some((y) => y._id === m._id) ? x : [...x, m])); };
    s?.on('chat:message', on);
    return () => { live = false; s?.off('chat:message', on); };
  }, [jobId]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const m = await api.post(`/jobs/${jobId}/messages`, { text });
      setMsgs((x) => (x.some((y) => y._id === m._id) ? x : [...x, m]));
      setText('');
      if (m.redacted) toast({ title: 'Contact details were hidden', body: 'Use in-app chat or masked calling — it keeps you both protected.', tone: 'warning' });
    } catch (err) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chat">
      <div className="msgs" ref={box}>
        {!msgs.length && <div className="small muted center" style={{ margin: 'auto' }}>Messages are kept with the job as a record for both of you.</div>}
        {msgs.map((m) => (
          <div key={m._id} className={`msg ${String(m.from) === String(meId) ? 'me' : ''}`}>
            {m.text}
            <div className="at">{time(m.createdAt)}</div>
          </div>
        ))}
      </div>
      {!disabled && (
        <form onSubmit={send}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={1000} aria-label="Message" />
          <button className="btn primary icon" disabled={busy} aria-label="Send"><Send size={17} /></button>
        </form>
      )}
    </div>
  );
}

export function Timeline({ events }) {
  return (
    <div className="timeline">
      {[...events].reverse().map((e, i) => (
        <div key={i} className={`ev ${e.state === 'EVENT' ? 'event' : ''}`}>
          <div className="small strong">{e.state === 'EVENT' ? e.note : STATE_LABEL[e.state] || e.state}</div>
          <div className="tiny muted">{time(e.at)} · {ago(e.at)}{e.state !== 'EVENT' && e.note ? ` · ${e.note}` : ''}</div>
        </div>
      ))}
    </div>
  );
}

export function AssuranceStrip() {
  return (
    <div className="row wrap small" style={{ '--gap': '14px', color: 'var(--ink-2)' }}>
      <span className="row" style={{ '--gap': '6px' }}><ShieldCheck size={15} color="var(--success)" />Payment held until you confirm</span>
      <span className="row" style={{ '--gap': '6px' }}><ShieldCheck size={15} color="var(--success)" />30-day workmanship warranty</span>
      <span className="row" style={{ '--gap': '6px' }}><ShieldCheck size={15} color="var(--success)" />Free replacement on no-show</span>
    </div>
  );
}
