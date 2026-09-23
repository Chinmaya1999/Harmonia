import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Phone, MessageSquare, Share2, Siren, ShieldCheck, Clock, KeyRound, AlertTriangle, CheckCircle2, HeartHandshake, Wrench, CalendarDays, XCircle, Scale, UserX,
} from 'lucide-react';
import { useLiveJob, useAction, useFetch, useNow } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Badge, Spinner, ErrorState, Modal, Field, Textarea, Select, MoneyInput, Callout } from '../../components/ui.jsx';
import {
  JobStepper, StateBadge, DispatchRadar, Countdown, Avatar, TierBadge, Rating, PriceBreakdown, Chat, Timeline, StarInput, PhotoUploader, AssuranceStrip,
} from '../../components/domain.jsx';
import { money, time, dateTime, date, labelize, REASON_LABEL, toPaise } from '../../lib/format.js';
import { catImg } from '../../lib/media.js';

const WAVE_TEXT = [
  'Asking your preferred professional first',
  'Offered to the three best-matched professionals nearby',
  'Widening the search to 6 km',
  'Offered to every verified professional within 10 km',
];

function Dispatching({ job, act }) {
  const d = job.dispatchView;
  const [tip, setTip] = useState(10000);
  const [slotOpen, setSlotOpen] = useState(false);
  const [slot, setSlot] = useState('');
  const maxTip = Math.min(100000, Math.floor((job.priceBand?.min || 0) / 2));

  if (d.mode === 'named' || d.mode === 'broadcast_scheduled') {
    if (d.exhausted) {
      return (
        <Card className="warning">
          <h3>{job.route === 'named' ? 'Your professional is not available' : 'No one has picked up this slot yet'}</h3>
          <p className="small" style={{ marginTop: 4 }}>{REASON_LABEL[d.namedOutcome?.reason] || REASON_LABEL[d.namedOutcome?.status] || 'They did not respond in time.'}</p>
          <div className="row wrap" style={{ marginTop: 14 }}>
            {job.route === 'named' && <Button onClick={() => act('wait', () => api.post(`/jobs/${job._id}/dispatch`, { action: 'wait_named' }))}>Ask them again</Button>}
            <Button variant="primary" onClick={() => act('others', () => api.post(`/jobs/${job._id}/dispatch`, { action: 'find_others' }))}>Find the best match instead</Button>
          </div>
        </Card>
      );
    }
    return (
      <Card>
        <div className="row"><Clock size={20} color="var(--brand-2)" /><div className="grow"><h3>{job.route === 'named' ? 'Waiting for your professional to accept' : 'Offered to professionals scheduled for your slot'}</h3>
          <p className="small muted">{job.scheduledAt ? `For ${dateTime(job.scheduledAt)}. ` : ''}We will tell you the moment someone accepts.</p></div></div>
        {d.waveEndsAt && <div style={{ marginTop: 12 }}><Countdown to={d.waveEndsAt} /></div>}
      </Card>
    );
  }

  return (
    <Card>
      <div className="grid grid-2" style={{ alignItems: 'center' }}>
        <DispatchRadar wave={d.wave} />
        <div className="stack">
          <h2 style={{ fontSize: 22 }}>{d.exhausted ? 'Still looking for you' : 'Finding your professional'}</h2>
          {!d.exhausted && <p className="muted">{WAVE_TEXT[Math.max(0, d.wave)]}…</p>}
          <div className="row wrap small">
            <Badge tone="info">{d.pending} considering</Badge>
            {d.declined > 0 && <Badge>{d.declined} unavailable</Badge>}
            {job.priorityTip > 0 && <Badge tone="accent">Priority tip {money(job.priorityTip)}</Badge>}
          </div>
          {d.waveEndsAt && !d.exhausted && <div className="small muted">Next step in <Countdown to={d.waveEndsAt} /></div>}
        </div>
      </div>
      {(d.tipSuggested || d.exhausted) && job.priorityTip === 0 && maxTip >= 5000 && (
        <div className="card accent pad" style={{ marginTop: 14 }}>
          <div className="strong row" style={{ '--gap': '8px' }}><HeartHandshake size={18} color="var(--accent)" />Add a priority tip to reach someone faster</div>
          <p className="small" style={{ marginTop: 4 }}>100% goes to the professional. Harmonia takes nothing and never charges surge.</p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {[5000, 10000, 20000].filter((t) => t <= maxTip).map((t) => <button key={t} className={`btn sm ${tip === t ? 'accent' : ''}`} onClick={() => setTip(t)}>{money(t)}</button>)}
            <Button size="sm" variant="primary" onClick={() => act('tip', () => api.post(`/jobs/${job._id}/priority-tip`, { amount: tip }), 'Priority tip added — searching again')}>Add {money(tip)} and search again</Button>
          </div>
        </div>
      )}
      {d.exhausted && (
        <div className="row wrap" style={{ marginTop: 14 }}>
          <Button onClick={() => act('again', () => api.post(`/jobs/${job._id}/dispatch`, { action: 'search_again' }))}>Keep searching</Button>
          <Button icon={CalendarDays} onClick={() => setSlotOpen(true)}>Book a slot instead</Button>
        </div>
      )}
      <Modal open={slotOpen} onClose={() => setSlotOpen(false)} title="Book the earliest slot" footer={<Button variant="primary" disabled={!slot} onClick={async () => { await act('slot', () => api.post(`/jobs/${job._id}/dispatch`, { action: 'schedule', scheduledAt: new Date(slot).toISOString() })); setSlotOpen(false); }}>Offer this slot</Button>}>
        <Field label="Date and time" hint="Offered to every verified professional scheduled to work then."><input className="input" type="datetime-local" value={slot} min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} onChange={(e) => setSlot(e.target.value)} /></Field>
      </Modal>
    </Card>
  );
}

