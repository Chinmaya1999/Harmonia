import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Power, Clock, CircleDot, MapPin, Timer, IndianRupee, Star, ShieldAlert, ChevronRight, HeartHandshake, UserRound, ShieldCheck, BellRing } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch, useAction, useSocketEvent } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Modal, Field, Input, Empty, Callout, Stat } from '../../components/ui.jsx';
import { Countdown, TierBadge, ScoreRing, StateBadge, CategoryIcon } from '../../components/domain.jsx';
import { money, dateTime, time } from '../../lib/format.js';
import { catImg, SCENES } from '../../lib/media.js';

// Audible alert for new offers — the pro may be on a ladder, not looking.
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch { /* audio not available */ }
}

// AVL-07 — send location only on significant movement while available.
function useLocationSharing(enabled) {
  const last = useRef(null);
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition((p) => {
      const { latitude: lat, longitude: lng } = p.coords;
      const prev = last.current;
      const moved = !prev || Math.hypot((lat - prev.lat) * 111, (lng - prev.lng) * 108) > 0.2;
      if (moved) { last.current = { lat, lng }; api.post('/pro/location', { lat, lng }).catch(() => {}); }
    }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
}

function OfferCard({ o, t, onAccept, onDecline, busy }) {
  const total = Math.max(1, Math.round((new Date(o.expiresAt) - Date.now()) / 1000));
  return (
    <Card className="offer-card" pad={false}>
      <div style={{ height: 120, position: 'relative', overflow: 'hidden' }}>
        <img src={catImg(o.job.category)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.45))' }} />
        <span className="badge light" style={{ position: 'absolute', left: 14, bottom: 12 }}><span className="dot live" style={{ color: 'var(--danger)' }} />Live offer</span>
      </div>
      <div className="card-body">
      <div className="row between top">
        <div className="row">
          <CategoryIcon code={o.job.category} lg />
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>{o.job.route === 'warranty' ? 'Warranty visit' : o.job.route === 'named' ? 'Requested you by name' : t('newJob')}</div>
            <div className="strong" style={{ fontSize: 17 }}>{o.job.categoryName}</div>
            <div className="small muted">{o.job.jobType?.name}</div>
          </div>
        </div>
        <Countdown to={o.expiresAt} total={Math.min(total, 60)} />
      </div>
      <div className="grid grid-3" style={{ marginTop: 14, '--gap': '10px' }}>
        <div className="card soft pad center"><div className="tiny muted">{t('youEarn')}</div><div className="display" style={{ fontSize: 26, color: 'var(--success)' }}>{money(o.expectedEarning)}</div>{o.job.priorityTip > 0 && <div className="tiny" style={{ color: 'var(--accent)' }}>incl. {money(o.job.priorityTip)} tip</div>}</div>
        <div className="card soft pad center"><div className="tiny muted"><MapPin size={11} /> {t('away')}</div><div className="display" style={{ fontSize: 22 }}>{o.distanceKm != null ? `${o.distanceKm} km` : '—'}</div><div className="tiny muted">{o.travelMin ? `~${o.travelMin} ${t('minutes')}` : ''}</div></div>
        <div className="card soft pad center"><div className="tiny muted"><Timer size={11} /> Job</div><div className="display" style={{ fontSize: 22 }}>{o.job.jobType?.durationMin} {t('minutes')}</div><div className="tiny muted">{o.job.paymentMode === 'cash' ? 'Cash' : 'Online'}</div></div>
      </div>
      <div className="row wrap small muted" style={{ marginTop: 12, '--gap': '12px' }}>
        <span className="row" style={{ '--gap': '4px' }}><MapPin size={13} />{o.job.area?.block}, {o.job.area?.community}</span>
        <span className="row" style={{ '--gap': '4px' }}><UserRound size={13} />Customer {o.customerRating ? <><Star size={12} fill="var(--accent)" color="var(--accent)" />{o.customerRating.toFixed(1)}</> : 'new'}</span>
        {o.job.scheduledAt && <span className="row" style={{ '--gap': '4px' }}><Clock size={13} />{dateTime(o.job.scheduledAt)}</span>}
      </div>
      {o.job.description && <p className="small" style={{ marginTop: 8 }}>“{o.job.description}”</p>}
      {o.split && o.job.route !== 'warranty' && <p className="tiny muted" style={{ marginTop: 8 }}>Estimate at the rate card: customer pays {money(o.split.customerPays)} · platform fee {money(o.split.platformFee, { exact: true })} · TDS {money(o.split.tds, { exact: true })} · welfare fee paid by Harmonia.</p>}
      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Button size="lg" onClick={() => onDecline(o)} disabled={!!busy}>{t('decline')}</Button>
        <Button size="lg" variant="primary" loading={busy === o._id} onClick={() => onAccept(o)}>{t('accept')}</Button>
      </div>
      <p className="tiny muted center" style={{ marginTop: 8 }}>{t('declineNote')}</p>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { t, refresh } = useAuth();
  const navigate = useNavigate();
  const me = useFetch('/pro/me');
  const offers = useFetch('/pro/offers');
  const active = useFetch('/pro/active');
  const earnings = useFetch('/pro/earnings?days=1');
  const { busy, run } = useAction();
  const [windowOpen, setWindowOpen] = useState(false);
  const [win, setWin] = useState({ from: '', to: '' });

  const pro = me.data?.pro;
  const status = pro?.status;
  useLocationSharing(status === 'available' || status === 'window' || status === 'busy');

  const reloadAll = () => { offers.reload({ silent: true }); active.reload({ silent: true }); me.reload({ silent: true }); };
  useSocketEvent('offer:new', () => { chime(); offers.reload({ silent: true }); });
  useSocketEvent('offer:withdrawn', (p) => offers.setData((list) => (list || []).filter((o) => o._id !== p.offerId)));
  useSocketEvent('pro:status', () => me.reload({ silent: true }));
  useSocketEvent('job:update', () => active.reload({ silent: true }));

  const setStatus = async (next, extra = {}) => {
    const loc = await new Promise((res) => (next !== 'offline' && navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res(p.coords), () => res(null), { timeout: 5000 }) : res(null)));
    await run('status', () => api.post('/pro/status', { status: next, ...extra, ...(loc ? { lat: loc.latitude, lng: loc.longitude } : {}) }), { success: next === 'available' ? 'You are available — offers will appear here' : next === 'offline' ? 'You are offline' : 'Time window set' });
    me.reload({ silent: true });
    refresh();
  };

  const accept = async (o) => {
    const r = await run(o._id, () => api.post(`/pro/offers/${o._id}/accept`));
    if (r) navigate(`/pro/jobs/${r.jobId}`);
    else reloadAll();
  };
  const decline = async (o) => {
    await run('decline', () => api.post(`/pro/offers/${o._id}/decline`, { reason: 'busy' }));
    offers.setData((l) => (l || []).filter((x) => x._id !== o._id));
  };

  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = earnings.data?.daily?.find((d) => d.key === todayKey);
  const canWork = pro && pro.tier >= 1 && pro.skills?.some((s) => s.status === 'verified');

  return (
    <div className="container page">
      <div className="photo-hero" style={{ minHeight: 200, justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <img src={pro?.skills?.[0] ? catImg(pro.skills[0].category) : SCENES.room} alt="" />
        <div className="stack" style={{ '--gap': '8px' }}>
          <span className="badge light" style={{ alignSelf: 'flex-start' }}>{t('status')}</span>
          <h1>Namaste, {pro?.displayName?.split(' ')[0] || ''}</h1>
          <p className="row wrap" style={{ '--gap': '8px' }}><span className="mono">{pro?.harmoniaId}</span>{pro && <span className="badge light"><TierBadge tier={pro.tier} /></span>}</p>
        </div>
        {pro?.stats?.preferredBy > 0 && <span className="badge light"><HeartHandshake size={13} />In {pro.stats.preferredBy} households' teams</span>}
      </div>

      {pro?.suspended?.active && <Callout tone="danger" icon={ShieldAlert}>Your account is paused: {pro.suspended.reason}. Our team will contact you.</Callout>}
      {pro?.review?.flagged && <Callout tone="warning" icon={ShieldAlert}>{pro.review.reason} <Link to="/pro/passport">See your score and appeal →</Link></Callout>}
      {me.data && !canWork && (
        <Card className="info" style={{ marginBottom: 16 }}>
          <div className="row between wrap">
            <div><div className="strong">Finish verification to start receiving jobs</div><div className="small muted">Most professionals complete it in one sitting. Your Harmonia ID is already yours.</div></div>
            <Link to="/pro/verification" className="btn primary">Continue verification</Link>
          </div>
        </Card>
      )}
      {me.data?.cashCommissionOwed > 0 && <Callout icon={IndianRupee}>You owe {money(me.data.cashCommissionOwed, { exact: true })} in commission from cash jobs. It is deducted automatically from your next online payout.</Callout>}

      <div className="status-toggle" style={{ margin: '16px 0 20px' }} role="radiogroup" aria-label={t('status')}>
        {status === 'busy' ? (
          <button className="on available" style={{ gridColumn: '1 / -1' }} disabled><CircleDot size={22} />{t('busy')}</button>
        ) : <>
          <button className={`${status === 'available' ? 'on' : ''} available`} onClick={() => setStatus('available')} disabled={!canWork || busy === 'status'} role="radio" aria-checked={status === 'available'}><CircleDot size={22} />{t('available')}</button>
          <button className={`${status === 'window' ? 'on' : ''} window`} onClick={() => { const now = new Date(); setWin({ from: new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16), to: new Date(now.getTime() + 4 * 3600000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }); setWindowOpen(true); }} disabled={!canWork} role="radio" aria-checked={status === 'window'}><Clock size={22} />{t('window')}</button>
          <button className={`${status === 'offline' ? 'on' : ''} offline`} onClick={() => setStatus('offline')} role="radio" aria-checked={status === 'offline'}><Power size={22} />{t('offline')}</button>
        </>}
      </div>
      {status === 'window' && pro?.window?.to && <p className="small muted" style={{ marginTop: -10, marginBottom: 16 }}>Taking jobs {time(pro.window.from)} – {time(pro.window.to)}</p>}

      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          {active.data?.length > 0 && (
            <Card pad={false}>
              <div className="card-head"><h3>{t('activeJob')}</h3></div>
              <div className="divided">
                {active.data.map((j) => (
                  <Link key={j._id} to={`/pro/jobs/${j._id}`} className="list-item">
                    <CategoryIcon code={j.category} />
                    <div className="grow"><div className="strong">{j.categoryName} · {j.jobType?.name}</div><div className="small muted">{j.address?.block}, {j.address?.communityName}{j.scheduledAt ? ` · ${dateTime(j.scheduledAt)}` : ''}</div></div>
                    <StateBadge state={j.state} /><ChevronRight size={16} className="muted" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {offers.data?.length ? offers.data.map((o) => <OfferCard key={o._id} o={o} t={t} busy={busy} onAccept={accept} onDecline={decline} />) : (
            <Card><Empty icon={BellRing} title={t('noOffers')}>{status === 'offline' ? 'You are offline. Switch to Available to receive offers.' : t('noOffersHint')}</Empty></Card>
          )}
        </div>

        <div className="stack sticky">
          <div className="grid grid-2" style={{ '--gap': '12px' }}>
            <Stat label={t('todayEarnings')} value={money(today?.net || 0)} sub={today?.tips ? `+ ${money(today.tips)} tips` : undefined} tone="success" />
            <Stat label={t('jobsToday')} value={today?.jobs || 0} />
          </div>
          <Card>
            <div className="row">
              <ScoreRing value={pro?.score?.value} size={84} />
              <div className="grow">
                <div className="strong">{t('score')}</div>
                <div className="small muted">{pro?.stats?.jobsCompleted || 0} verified jobs · {pro?.stats?.ratingAvg ? `${pro.stats.ratingAvg}★` : 'no ratings yet'}</div>
                <Link to="/pro/passport" className="small">See how it is calculated →</Link>
              </div>
            </div>
          </Card>
          <Callout tone="success" icon={ShieldCheck}><span className="small">{t('tipZero')} Payment for every job is settled to your UPI the same day.</span></Callout>
        </div>
      </div>

      <Modal open={windowOpen} onClose={() => setWindowOpen(false)} title="Set a time window" footer={<Button variant="primary" onClick={async () => { await setStatus('window', { from: new Date(win.from).toISOString(), to: new Date(win.to).toISOString() }); setWindowOpen(false); }}>Save window</Button>}>
        <div className="grid grid-2">
          <Field label="From"><Input type="datetime-local" value={win.from} onChange={(e) => setWin({ ...win, from: e.target.value })} /></Field>
          <Field label="To"><Input type="datetime-local" value={win.to} onChange={(e) => setWin({ ...win, to: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
