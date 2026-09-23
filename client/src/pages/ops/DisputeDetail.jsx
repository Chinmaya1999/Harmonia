import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, MessageSquare, FileImage, Receipt } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Button, Spinner, Badge, Field, Select, Textarea, MoneyInput, Callout } from '../../components/ui.jsx';
import { PriceBreakdown, Timeline, PhotoUploader, Rating } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, labelize, dateTime, time, toPaise } from '../../lib/format.js';

// DIS-03 — the resolution file assembles itself; DIS-08 — explainable decisions.
export default function DisputeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: d, loading, reload } = useFetch(`/admin/disputes/${id}`);
  const { busy, run } = useAction();
  const [f, setF] = useState({ outcome: '', refund: '', rationale: '', seriousConduct: false });
  const [ap, setAp] = useState({ outcome: 'upheld', rationale: '' });
  if (loading && !d) return <Spinner />;
  const e = d.evidence || {};
  const revisions = e.scopeRevisions || [];
  const agreed = [...revisions].reverse().find((r) => r.status === 'approved')?.price || (e.quote?.status === 'approved' ? e.quote.price : null);
  const tampered = d.integrity?.some((x) => !x.intact);

  return (
    <>
      <PageHead title={`Dispute ${d.ref}`} sub={`${labelize(d.reason)} · raised by the ${d.raisedByRole} (${d.raisedBy?.name}) · ${dateTime(d.createdAt)}`} back={{ to: '/ops/disputes', label: 'Disputes' }} actions={<Badge tone={d.status === 'open' ? 'warning' : 'success'}>{d.status}</Badge>} />
      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          <Card className="warning"><h3>Complaint</h3><p style={{ marginTop: 6 }}>{d.description}</p>{d.attachments?.length > 0 && <div style={{ marginTop: 10 }}><PhotoUploader photos={d.attachments} disabled /></div>}</Card>

          <Card>
            <h3 className="row" style={{ '--gap': '8px' }}><Receipt size={17} />Price history</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="small muted">Rate-card band at request: {money(e.request?.priceBand?.min)} – {money(e.request?.priceBand?.max)}</div>
              {e.quote?.price && <div className="card soft pad"><div className="row between small"><strong>Original quote</strong><Badge>{e.quote.status}</Badge></div><div style={{ marginTop: 6 }}><PriceBreakdown price={e.quote.price} /></div></div>}
              {revisions.map((r, i) => <div key={i} className="card soft pad"><div className="row between small"><strong>Scope revision {i + 1}</strong><Badge tone={r.status === 'approved' ? 'success' : 'warning'}>{r.status}{r.decidedAt ? ` ${time(r.decidedAt)}` : ''}</Badge></div><p className="small" style={{ margin: '4px 0 6px' }}>“{r.reason}”</p><PriceBreakdown price={r.price} /></div>)}
            </div>
          </Card>

          <Card>
            <div className="row between"><h3 className="row" style={{ '--gap': '8px' }}><FileImage size={17} />Photographs</h3>{d.integrity?.length > 0 && (tampered ? <Badge tone="danger"><ShieldAlert size={12} />Hash mismatch</Badge> : <Badge tone="success"><ShieldCheck size={12} />All files intact</Badge>)}</div>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <div><div className="tiny muted">Before</div><PhotoUploader photos={e.photos?.before || []} disabled /></div>
              <div><div className="tiny muted">After</div><PhotoUploader photos={e.photos?.after || []} disabled /></div>
            </div>
            {!e.photos?.before?.length && !e.photos?.after?.length && <p className="small muted">No photographs on file.</p>}
          </Card>

          <Card>
            <h3 className="row" style={{ '--gap': '8px' }}><MessageSquare size={17} />Chat</h3>
            <div className="stack" style={{ marginTop: 10, '--gap': '6px' }}>
              {(e.chat || []).map((m, i) => <div key={i} className="small"><Badge>{m.role}</Badge> <span className="tiny muted">{time(m.at)}</span> {m.text} {m.flags?.length > 0 && <Badge tone="warning">{m.flags.join(', ')}</Badge>}</div>)}
              {!e.chat?.length && <p className="small muted">No messages.</p>}
            </div>
          </Card>
        </div>

        <div className="stack sticky">
          <Card>
            <h3>Parties</h3>
            <dl className="kv small" style={{ marginTop: 10 }}>
              <dt>Professional</dt><dd>{e.professional?.displayName} <span className="mono tiny">{e.professional?.harmoniaId}</span></dd>
              <dt>Pro score / rating</dt><dd>{e.professional?.score?.value ?? '—'} · <Rating value={e.professional?.stats?.ratingAvg} /></dd>
              <dt>Customer</dt><dd>{e.customer?.name}</dd>
              <dt>Customer rating</dt><dd><Rating value={e.customer?.reputation?.ratingAvg} /> · {e.customer?.reputation?.upheldComplaints || 0} upheld complaints</dd>
              <dt>Held in escrow</dt><dd className="strong">{money(d.amountHeld)}</dd>
              <dt>Agreed price</dt><dd>{money(agreed?.total)}</dd>
            </dl>
          </Card>

          {d.status === 'open' && (
            <Card className="info">
              <h3>Decide</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                <Field label="Outcome"><Select value={f.outcome} onChange={(ev) => setF({ ...f, outcome: ev.target.value })} options={[{ value: '', label: 'Choose' }, { value: 'favour_pro', label: 'In favour of the professional' }, { value: 'favour_customer', label: 'In favour of the customer' }, { value: 'split', label: 'Split — partial refund' }, { value: 'no_fault', label: 'No fault — release as agreed' }]} /></Field>
                {['favour_customer', 'split'].includes(f.outcome) && <Field label="Refund to customer" hint={`Up to ${money(agreed?.total)}. Leave empty for a full refund.`}><MoneyInput value={f.refund} onChange={(v) => setF({ ...f, refund: v })} /></Field>}
                <Field label="Rationale (both parties see this)" hint="Decisions must be explainable. Cite the evidence."><Textarea value={f.rationale} onChange={(ev) => setF({ ...f, rationale: ev.target.value })} /></Field>
                <label className="check"><input type="checkbox" checked={f.seriousConduct} onChange={(ev) => setF({ ...f, seriousConduct: ev.target.checked })} />Serious conduct issue</label>
                <Button variant="primary" loading={busy === 'decide'} disabled={!f.outcome || f.rationale.length < 10} onClick={() => run('decide', () => api.post(`/admin/disputes/${d._id}/decide`, { outcome: f.outcome, refundPaise: f.refund ? toPaise(f.refund) : undefined, rationale: f.rationale, seriousConduct: f.seriousConduct }), { success: 'Decision recorded — both parties notified' }).then(() => reload({ silent: true }))}>Record decision</Button>
              </div>
            </Card>
          )}
          {d.decision?.at && (
            <Card>
              <h3>Decision</h3>
              <div className="row wrap" style={{ marginTop: 8 }}><Badge tone="brand">{labelize(d.decision.outcome)}</Badge>{d.decision.refundPaise > 0 && <Badge tone="success">Refund {money(d.decision.refundPaise)}</Badge>}</div>
              <p className="small" style={{ marginTop: 8 }}>{d.decision.rationale}</p>
              <p className="tiny muted">{dateTime(d.decision.at)}</p>
            </Card>
          )}
          {d.status === 'appealed' && (
            <Card className="warning">
              <h3>Appeal</h3>
              <p className="small" style={{ marginTop: 6 }}>“{d.appeal.reason}”</p>
              {String(d.decision.decidedBy) === String(user._id) ? <Callout tone="warning">You made the original decision. A different reviewer must hear the appeal.</Callout> : (
                <div className="stack" style={{ marginTop: 10 }}>
                  <Select value={ap.outcome} onChange={(ev) => setAp({ ...ap, outcome: ev.target.value })} options={[{ value: 'upheld', label: 'Uphold original decision' }, { value: 'overturned', label: 'Overturn' }]} />
                  <Textarea value={ap.rationale} onChange={(ev) => setAp({ ...ap, rationale: ev.target.value })} placeholder="Rationale" />
                  <Button variant="primary" disabled={ap.rationale.length < 10} onClick={() => run('appeal', () => api.post(`/admin/disputes/${d._id}/appeal`, ap), { success: 'Appeal decided' }).then(() => reload({ silent: true }))}>Decide appeal</Button>
                </div>
              )}
            </Card>
          )}
          <Card><h3 style={{ marginBottom: 10 }}>Job timeline</h3><Timeline events={e.timeline || []} /></Card>
        </div>
      </div>
    </>
  );
}