function Assigned({ job, act }) {
  const now = useNow(15000);
  const grace = (job.windows?.noShowGraceMin || 20) * 60000;
  const late = job.eta && now > new Date(job.eta).getTime() + grace;
  return (
    <Card>
      <div className="row between wrap">
        <div>
          <h3>{job.state === 'EN_ROUTE' ? `${job.pro.displayName.split(' ')[0]} is on the way` : `${job.pro.displayName.split(' ')[0]} will be with you`}</h3>
          <p className="small muted">{job.scheduledAt ? `Booked for ${dateTime(job.scheduledAt)}` : `Expected by ${time(job.eta)}`}</p>
        </div>
        <Badge tone="brand"><Clock size={13} />{time(job.eta)}</Badge>
      </div>
      <div className="card soft pad center" style={{ marginTop: 14 }}>
        <div className="tiny muted row" style={{ justifyContent: 'center', '--gap': '6px' }}><KeyRound size={14} />Arrival code</div>
        <div className="big-otp">{job.arrivalOtp}</div>
        <div className="small muted">Share this only when they are at your door. It confirms the right, verified person arrived.</div>
      </div>
      {late && (
        <Callout tone="warning" icon={UserX}>
          <div className="row between wrap" style={{ '--gap': '8px' }}>
            <span>Running more than {job.windows.noShowGraceMin} minutes late?</span>
            <Button size="sm" variant="danger" onClick={() => act('noshow', () => api.post(`/jobs/${job._id}/no-show`), 'We are sending a replacement at no cost')}>Report no-show — send a replacement</Button>
          </div>
        </Callout>
      )}
    </Card>
  );
}

