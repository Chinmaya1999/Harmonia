import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Navigation, Phone, MessageSquare, KeyRound, Camera, Plus, Trash2, Clock, CheckCircle2, Banknote, AlertTriangle, Scale, Siren, ShieldCheck, Star } from 'lucide-react';
import { useLiveJob, useAction, useFetch } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Badge, Spinner, ErrorState, Modal, Field, Input, Textarea, Select, MoneyInput, Callout } from '../../components/ui.jsx';
import { JobStepper, StateBadge, PhotoUploader, PriceBreakdown, Chat, Timeline, StarInput } from '../../components/domain.jsx';
import { money, time, dateTime, labelize, toPaise } from '../../lib/format.js';
import { catImg } from '../../lib/media.js';

const rupeesStr = (p) => (p ? String(p / 100) : '');

function PriceForm({ job, initial, onSubmit, busy, submitLabel, withReason }) {
  const [labour, setLabour] = useState(rupeesStr(initial?.labour ?? job.jobType?.labour));
  const [parts, setParts] = useState((initial?.parts || []).map((p) => ({ name: p.name, qty: p.qty, unitPrice: rupeesStr(p.unitPrice) })));
  const [note, setNote] = useState('');
  const visit = job.priceBand?.visit || 0;
  const total = visit + toPaise(labour) + parts.reduce((a, p) => a + (Number(p.qty) || 0) * toPaise(p.unitPrice), 0);
  const commission = job.archetype === 'D' ? 0 : 0.15;
  const fee = Math.round((visit + toPaise(labour)) * commission);
  const setPart = (i, k, v) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const ok = toPaise(labour) > 0 && parts.every((p) => p.name.trim() && toPaise(p.unitPrice) >= 0) && (!withReason || note.trim().length >= 5);

  return (
    <div className="stack">
      <div className="grid grid-2">
        <Field label="Visit charge (fixed)"><MoneyInput value={rupeesStr(visit)} onChange={() => {}} disabled /></Field>
        <Field label="Labour" hint={`Rate card: ${money(job.jobType?.labour)}`}><MoneyInput value={labour} onChange={setLabour} /></Field>
      </div>
      <div className="stack" style={{ '--gap': '8px' }}>
        <span className="label">Parts and materials (itemised)</span>
        {parts.map((p, i) => (
          <div key={i} className="row" style={{ '--gap': '8px' }}>
            <input className="input" style={{ flex: 3 }} placeholder="Part name" value={p.name} onChange={(e) => setPart(i, 'name', e.target.value)} aria-label="Part name" />
            <input className="input num" style={{ flex: 1, minWidth: 56 }} type="number" min={1} value={p.qty} onChange={(e) => setPart(i, 'qty', e.target.value)} aria-label="Quantity" />
            <div style={{ flex: 2 }}><MoneyInput value={p.unitPrice} onChange={(v) => setPart(i, 'unitPrice', v)} placeholder="Price" aria-label="Unit price" /></div>
            <button className="btn ghost icon" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove part"><Trash2 size={16} /></button>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => setParts((ps) => [...ps, { name: '', qty: 1, unitPrice: '' }])} style={{ alignSelf: 'flex-start' }}>Add part</Button>
      </div>
      <Field label={withReason ? 'What changed? (the customer sees this)' : 'Note for the customer (optional)'}><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      <div className="card soft pad">
        <dl className="kv">
          <dt>Customer pays</dt><dd className="strong">{money(total + (job.priorityTip || 0))}</dd>
          <dt>Platform fee (~{Math.round(commission * 100)}% of visit + labour)</dt><dd>−{money(fee)}</dd>
          <dt className="total">You receive (approx.)</dt><dd className="total" style={{ color: 'var(--success)' }}>{money(total - fee + (job.priorityTip || 0))}</dd>
        </dl>
        <p className="tiny muted" style={{ marginTop: 6 }}>Parts pass through at cost with no commission. Exact split, including TDS, is shown after approval.</p>
      </div>
      <Button variant="primary" size="lg" block loading={busy} disabled={!ok} onClick={() => onSubmit({ labour: toPaise(labour), parts: parts.map((p) => ({ name: p.name.trim(), qty: Number(p.qty) || 1, unitPrice: toPaise(p.unitPrice) })), ...(withReason ? { reason: note } : { note: note || undefined }) })}>{submitLabel}</Button>
    </div>
  );
}

function RateCustomer({ job, meta, act }) {
  const [s, setS] = useState({ respect: 0, clarity: 0, paymentPromptness: 0 });
  const [reason, setReason] = useState('');
  const filled = Object.values(s).every(Boolean);
  const avg = filled ? Object.values(s).reduce((a, b) => a + b, 0) / 3 : 5;
  return (
    <Card>
      <h3>Rate the customer</h3>
      <p className="small muted" style={{ marginTop: 2 }}>Blind until you both rate. Helps every professional know who they are working for.</p>
      <div className="stack" style={{ marginTop: 12, '--gap': '10px' }}>
        <StarInput label="Respectful" value={s.respect} onChange={(v) => setS({ ...s, respect: v })} />
        <StarInput label="Clear about the job" value={s.clarity} onChange={(v) => setS({ ...s, clarity: v })} />
        <StarInput label="Paid promptly" value={s.paymentPromptness} onChange={(v) => setS({ ...s, paymentPromptness: v })} />
      </div>
      {filled && avg < 3 && <Field label="What went wrong?"><Select value={reason} onChange={(e) => setReason(e.target.value)} options={[{ value: '', label: 'Choose a reason' }, ...(meta?.customerRatingReasons || []).map((r) => ({ value: r, label: labelize(r) }))]} /></Field>}
      <Button variant="primary" block style={{ marginTop: 12 }} disabled={!filled || (avg < 3 && !reason)} onClick={() => act('rate', () => api.post(`/jobs/${job._id}/rate`, { scores: s, reasonCode: reason || undefined }), 'Rating saved')}>Submit</Button>
    </Card>
  );
}

export default function JobRun() {
  const { id } = useParams();
  const { t, user } = useAuth();
  const toast = useToast();
  const { data: job, loading, error, reload } = useLiveJob(id);
  const meta = useFetch('/catalogue/meta');
  const { busy, run } = useAction();
  const [otp, setOtp] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [chat, setChat] = useState(false);
  useEffect(() => { setOtp(''); }, [job?.state]);

  if (loading && !job) return <Spinner />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;

  const act = async (key, fn, success) => { const r = await run(key, fn, { success }); reload({ silent: true }); return r; };
  const S = job.state;
  const active = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'SCOPE_REVISED', 'WORK_COMPLETE'].includes(S);
  const [lng, lat] = job.location?.coordinates || [];
  const addPhotos = (kind) => async (uploaded) => act(`photo-${kind}`, () => api.post(`/jobs/${job._id}/photos`, { kind, photos: uploaded.map(({ url, sha256 }) => ({ url, sha256 })) }));
  const needsPhotos = ['A', 'C'].includes(job.archetype);
  const call = async () => { const r = await api.post(`/jobs/${job._id}/call`); toast({ title: `Call ${r.bridge}, PIN ${r.pin}`, body: r.note, duration: 12000 }); };

  return (
    <div className="container page">
      <div className="photo-hero" style={{ minHeight: 170, justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <img src={catImg(job.category)} alt="" />
        <div className="stack" style={{ '--gap': '6px' }}>
          <Link to="/pro" className="back" style={{ marginBottom: 0 }}>← Today</Link>
          <div className="row wrap"><h1>{job.categoryName}</h1><StateBadge state={S} />{job.route === 'warranty' && <Badge tone="accent"><ShieldCheck size={12} />Warranty visit</Badge>}{job.feeHoliday && <Badge tone="success">Fee holiday</Badge>}</div>
          <p>{job.jobType?.name} · <span className="mono">{job.ref}</span></p>
        </div>
        {active && <Button size="sm" variant="danger" icon={Siren} onClick={async () => { if (window.confirm('Send an SOS to Harmonia operations?')) await run('sos', () => api.post(`/jobs/${job._id}/sos`, {}), { success: 'SOS sent — operations will call you now' }); }}>SOS</Button>}
      </div>
      <Card style={{ marginBottom: 16 }}><JobStepper state={S} /></Card>

      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          {/* Where + who */}
          <Card>
            <div className="row between top wrap">
              <div>
                <div className="strong" style={{ fontSize: 17 }}>{job.address?.line || `${job.address?.block}, ${job.address?.communityName}`}</div>
                <div className="small muted">{job.address?.communityName} · Customer {job.customerInfo?.name}{job.customerInfo?.rating ? ` · ${job.customerInfo.rating}★` : ''}</div>
                {job.scheduledAt && <div className="small" style={{ marginTop: 4 }}><Clock size={13} /> {dateTime(job.scheduledAt)}</div>}
                {job.description && <p className="small" style={{ marginTop: 8 }}>“{job.description}”</p>}
              </div>
              {active && lat && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer"><Navigation size={16} />Directions</a>}
            </div>
            {job.requestPhotos?.length > 0 && <div style={{ marginTop: 10 }}><PhotoUploader photos={job.requestPhotos} disabled /></div>}
            {active && (
              <div className="row wrap" style={{ marginTop: 12 }}>
                <Button icon={Phone} onClick={call}>Call customer</Button>
                <Button icon={MessageSquare} onClick={() => setChat((x) => !x)}>{chat ? 'Hide chat' : 'Chat'}</Button>
              </div>
            )}
            {chat && <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}><Chat jobId={job._id} meId={user._id} disabled={!active} /></div>}
          </Card>

          {/* The one thing to do now */}
          {S === 'ASSIGNED' && (
            <Card className="info">
              <h3>{job.scheduledAt ? `Be there by ${time(job.scheduledAt)}` : `Customer expects you by ${time(job.eta)}`}</h3>
              <Button variant="primary" size="lg" block style={{ marginTop: 12 }} icon={Navigation} loading={busy === 'go'} onClick={() => act('go', () => api.post(`/jobs/${job._id}/en-route`))}>{t('startTravel')}</Button>
            </Card>
          )}
          {['ASSIGNED', 'EN_ROUTE'].includes(S) && (
            <Card>
              <h3 className="row" style={{ '--gap': '8px' }}><KeyRound size={18} />{t('enterOtp')}</h3>
              <p className="small muted" style={{ marginTop: 2 }}>This proves you arrived at the right home.</p>
              <div className="row" style={{ marginTop: 12 }}>
                <input className="input lg num" style={{ maxWidth: 160, textAlign: 'center', letterSpacing: '.3em' }} inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••" aria-label="Arrival code" />
                <Button variant="primary" size="lg" disabled={otp.length !== 4} loading={busy === 'arrive'} onClick={() => act('arrive', () => api.post(`/jobs/${job._id}/arrive`, { otp }), 'Arrival confirmed')}>{t('arrived')}</Button>
              </div>
            </Card>
          )}

          {S === 'ARRIVED' && (
            <>
              {needsPhotos && (
                <Card>
                  <h3 className="row" style={{ '--gap': '8px' }}><Camera size={18} />{t('addBefore')}</h3>
                  <p className="small muted" style={{ marginTop: 2 }}>Required. It is your evidence if anything is disputed later.</p>
                  <div style={{ marginTop: 10 }}><PhotoUploader photos={job.photos?.before} onAdd={addPhotos('before')} label="Before" /></div>
                </Card>
              )}
              {job.route === 'warranty' ? (
                <Card className="accent">
                  <h3>Warranty rework — no charge to the customer</h3>
                  <p className="small" style={{ marginTop: 4 }}>{String(job.warranty?.originalPro) === String(job.professional) ? 'This is your earlier job. Fixing it protects your rework rate and your score.' : 'You are the replacement professional. Harmonia pays you the rate-card labour from the Assurance fund.'}</p>
                  <Button variant="primary" size="lg" block style={{ marginTop: 12 }} disabled={needsPhotos && !job.photos?.before?.length} onClick={() => act('start', () => api.post(`/jobs/${job._id}/start-rework`))}>Start the fix</Button>
                </Card>
              ) : job.quote?.status === 'pending' ? (
                <Card className="info"><div className="row"><Clock color="var(--info)" /><div><h3>{t('waitingApproval')}</h3><p className="small muted">You quoted {money(job.quote.price.total)}. The customer approves on their phone.</p></div></div></Card>
              ) : (
                <Card>
                  <h3>{job.quote?.status === 'rejected' ? 'The customer declined — revise the price' : 'Firm price, before you start'}</h3>
                  <p className="small muted" style={{ marginTop: 2 }}>No work begins until the customer approves. Changes later need a formal scope revision.</p>
                  <div style={{ marginTop: 12 }}>
                    <PriceForm job={job} initial={job.quote?.price} busy={busy === 'quote'} submitLabel={t('sendQuote')} onSubmit={(body) => act('quote', () => api.post(`/jobs/${job._id}/quote`, body), 'Sent to the customer')} />
                  </div>
                  <Button variant="ghost" block style={{ marginTop: 10 }} onClick={() => setModal('notfeasible')}>{t('notFeasible')}</Button>
                </Card>
              )}
            </>
          )}

          {S === 'IN_PROGRESS' && (
            <>
              {needsPhotos && (
                <Card>
                  <h3 className="row" style={{ '--gap': '8px' }}><Camera size={18} />{t('addAfter')}</h3>
                  <div style={{ marginTop: 10 }}><PhotoUploader photos={job.photos?.after} onAdd={addPhotos('after')} label="After" /></div>
                </Card>
              )}
              <Card className="success">
                <h3>Agreed price {money(job.agreedPrice?.total)}</h3>
                <p className="small" style={{ marginTop: 2 }}>{job.paymentMode === 'online' ? 'The customer has paid into escrow. You are paid the same day they confirm.' : 'Cash job — collect after the customer confirms.'}</p>
                <Button variant="primary" size="lg" block style={{ marginTop: 12 }} icon={CheckCircle2} disabled={needsPhotos && !job.photos?.after?.length} loading={busy === 'complete'} onClick={() => act('complete', () => api.post(`/jobs/${job._id}/complete`), 'Marked complete — waiting for the customer')}>{t('complete')}</Button>
                <Button block style={{ marginTop: 8 }} icon={AlertTriangle} onClick={() => setModal('scope')}>{t('changeScope')}</Button>
              </Card>
            </>
          )}
          {S === 'SCOPE_REVISED' && <Card className="warning"><div className="row"><Clock /><div><h3>{t('waitingApproval')}</h3><p className="small">Revised to {money(job.scopeRevisions.at(-1).price.total)}. Do not continue the extra work until approved.</p></div></div></Card>}
          {S === 'WORK_COMPLETE' && <Card className="info"><h3>Waiting for the customer to confirm</h3><p className="small" style={{ marginTop: 4 }}>If they do not respond, it confirms automatically at {dateTime(job.confirmDueAt)}.</p></Card>}
          {S === 'CUSTOMER_CONFIRMED' && job.paymentMode === 'cash' && (
            <Card className="success">
              <h3 className="row" style={{ '--gap': '8px' }}><Banknote size={18} />Collect {money((job.agreedPrice?.total || 0) + (job.priorityTip || 0))} in cash</h3>
              <p className="small" style={{ marginTop: 4 }}>The platform fee of {money(job.split?.platformFee, { exact: true })} and TDS are deducted from your next online payout.</p>
              <Button variant="primary" size="lg" block style={{ marginTop: 12 }} loading={busy === 'cash'} onClick={() => act('cash', () => api.post(`/jobs/${job._id}/cash-collected`), 'Recorded — job complete')}>{t('cashReceived')}</Button>
            </Card>
          )}
          {['PAID', 'CLOSED'].includes(S) && (
            <Card className="success">
              <h3 className="row" style={{ '--gap': '8px' }}><CheckCircle2 size={18} />{job.route === 'warranty' ? 'Warranty visit complete' : job.paymentMode === 'online' ? 'Paid to your UPI today' : 'Cash job complete'}</h3>
              {job.tipsTotal > 0 && <p className="small" style={{ marginTop: 4 }}><Star size={13} /> The customer tipped {money(job.tipsTotal)} — zero commission, already on its way.</p>}
            </Card>
          )}
          {['PAID', 'CLOSED', 'CUSTOMER_CONFIRMED', 'DISPUTED'].includes(S) && !job.ratings?.mine && <RateCustomer job={job} meta={meta.data} act={act} />}
          {job.dispute && (
            <Card className={job.dispute.status === 'open' ? 'warning' : ''}>
              <h3 className="row" style={{ '--gap': '8px' }}><Scale size={18} />Dispute {job.dispute.ref}</h3>
              {job.dispute.status === 'open' ? <p className="small" style={{ marginTop: 4 }}>Raised by the {job.dispute.raisedByRole}. Decided on evidence — photos, quotes, chat and timeline — by {dateTime(job.dispute.slaDueAt)}. The customer is not automatically right.</p>
                : <><p className="small" style={{ marginTop: 4 }}><Badge tone="brand">{labelize(job.dispute.decision?.outcome)}</Badge> {job.dispute.decision?.rationale}</p>{job.dispute.status === 'decided' && <Button size="sm" style={{ marginTop: 10 }} onClick={() => setModal('appeal')}>Appeal to a different reviewer</Button>}</>}
            </Card>
          )}
        </div>

        <div className="stack sticky">
          <Card>
            <h3>Your earnings on this job</h3>
            <div style={{ marginTop: 10 }}>{job.split ? <PriceBreakdown price={job.agreedPrice} split={job.split} priorityTip={job.priorityTip} forPro /> : <p className="small muted">Shown once the firm price is agreed. Rate card: {money(job.priceBand?.min)}{job.priceBand?.max > job.priceBand?.min ? ` – ${money(job.priceBand.max)}` : ''}.</p>}</div>
          </Card>
          {['ASSIGNED', 'EN_ROUTE'].includes(S) && (
            <Card className="soft">
              <p className="small muted">Cancelling after accepting lowers your reliability score. Declining an offer never does.</p>
              <Button block style={{ marginTop: 10 }} onClick={() => setModal('cancel')}>Cancel this job</Button>
            </Card>
          )}
          {['ARRIVED', 'IN_PROGRESS', 'WORK_COMPLETE', 'CUSTOMER_CONFIRMED', 'PAID', 'CLOSED'].includes(S) && !job.dispute && <Button variant="ghost" icon={Scale} onClick={() => setModal('dispute')}>Raise an issue</Button>}
          <Card><h3 style={{ marginBottom: 10 }}>Timeline</h3><Timeline events={job.timeline} /></Card>
        </div>
      </div>

      <Modal open={modal === 'scope'} onClose={() => setModal(null)} title="Revise the scope" wide>
        <Callout tone="warning">The customer must approve the new price before you continue. Verbal changes are not allowed — they are the biggest cause of disputes.</Callout>
        <div style={{ marginTop: 12 }}><PriceForm job={job} initial={job.agreedPrice} withReason busy={busy === 'scope'} submitLabel="Send revised price for approval" onSubmit={async (body) => { await act('scope', () => api.post(`/jobs/${job._id}/scope`, body), 'Sent for approval'); setModal(null); }} /></div>
      </Modal>
      <Modal open={modal === 'notfeasible'} onClose={() => setModal(null)} title="Job not possible?" footer={<Button variant="primary" disabled={(form.nf || '').length < 5} onClick={async () => { await act('nf', () => api.post(`/jobs/${job._id}/not-feasible`, { reason: form.nf })); setModal(null); }}>Confirm — charge visit only</Button>}>
        <p className="small">Only the {money(job.priceBand?.visit)} visit charge applies, as disclosed to the customer before booking.</p>
        <Field label="Why can it not be done?"><Textarea value={form.nf || ''} onChange={(e) => setForm({ ...form, nf: e.target.value })} placeholder="e.g. Needs a part only the manufacturer supplies" /></Field>
      </Modal>
      <Modal open={modal === 'cancel'} onClose={() => setModal(null)} title="Cancel this job?" footer={<Button variant="danger" disabled={(form.cr || '').length < 3} onClick={async () => { await act('cancel', () => api.post(`/jobs/${job._id}/cancel`, { reason: form.cr })); setModal(null); window.location.assign('/pro'); }}>Cancel job</Button>}>
        <Callout tone="warning">The customer gets a free replacement. This counts against your reliability.</Callout>
        <Field label="Reason (the customer sees this)"><Input value={form.cr || ''} onChange={(e) => setForm({ ...form, cr: e.target.value })} /></Field>
      </Modal>
      <Modal open={modal === 'dispute'} onClose={() => setModal(null)} title="Raise an issue" footer={<Button variant="primary" disabled={!form.dr || (form.dt || '').length < 10} onClick={async () => { await act('dispute', () => api.post(`/jobs/${job._id}/dispute`, { reason: form.dr, description: form.dt }), 'Raised — decided within 72 hours'); setModal(null); }}>Submit</Button>}>
        <p className="small">Disputes are decided on evidence under a symmetric policy. Your photos and the approved quotes protect you.</p>
        <Field label="Issue"><Select value={form.dr || ''} onChange={(e) => setForm({ ...form, dr: e.target.value })} options={[{ value: '', label: 'Choose' }, ...(meta.data?.disputeReasons || []).map((r) => ({ value: r, label: labelize(r) }))]} /></Field>
        <Field label="What happened?"><Textarea value={form.dt || ''} onChange={(e) => setForm({ ...form, dt: e.target.value })} /></Field>
      </Modal>
      <Modal open={modal === 'appeal'} onClose={() => setModal(null)} title="Appeal the decision" footer={<Button variant="primary" disabled={(form.ap || '').length < 10} onClick={async () => { await act('appeal', () => api.post(`/jobs/${job._id}/dispute/appeal`, { reason: form.ap }), 'Appeal submitted'); setModal(null); }}>Submit appeal</Button>}>
        <Field label="Why is the decision wrong?"><Textarea value={form.ap || ''} onChange={(e) => setForm({ ...form, ap: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}
