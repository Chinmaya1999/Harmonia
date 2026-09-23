import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Zap, ShieldCheck, Wallet, Banknote, Info, HeartHandshake, CalendarDays } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Choice, Field, Textarea, Select, Spinner, Callout, Segmented } from '../../components/ui.jsx';
import { PhotoUploader, Avatar, TierBadge, Rating } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money } from '../../lib/format.js';
import { catImg } from '../../lib/media.js';

// Slots for scheduled work: next 7 days, 08:00–19:00, on the hour, in IST.
function slotDays() {
  const out = [];
  for (let d = 0; d < 7; d += 1) {
    const day = new Date(Date.now() + d * 86400000);
    const iso = day.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    out.push({ iso, label: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) });
  }
  return out;
}
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);
const slotIso = (dayIso, h) => new Date(`${dayIso}T${String(h).padStart(2, '0')}:00:00+05:30`).toISOString();

export default function Book() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const cats = useFetch('/catalogue/categories');
  const homes = useFetch('/me/homes');
  const team = useFetch('/me/team');
  const namedProId = params.get('pro');
  const namedPro = useFetch(namedProId ? `/me/pros/${namedProId}` : null);

  const [jobType, setJobType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [homeId, setHomeId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [when, setWhen] = useState('now');
  const [day, setDay] = useState(slotDays()[0].iso);
  const [hour, setHour] = useState(null);
  const [paymentMode, setPaymentMode] = useState('online');
  const [priorityTip, setPriorityTip] = useState(0);
  const [requireWoman, setRequireWoman] = useState(false);
  const [busy, setBusy] = useState(false);

  const category = cats.data?.categories.find((c) => c.code === code?.toUpperCase());
  const homeDetail = useFetch(homeId ? `/me/homes/${homeId}` : null);
  const preferred = team.data?.find((p) => p.category === category?.code);
  const scheduledOnly = category && category.archetype !== 'A';
  const jt = category?.jobTypes.find((j) => j.code === jobType);

  useEffect(() => { if (homes.data?.length && !homeId) setHomeId((homes.data.find((h) => h.isDefault) || homes.data[0])._id); }, [homes.data, homeId]);
  useEffect(() => { if (scheduledOnly || namedProId) setWhen(scheduledOnly ? 'slot' : 'named'); }, [scheduledOnly, namedProId]);
  useEffect(() => {
    if (category && !jobType) setJobType(category.jobTypes.find((j) => j.code === params.get('jt'))?.code || category.jobTypes[0]?.code || '');
  }, [category, jobType, params]);

  const band = useMemo(() => (jt && category ? { min: category.visitCharge + jt.labour, max: category.visitCharge + jt.labour + jt.standardParts } : null), [jt, category]);
  const tipOptions = band ? [0, 5000, 10000, 20000].filter((t) => t <= Math.min(100000, band.min / 2)) : [0];

  if (cats.loading || homes.loading) return <Spinner />;

  // Step 0 — no category chosen yet.
  if (!category) {
    return (
      <div className="container page">
        <PageHead title="What do you need help with?" sub="Pick a service. Only services with enough verified professionals nearby are open." back={{ to: '/app', label: 'Home' }} />
        <div className="grid grid-auto" style={{ '--min': '200px' }}>
          {cats.data?.categories.filter((c) => c.live).map((c, i) => (
            <Link key={c.code} to={`/app/book/${c.code}`} className="photo-tile reveal" style={{ aspectRatio: '4/3', '--d': `${i * 50}ms` }}>
              <img src={catImg(c.code)} alt="" />
              <div className="top"><span className="badge light"><span className="dot live" style={{ color: 'var(--success)' }} />{c.onlineNow} online</span></div>
              <div className="cap"><h3>{c.name}</h3><p style={{ fontSize: 13, opacity: .85 }}>from {money(c.fromPrice)}</p></div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!homes.data?.length) {
    return <div className="container page"><Callout tone="warning">Add your home first so we can find professionals near you. <Link to="/app/homes?new=1">Add home →</Link></Callout></div>;
  }

  const slotChosen = when === 'now' || (when === 'named' && !scheduledOnly && hour == null) || hour != null;
  const canSubmit = jobType && homeId && slotChosen && (when !== 'slot' || hour != null);

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        category: category.code, jobType, homeId, assetId: assetId || undefined, description: description.trim() || undefined, photos,
        paymentMode, requireWoman, priorityTip: when === 'now' ? priorityTip : 0,
        route: when === 'now' ? 'instant' : when === 'named' || namedProId ? 'named' : 'scheduled',
        proId: namedProId || undefined,
        scheduledAt: hour != null ? slotIso(day, hour) : undefined,
      };
      const job = await api.post('/jobs', body);
      navigate(`/app/jobs/${job._id}`, { replace: true });
    } catch (err) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <div className="photo-hero">
        <img src={catImg(category.code)} alt="" />
        <div className="stack" style={{ '--gap': '8px', maxWidth: 620 }}>
          <Link to="/app" className="back" style={{ marginBottom: 0 }}>← Home</Link>
          <h1>{category.name}</h1>
          <p>{category.description}</p>
          <div className="row wrap" style={{ '--gap': '8px' }}>
            <span className="badge light"><span className="dot live" style={{ color: 'var(--success)' }} />{category.onlineNow} professionals online</span>
            {category.warrantyDays > 0 && <span className="badge light">{category.warrantyDays}-day warranty</span>}
            <span className="badge light">Pay after the job</span>
          </div>
        </div>
      </div>
      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          {namedPro.data && (
            <Card className="info">
              <div className="row">
                <Avatar name={namedPro.data.pro.displayName} src={namedPro.data.pro.photoUrl} />
                <div className="grow">
                  <div className="strong">Booking {namedPro.data.pro.displayName}</div>
                  <div className="row wrap small" style={{ '--gap': '8px' }}><TierBadge tier={namedPro.data.pro.tier} compact /><Rating value={namedPro.data.pro.ratingAvg} count={namedPro.data.pro.ratingCount} /></div>
                </div>
                <Link className="btn ghost sm" to={`/app/book/${category.code}`}>Anyone instead</Link>
              </div>
            </Card>
          )}

          <Card>
            <h3>1. What needs doing?</h3>
            <p className="small muted" style={{ marginTop: 2 }}>Published rate card. The firm price is agreed with you on site before any work starts.</p>
            <div className="stack" style={{ '--gap': '8px', marginTop: 12 }}>
              {category.jobTypes.map((j) => (
                <Choice key={j.code} on={jobType === j.code} onClick={() => setJobType(j.code)} title={j.name}
                  right={<span className="right"><span className="strong num">{money(category.visitCharge + j.labour)}</span>{j.standardParts > 0 && <span className="tiny muted" style={{ display: 'block' }}>+ parts if needed</span>}</span>}>
                  About {j.durationMin} min
                </Choice>
              ))}
            </div>
            <div className="grid grid-2" style={{ marginTop: 14 }}>
              <Field label="Describe the problem (optional)"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Fan in the bedroom makes a grinding noise" maxLength={1000} /></Field>
              <div className="field"><span className="label">Photos (optional)</span><PhotoUploader photos={photos} max={4} onAdd={(u) => setPhotos((p) => [...p, ...u].slice(0, 4))} /></div>
            </div>
          </Card>

          <Card>
            <h3>2. When?</h3>
            {!scheduledOnly && !namedProId && (
              <div className="grid grid-2" style={{ marginTop: 12 }}>
                <Choice on={when === 'now'} onClick={() => { setWhen('now'); setHour(null); }} title={<span className="row" style={{ '--gap': '6px' }}><Zap size={16} />Now</span>}>
                  {preferred ? `${preferred.displayName} gets first refusal, then the best verified match nearby.` : 'The best verified match nearby, usually in under 2 minutes.'}
                </Choice>
                <Choice on={when === 'slot'} onClick={() => setWhen('slot')} title={<span className="row" style={{ '--gap': '6px' }}><CalendarDays size={16} />Pick a time</span>}>Schedule for later today or this week.</Choice>
              </div>
            )}
            {(when === 'slot' || scheduledOnly || (when === 'named' && namedProId)) && (
              <div className="stack" style={{ marginTop: 14 }}>
                {when === 'named' && !scheduledOnly && <Segmented value={hour == null ? 'asap' : 'slot'} onChange={(v) => setHour(v === 'asap' ? null : 10)} options={[{ value: 'asap', label: 'As soon as possible' }, { value: 'slot', label: 'Choose a slot' }]} />}
                {(when !== 'named' || scheduledOnly || hour != null) && <>
                  <div className="pill-list">{slotDays().map((d) => <button key={d.iso} type="button" className={`badge ${day === d.iso ? 'brand' : 'outline'}`} style={{ cursor: 'pointer', padding: '7px 12px' }} onClick={() => setDay(d.iso)}>{d.label}</button>)}</div>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', '--gap': '8px' }}>
                    {HOURS.map((h) => {
                      const past = new Date(slotIso(day, h)) < new Date(Date.now() + 45 * 60000);
                      return <button key={h} type="button" disabled={past} className={`btn sm ${hour === h ? 'primary' : ''}`} onClick={() => setHour(h)}>{h > 12 ? h - 12 : h}:00 {h >= 12 ? 'pm' : 'am'}</button>;
                    })}
                  </div>
                </>}
              </div>
            )}
          </Card>

          <Card>
            <h3>3. Where and how to pay</h3>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <Field label="Home">
                <Select value={homeId} onChange={(e) => { setHomeId(e.target.value); setAssetId(''); }} options={homes.data.map((h) => ({ value: h._id, label: `${h.label} — ${h.address?.line || ''}` }))} />
              </Field>
              <Field label="Which appliance or fitting? (optional)" hint="Links this job to your Home Record.">
                <Select value={assetId} onChange={(e) => setAssetId(e.target.value)} options={[{ value: '', label: 'Not linked' }, ...(homeDetail.data?.assets || []).map((a) => ({ value: a._id, label: `${a.label || a.type.replace(/_/g, ' ')}${a.make ? ` — ${a.make}` : ''}` }))]} />
              </Field>
            </div>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <Choice on={paymentMode === 'online'} onClick={() => setPaymentMode('online')} title={<span className="row" style={{ '--gap': '6px' }}><Wallet size={16} />UPI or card — held in escrow</span>}>You approve the firm price, your payment is held, and released only when you confirm.</Choice>
              <Choice on={paymentMode === 'cash'} onClick={() => setPaymentMode('cash')} title={<span className="row" style={{ '--gap': '6px' }}><Banknote size={16} />Cash after the job</span>}>Pay your professional directly once you confirm. Warranty still applies.</Choice>
            </div>
            {category.womanPreferenceOffered && (
              <label className="check" style={{ marginTop: 14 }}><input type="checkbox" checked={requireWoman} onChange={(e) => setRequireWoman(e.target.checked)} /><span><strong>Send a woman professional only</strong><br /><span className="small muted">We honour this in matching, even if it takes a little longer.</span></span></label>
            )}
          </Card>

          {when === 'now' && category.archetype === 'A' && (
            <Card className="accent">
              <h3 className="row" style={{ '--gap': '8px' }}><HeartHandshake size={18} color="var(--accent)" />In a hurry? Add a priority tip</h3>
              <p className="small" style={{ marginTop: 4, color: 'var(--ink-2)' }}>It goes <strong>100% to the professional</strong> — Harmonia takes nothing — and it moves your request up the queue. We never charge surge pricing.</p>
              <div className="pill-list" style={{ marginTop: 10 }}>
                {tipOptions.map((t) => <button key={t} type="button" className={`btn sm ${priorityTip === t ? 'accent' : ''}`} onClick={() => setPriorityTip(t)}>{t ? `+${money(t)}` : 'No tip'}</button>)}
              </div>
            </Card>
          )}
        </div>

        <div className="sticky stack">
          <Card>
            <h3>Summary</h3>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Service</dt><dd className="small">{jt?.name}</dd>
              {category.visitCharge > 0 && <><dt>Visit charge</dt><dd>{money(category.visitCharge)}</dd></>}
              <dt>Labour</dt><dd>{money(jt?.labour)}</dd>
              {jt?.standardParts > 0 && <><dt>Parts, if needed</dt><dd>up to ~{money(jt.standardParts)}</dd></>}
              {priorityTip > 0 && <><dt>Priority tip</dt><dd>{money(priorityTip)}</dd></>}
              <dt className="total">Expected</dt><dd className="total">{band ? `${money(band.min + priorityTip)}${band.max > band.min ? ` – ${money(band.max + priorityTip)}` : ''}` : '—'}</dd>
            </dl>
            <p className="tiny muted" style={{ marginTop: 8 }}>All prices include taxes. No surge pricing, ever.</p>
            <Button variant="primary" size="lg" block style={{ marginTop: 14 }} loading={busy} disabled={!canSubmit} onClick={submit}>
              {when === 'now' ? 'Find a professional now' : namedProId ? 'Send booking request' : 'Book this slot'}
            </Button>
          </Card>
          {/* ASR-06 — assurance terms in plain language on the booking screen. */}
          <Card className="soft">
            <h4 className="row" style={{ '--gap': '6px' }}><ShieldCheck size={14} />Harmonia Assurance</h4>
            <ul className="small" style={{ paddingLeft: 18, margin: '8px 0 0', color: 'var(--ink-2)', display: 'grid', gap: 6 }}>
              <li>Your payment is held until you confirm the work.</li>
              {category.warrantyDays > 0 && <li>{category.warrantyDays}-day workmanship warranty. If it fails, it is fixed free.</li>}
              <li>If your professional does not turn up, we send a replacement at no cost.</li>
              <li>Cancel free until your professional is on the way; {money(category.cancellation?.feePaise)} after that, paid to them for the wasted trip.</li>
            </ul>
          </Card>
          <Callout icon={Info}><span className="small">Only verified professionals with a background check can enter your home for this service.</span></Callout>
        </div>
      </div>
    </div>
  );
}