function Arrived({ job, act }) {
  const q = job.quote;
  if (q?.status === 'pending') {
    const total = q.price.total + (job.priorityTip || 0);
    return (
      <Card className="info">
        <h3>Approve the firm price</h3>
        <p className="small" style={{ marginTop: 2 }}>{job.pro.displayName.split(' ')[0]} has inspected the job. Nothing changes without your approval.</p>
        {q.price.note && <p className="small" style={{ marginTop: 8 }}>“{q.price.note}”</p>}
        <div className="card pad" style={{ marginTop: 12 }}><PriceBreakdown price={q.price} priorityTip={job.priorityTip} /></div>
        {job.photos?.before?.length > 0 && <div style={{ marginTop: 12 }}><div className="tiny muted" style={{ marginBottom: 6 }}>Before photos</div><PhotoUploader photos={job.photos.before} disabled /></div>}
        <div className="row wrap" style={{ marginTop: 14 }}>
          <Button variant="primary" size="lg" onClick={() => act('approve', () => api.post(`/jobs/${job._id}/quote/decision`, { approve: true }), job.paymentMode === 'online' ? 'Payment held safely in escrow' : 'Price approved')}>
            {job.paymentMode === 'online' ? `Approve & hold ${money(total)} in escrow` : `Approve ${money(total)}`}
          </Button>
          <Button onClick={() => act('reject', () => api.post(`/jobs/${job._id}/quote/decision`, { approve: false }))}>Decline</Button>
        </div>
        {job.paymentMode === 'online' && <p className="tiny muted" style={{ marginTop: 8 }}>Your money is held by our licensed payment partner and released only when you confirm the work is done.</p>}
      </Card>
    );
  }
  if (q?.status === 'rejected') {
    return <Card className="warning"><h3>You declined the quote</h3><p className="small" style={{ marginTop: 4 }}>Your professional can revise it, or you can cancel — the {money(job.priceBand.visit)} visit charge applies because they came to your home.</p></Card>;
  }
  return <Card><div className="row"><Wrench color="var(--brand-2)" /><div><h3>Inspecting the job</h3><p className="small muted">You will see the firm price here before any work begins.</p></div></div></Card>;
}

function ScopeRevision({ job, act }) {
  const rev = job.scopeRevisions.at(-1);
  const prev = job.agreedPrice;
  return (
    <Card className="warning">
      <h3 className="row" style={{ '--gap': '8px' }}><AlertTriangle size={18} />The job needs more than quoted</h3>
      <p className="small" style={{ marginTop: 4 }}>“{rev.reason}”</p>
      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div className="card pad"><div className="tiny muted">Agreed so far</div><div className="display" style={{ fontSize: 24 }}>{money(prev?.total)}</div></div>
        <div className="card pad"><div className="tiny muted">Revised price</div><div className="display" style={{ fontSize: 24, color: 'var(--warning)' }}>{money(rev.price.total)}</div></div>
      </div>
      <div className="card pad" style={{ marginTop: 12 }}><PriceBreakdown price={rev.price} /></div>
      <div className="row wrap" style={{ marginTop: 14 }}>
        <Button variant="primary" onClick={() => act('approve', () => api.post(`/jobs/${job._id}/scope/decision`, { approve: true }), 'Revised price approved')}>Approve {money(rev.price.total)}</Button>
        <Button onClick={() => act('reject', () => api.post(`/jobs/${job._id}/scope/decision`, { approve: false }))}>Keep original scope</Button>
      </div>
    </Card>
  );
}

function WorkComplete({ job, act, onIssue }) {
  const price = job.agreedPrice;
  const total = (price?.total || 0) + (job.priorityTip || 0);
  return (
    <Card className="success">
      <h3 className="row" style={{ '--gap': '8px' }}><CheckCircle2 size={18} />{job.notFeasible?.flag ? 'The job was not possible' : 'Work complete — please check it'}</h3>
      {job.notFeasible?.flag && <p className="small" style={{ marginTop: 4 }}>Reason given: “{job.notFeasible.reason}”. Only the visit charge applies.</p>}
      {job.photos?.after?.length > 0 && <div style={{ marginTop: 12 }}><div className="tiny muted" style={{ marginBottom: 6 }}>After photos</div><PhotoUploader photos={job.photos.after} disabled /></div>}
      <div className="row wrap" style={{ marginTop: 14 }}>
        <Button variant="primary" size="lg" onClick={() => act('confirm', () => api.post(`/jobs/${job._id}/confirm`), job.paymentMode === 'online' ? 'Payment released — thank you' : 'Confirmed')}>
          {job.route === 'warranty' ? 'Confirm the fix' : job.paymentMode === 'online' ? `Confirm & release ${money(total)}` : `Confirm — pay ${money(total)} in cash`}
        </Button>
        <Button icon={Scale} onClick={onIssue}>Something is wrong</Button>
      </div>
      {job.confirmDueAt && <p className="tiny muted" style={{ marginTop: 8 }}>If we do not hear from you, it confirms automatically at {dateTime(job.confirmDueAt)}.</p>}
    </Card>
  );
}

function RateAndTip({ job, meta, act }) {
  const [scores, setScores] = useState({ quality: 0, punctuality: 0, conduct: 0, cleanliness: 0, priceFairness: 0 });
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [preferred, setPreferred] = useState(true);
  const [tip, setTip] = useState(5000);
  const [custom, setCustom] = useState('');
  const filled = Object.values(scores).every((v) => v > 0);
  const avg = filled ? Object.values(scores).reduce((a, b) => a + b, 0) / 5 : 5;
  const first = job.pro?.displayName.split(' ')[0];

  if (!job.ratings.mine) {
    return (
      <Card>
        <h3>How was {first}?</h3>
        <p className="small muted" style={{ marginTop: 2 }}>Ratings are blind — neither of you sees the other's until both are in.</p>
        <div className="stack" style={{ marginTop: 14, '--gap': '10px' }}>
          {[['quality', 'Quality of work'], ['punctuality', 'Punctuality'], ['conduct', 'Behaviour'], ['cleanliness', 'Cleanliness'], ['priceFairness', 'Price fairness']].map(([k, l]) => (
            <StarInput key={k} label={l} value={scores[k]} onChange={(v) => setScores((s) => ({ ...s, [k]: v }))} />
          ))}
        </div>
        {filled && avg < 3 && (
          <Field label="What went wrong?"><Select value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: '', label: 'Choose a reason' }, ...(meta?.ratingReasons || []).map((r) => ({ value: r, label: labelize(r) }))]} /></Field>
        )}
        <Field label="Anything to add? (optional)"><Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={800} /></Field>
        {avg >= 4 && <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={preferred} onChange={(e) => setPreferred(e.target.checked)} /><span>Add {first} to <strong>My Harmonia Team</strong> — they get first refusal next time.</span></label>}
        <Button variant="primary" block style={{ marginTop: 14 }} disabled={!filled || (avg < 3 && !reason)}
          onClick={() => act('rate', () => api.post(`/jobs/${job._id}/rate`, { scores, reasonCode: reason || undefined, text: text || undefined, makePreferred: avg >= 4 && preferred }), 'Thank you for rating')}>Submit rating</Button>
      </Card>
    );
  }
  const remaining = Math.max(0, (job.tipCap || 0) - (job.tipsTotal || 0));
  const presets = [3000, 5000, 10000].filter((t) => t <= remaining);
  const amount = custom ? toPaise(custom) : tip;
  return (
    <Card className="accent">
      <h3 className="row" style={{ '--gap': '8px' }}><HeartHandshake size={18} color="var(--accent)" />{job.tipsTotal > 0 ? `You tipped ${money(job.tipsTotal)} — thank you` : `Say thanks to ${first}?`}</h3>
      <p className="small" style={{ marginTop: 4 }}>Harmonia takes <strong>zero commission</strong> on tips. The full amount reaches {first}'s UPI today.</p>
      {remaining >= 1000 && (
        <>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {presets.map((t) => <button key={t} className={`btn sm ${!custom && tip === t ? 'accent' : ''}`} onClick={() => { setTip(t); setCustom(''); }}>{money(t)}</button>)}
            <div style={{ width: 120 }}><MoneyInput value={custom} onChange={setCustom} placeholder="Other" aria-label="Custom tip" /></div>
          </div>
          <Button variant="accent" style={{ marginTop: 12 }} disabled={!amount || amount > remaining} onClick={() => act('tip', async () => { await api.post(`/jobs/${job._id}/tip`, { amount }); setCustom(''); }, 'Tip sent in full')}>Tip {money(amount)}</Button>
          <p className="tiny muted" style={{ marginTop: 6 }}>Tips on a job are capped at {money(job.tipCap)} to keep all payments on the record.</p>
        </>
      )}
    </Card>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: job, loading, error, reload } = useLiveJob(id);
  const meta = useFetch('/catalogue/meta');
  const { busy, run } = useAction();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [chatOpen, setChatOpen] = useState(false);

  if (loading && !job) return <Spinner />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;

  const act = async (key, fn, success) => { await run(key, fn, { success }); reload({ silent: true }); };
  const S = job.state;
  const active = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'SCOPE_REVISED', 'WORK_COMPLETE'].includes(S);
  const cancellable = ['CREATED', 'DISPATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(S);
  const cancelFee = S === 'ARRIVED' ? job.priceBand?.visit : ['EN_ROUTE'].includes(S) ? job.cancellationPolicy?.feePaise : 0;
  const warrantyOpen = ['PAID', 'CLOSED'].includes(S) && job.route !== 'warranty' && job.warranty?.expiresAt && new Date(job.warranty.expiresAt) > new Date();
  const canDispute = ['ARRIVED', 'IN_PROGRESS', 'SCOPE_REVISED', 'WORK_COMPLETE', 'CUSTOMER_CONFIRMED', 'PAID', 'CLOSED'].includes(S) && !job.dispute;

  const share = async () => {
    const r = await api.get(`/jobs/${job._id}/share`);
    const url = `${window.location.origin}${r.path}`;
    if (navigator.share) await navigator.share({ title: `${job.categoryName} — live status`, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); toast({ title: 'Tracking link copied', body: 'Anyone with the link can follow this job.', tone: 'success' }); }
  };
  const call = async () => {
    const r = await api.post(`/jobs/${job._id}/call`);
    toast({ title: `Call ${r.bridge}, PIN ${r.pin}`, body: r.note, duration: 12000 });
  };
  const sos = async () => {
    if (!window.confirm('Send an SOS to Harmonia operations with your location?')) return;
    const loc = await new Promise((res) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res(p.coords), () => res(null), { timeout: 4000 }) : res(null));
    await run('sos', () => api.post(`/jobs/${job._id}/sos`, { lat: loc?.latitude, lng: loc?.longitude }), { success: 'SOS sent. Our team is calling you now.' });
  };

  return (
    <div className="container page">
      <div className="photo-hero" style={{ minHeight: 180, justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <img src={catImg(job.category)} alt="" />
        <div className="stack" style={{ '--gap': '6px' }}>
          <Link to="/app/jobs" className="back" style={{ marginBottom: 0 }}>← Bookings</Link>
          <div className="row wrap"><h1>{job.categoryName}</h1><StateBadge state={S} />{job.route === 'warranty' && <Badge tone="accent"><ShieldCheck size={12} />Warranty visit</Badge>}</div>
          <p>{job.jobType?.name} · <span className="mono">{job.ref}</span> · {job.address?.communityName}</p>
        </div>
        <div className="row wrap">
          {active && <Button size="sm" variant="white" icon={Share2} onClick={share}>Share live status</Button>}
          {active && <Button size="sm" variant="danger" icon={Siren} onClick={sos}>SOS</Button>}
        </div>
      </div>

      {!['CANCELLED_BY_CUSTOMER', 'EXPIRED'].includes(S) && <Card style={{ marginBottom: 16 }}><JobStepper state={S} /></Card>}

      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          {S === 'DISPATCHING' && <Dispatching job={job} act={act} />}
          {['ASSIGNED', 'EN_ROUTE'].includes(S) && <Assigned job={job} act={act} />}
          {S === 'ARRIVED' && <Arrived job={job} act={act} />}
          {S === 'IN_PROGRESS' && (
            <Card><div className="row"><Wrench color="var(--brand-2)" /><div className="grow"><h3>Work in progress</h3><p className="small muted">Agreed price {money(job.agreedPrice?.total)}{job.payment?.escrowed ? ` · ${money(job.payment.escrowed - job.payment.refunded)} held safely in escrow` : ''}</p></div></div></Card>
          )}
          {S === 'SCOPE_REVISED' && <ScopeRevision job={job} act={act} />}
          {S === 'WORK_COMPLETE' && <WorkComplete job={job} act={act} onIssue={() => setModal('dispute')} />}
          {S === 'CUSTOMER_CONFIRMED' && job.paymentMode === 'cash' && (
            <Card className="info"><h3>Please pay {money((job.agreedPrice?.total || 0) + (job.priorityTip || 0))} in cash</h3><p className="small" style={{ marginTop: 4 }}>{job.pro.displayName.split(' ')[0]} will mark it received. Your warranty starts then.</p></Card>
          )}
          {['PAID', 'CLOSED'].includes(S) && job.pro && <RateAndTip job={job} meta={meta.data} act={act} />}
          {S === 'DISPUTED' || job.dispute ? (
            <Card className={job.dispute?.status === 'open' || job.dispute?.status === 'appealed' ? 'warning' : ''}>
              <h3 className="row" style={{ '--gap': '8px' }}><Scale size={18} />Dispute {job.dispute?.ref}</h3>
              {job.dispute?.status === 'open' && <p className="small" style={{ marginTop: 4 }}>Our team is reviewing the photos, chat, quotes and timeline. Decision by {dateTime(job.dispute.slaDueAt)}. Any payment stays in escrow until then.</p>}
              {job.dispute?.decision?.at && (
                <div style={{ marginTop: 8 }}>
                  <Badge tone="brand">{labelize(job.dispute.decision.outcome)}</Badge>
                  {job.dispute.decision.refundPaise > 0 && <Badge tone="success" style={{ marginLeft: 6 }}>Refund {money(job.dispute.decision.refundPaise)}</Badge>}
                  <p className="small" style={{ marginTop: 8 }}>{job.dispute.decision.rationale}</p>
                  {job.dispute.status === 'decided' && <Button size="sm" style={{ marginTop: 10 }} onClick={() => setModal('appeal')}>Appeal this decision</Button>}
                  {job.dispute.status === 'appealed' && <p className="tiny muted" style={{ marginTop: 6 }}>Appeal under review by a different reviewer.</p>}
                  {job.dispute.appeal?.outcome && <p className="small" style={{ marginTop: 6 }}>Appeal {job.dispute.appeal.outcome}: {job.dispute.appeal.rationale}</p>}
                </div>
              )}
            </Card>
          ) : null}
          {['CANCELLED_BY_CUSTOMER', 'EXPIRED'].includes(S) && (
            <Card><div className="row"><XCircle color="var(--muted)" /><div><h3>{S === 'EXPIRED' ? 'This request expired' : 'You cancelled this booking'}</h3>
              <p className="small muted">{job.cancellation?.feePaise ? `A ${money(job.cancellation.feePaise)} cancellation fee was paid to the professional for the trip.` : 'No charge.'} {job.payment?.refunded ? `${money(job.payment.refunded)} refunded to your original payment method.` : ''}</p></div></div></Card>
          )}

          {job.pro && (
            <Card>
              <div className="row top">
                <Avatar name={job.pro.displayName} src={job.pro.photoUrl} size="lg" />
                <div className="grow stack" style={{ '--gap': '6px' }}>
                  <div className="row between wrap"><div><div className="strong" style={{ fontSize: 17 }}>{job.pro.displayName}</div><div className="mono tiny muted">{job.pro.harmoniaId}</div></div><Link to={`/p/${job.pro.harmoniaId}`} className="small">Skill Passport →</Link></div>
                  <div className="row wrap"><TierBadge tier={job.pro.tier} /><Rating value={job.pro.ratingAvg} count={job.pro.ratingCount} /><span className="small muted">{job.pro.jobsCompleted} verified jobs</span></div>
                </div>
              </div>
              {active && (
                <div className="row wrap" style={{ marginTop: 14 }}>
                  <Button icon={Phone} onClick={call}>Call (number stays private)</Button>
                  <Button icon={MessageSquare} onClick={() => setChatOpen((x) => !x)}>{chatOpen ? 'Hide chat' : `Chat${job.messagesCount ? ` (${job.messagesCount})` : ''}`}</Button>
                </div>
              )}
              {chatOpen && <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}><Chat jobId={job._id} meId={user._id} disabled={!active} /></div>}
            </Card>
          )}

          {(job.photos?.before?.length > 0 || job.photos?.after?.length > 0) && !['ARRIVED', 'WORK_COMPLETE'].includes(S) && (
            <Card>
              <h3>Photos</h3>
              <div className="grid grid-2" style={{ marginTop: 10 }}>
                <div><div className="tiny muted" style={{ marginBottom: 6 }}>Before</div><PhotoUploader photos={job.photos.before} disabled /></div>
                <div><div className="tiny muted" style={{ marginBottom: 6 }}>After</div><PhotoUploader photos={job.photos.after} disabled /></div>
              </div>
            </Card>
          )}
        </div>

        <div className="stack sticky">
          <Card>
            <h3>{job.pricing?.gross != null ? 'Receipt' : 'Price'}</h3>
            <div style={{ marginTop: 10 }}>
              {job.agreedPrice ? <PriceBreakdown price={job.agreedPrice} priorityTip={job.priorityTip} /> : (
                <dl className="kv"><dt>Expected</dt><dd>{money(job.priceBand?.min)}{job.priceBand?.max > job.priceBand?.min ? ` – ${money(job.priceBand.max)}` : ''}</dd>{job.priorityTip > 0 && <><dt>Priority tip</dt><dd>{money(job.priorityTip)}</dd></>}</dl>
              )}
            </div>
            <div className="row wrap small" style={{ marginTop: 10, '--gap': '6px' }}>
              <Badge>{job.paymentMode === 'online' ? 'UPI / card · escrow' : 'Cash'}</Badge>
              {job.payment?.status && job.payment.status !== 'none' && <Badge tone="success">{labelize(job.payment.status)}</Badge>}
              {job.tipsTotal > 0 && <Badge tone="accent">Tipped {money(job.tipsTotal)}</Badge>}
            </div>
          </Card>

          {warrantyOpen && (
            <Card className="success">
              <div className="row between"><h4 className="row" style={{ '--gap': '6px', color: 'var(--success)' }}><ShieldCheck size={14} />Warranty active</h4><span className="tiny">until {date(job.warranty.expiresAt)}</span></div>
              <p className="small" style={{ marginTop: 6 }}>If the work fails, we send {job.pro?.displayName.split(' ')[0]} back — or a replacement — free.</p>
              <Button size="sm" style={{ marginTop: 10 }} onClick={() => setModal('warranty')}>Claim warranty</Button>
            </Card>
          )}

          {(cancellable || canDispute) && (
            <Card className="soft">
              <div className="stack" style={{ '--gap': '8px' }}>
                {cancellable && <Button block onClick={() => setModal('cancel')}>Cancel booking</Button>}
                {canDispute && S !== 'WORK_COMPLETE' && <Button block variant="ghost" icon={Scale} onClick={() => setModal('dispute')}>Raise an issue</Button>}
              </div>
            </Card>
          )}

          <Card>
            <h3 style={{ marginBottom: 10 }}>Timeline</h3>
            <Timeline events={job.timeline} />
          </Card>
          <AssuranceStrip />
        </div>
      </div>

      <Modal open={modal === 'cancel'} onClose={() => setModal(null)} title="Cancel this booking?"
        footer={<><Button onClick={() => setModal(null)}>Keep booking</Button><Button variant="danger" loading={busy === 'cancel'} onClick={async () => { await act('cancel', () => api.post(`/jobs/${job._id}/cancel`, { reason: form.reason })); setModal(null); }}>Cancel booking</Button></>}>
        <div className="stack">
          <Callout tone={cancelFee ? 'warning' : 'success'}>{cancelFee ? `A ${money(cancelFee)} fee applies — it goes to the professional for the wasted trip.` : 'Cancelling now is free.'}{job.payment?.escrowed ? ' Anything held in escrow is refunded.' : ''}</Callout>
          <Field label="Reason (optional)"><Textarea value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={modal === 'dispute'} onClose={() => setModal(null)} title="Raise an issue"
        footer={<Button variant="primary" loading={busy === 'dispute'} disabled={!form.dReason || (form.dText || '').length < 10} onClick={async () => { await act('dispute', () => api.post(`/jobs/${job._id}/dispute`, { reason: form.dReason, description: form.dText, attachments: form.dPhotos }), 'Issue raised — we will decide within 72 hours'); setModal(null); }}>Submit</Button>}>
        <div className="stack">
          <Callout>Decisions follow a published, symmetric policy using the photos, quotes, chat and timeline. {job.payment?.escrowed && !job.payment?.settledAt ? 'Your payment stays in escrow until it is resolved.' : ''}</Callout>
          <Field label="What is the issue?"><Select value={form.dReason || ''} onChange={(e) => setForm({ ...form, dReason: e.target.value })} options={[{ value: '', label: 'Choose' }, ...(meta.data?.disputeReasons || []).map((r) => ({ value: r, label: labelize(r) }))]} /></Field>
          <Field label="Describe what happened" hint="At least 10 characters."><Textarea value={form.dText || ''} onChange={(e) => setForm({ ...form, dText: e.target.value })} /></Field>
          <div className="field"><span className="label">Photos (optional)</span><PhotoUploader photos={form.dPhotos || []} onAdd={(u) => setForm((f) => ({ ...f, dPhotos: [...(f.dPhotos || []), ...u] }))} /></div>
        </div>
      </Modal>

      <Modal open={modal === 'warranty'} onClose={() => setModal(null)} title="Claim your workmanship warranty"
        footer={<Button variant="primary" loading={busy === 'warranty'} disabled={(form.wReason || '').length < 5} onClick={async () => { const r = await run('warranty', () => api.post(`/jobs/${job._id}/warranty`, { reason: form.wReason, photos: form.wPhotos })); if (r) { setModal(null); window.location.assign(`/app/jobs/${r._id}`); } }}>Request a free fix</Button>}>
        <div className="stack">
          <p className="small">{job.pro?.displayName.split(' ')[0]} gets the first chance to come back. If they cannot, Harmonia sends a replacement — at no cost to you.</p>
          <Field label="What failed?"><Textarea value={form.wReason || ''} onChange={(e) => setForm({ ...form, wReason: e.target.value })} placeholder="e.g. The tap started leaking again" /></Field>
          <div className="field"><span className="label">Photos (optional)</span><PhotoUploader photos={form.wPhotos || []} max={4} onAdd={(u) => setForm((f) => ({ ...f, wPhotos: [...(f.wPhotos || []), ...u] }))} /></div>
        </div>
      </Modal>

      <Modal open={modal === 'appeal'} onClose={() => setModal(null)} title="Appeal the decision"
        footer={<Button variant="primary" disabled={(form.aText || '').length < 10} onClick={async () => { await act('appeal', () => api.post(`/jobs/${job._id}/dispute/appeal`, { reason: form.aText }), 'Appeal submitted'); setModal(null); }}>Submit appeal</Button>}>
        <Field label="Why is the decision wrong?" hint="A different reviewer will look at it."><Textarea value={form.aText || ''} onChange={(e) => setForm({ ...form, aText: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}
