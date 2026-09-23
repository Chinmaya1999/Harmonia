import { useParams } from 'react-router-dom';
import { useFetch, useLiveJob } from '../../hooks/useApi.js';
import { Card, Spinner, Badge, Empty } from '../../components/ui.jsx';
import { StateBadge, Timeline, PriceBreakdown, PhotoUploader } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, time, dateTime } from '../../lib/format.js';

const FEATURES = ['proximity', 'skillMatch', 'reliability', 'quality', 'availability', 'load', 'fatigue', 'tipBoost', 'newPro'];
const WAVE = ['0 · preferred', '1 · near (3 km)', '2 · extended (6 km)', '3 · broadcast', '4 · fallback'];

export default function JobDispatch() {
  const { id } = useParams();
  const { data: job, loading } = useLiveJob(id);
  const d = useFetch(`/admin/jobs/${id}/dispatch`);
  if (loading && !job) return <Spinner />;

  return (
    <>
      <PageHead title={`${job.ref} · ${job.categoryName}`} sub={`${job.jobType?.name} · ${job.customerInfo?.name} · ${job.address?.communityName}`} back={{ to: '/ops/jobs', label: 'Live jobs' }} actions={<StateBadge state={job.state} />} />
      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          <Card pad={false}>
            <div className="card-head"><h3>Dispatch audit (MTC-05)</h3><span className="small muted">{job.dispatch?.assignmentSec != null ? `Assigned in ${job.dispatch.assignmentSec}s` : `Mode: ${job.dispatch?.mode}`}</span></div>
            {d.data?.attempts?.length ? d.data.attempts.map((a) => (
              <div key={a._id} style={{ borderTop: '1px solid var(--line)' }}>
                <div className="row between" style={{ padding: '10px 18px', background: 'var(--surface-2)' }}>
                  <strong className="small">Wave {WAVE[a.wave] || a.wave}</strong>
                  <span className="tiny muted">{time(a.createdAt)} · radius {a.radiusKm ?? '—'} km · {a.candidates.length} ranked · {a.excludedCount || 0} excluded by rules · <Badge tone={a.outcome === 'accepted' ? 'success' : a.outcome === 'no_candidates' ? 'warning' : 'info'}>{a.outcome}</Badge></span>
                </div>
                {a.candidates.length > 0 && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Professional</th><th className="right">Score</th>{FEATURES.map((f) => <th key={f} className="right">{f}</th>)}<th className="right">min</th></tr></thead>
                      <tbody>
                        {a.candidates.map((c) => (
                          <tr key={c.pro}>
                            <td className="small">{c.name}{c.offered && <Badge tone="brand" style={{ marginLeft: 6 }}>offered</Badge>}</td>
                            <td className="right num strong">{c.score?.toFixed?.(3) ?? '—'}</td>
                            {FEATURES.map((f) => <td key={f} className="right num tiny">{c.features?.[f] ?? '—'}</td>)}
                            <td className="right num tiny">{c.features?.travelMin ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )) : <Empty title="No dispatch attempts logged" />}
          </Card>
          <Card pad={false}>
            <div className="card-head"><h3>Offers</h3></div>
            <div className="divided">
              {(d.data?.offers || []).map((o) => (
                <div key={o._id} className="list-item">
                  <div className="grow"><div className="small strong">{o.pro?.displayName}</div><div className="tiny muted mono">{o.pro?.harmoniaId} · wave {o.wave}</div></div>
                  <span className="tiny muted">{o.distanceKm != null ? `${o.distanceKm} km · ` : ''}earn {money(o.expectedEarning)}</span>
                  <Badge tone={o.status === 'accepted' ? 'success' : o.status === 'pending' ? 'info' : o.status === 'declined' ? 'warning' : ''}>{o.status}{o.declineReason ? ` · ${o.declineReason}` : ''}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack sticky">
          <Card>
            <h3>Money</h3>
            <div style={{ marginTop: 10 }}>{job.agreedPrice ? <PriceBreakdown price={job.agreedPrice} split={job.pricing?.gross != null ? { ...job.pricing, proReceives: (job.pricing.netToPro || 0) + (job.pricing.priorityTip || 0) } : null} priorityTip={job.priorityTip} forPro={job.pricing?.gross != null} /> : <span className="small muted">No agreed price yet.</span>}</div>
            <dl className="kv small" style={{ marginTop: 10 }}>
              <dt>Payment</dt><dd>{job.paymentMode} · {job.payment?.status}</dd>
              <dt>Escrowed / refunded</dt><dd>{money(job.payment?.escrowed)} / {money(job.payment?.refunded)}</dd>
              {job.payment?.payoutRef && <><dt>Payout ref</dt><dd className="mono tiny">{job.payment.payoutRef}</dd></>}
              <dt>Arrival OTP</dt><dd className="mono">{job.arrivalOtp || '—'}</dd>
              <dt>ETA</dt><dd>{dateTime(job.eta)}</dd>
            </dl>
          </Card>
          {(job.photos?.before?.length > 0 || job.photos?.after?.length > 0) && <Card><h3>Photos</h3><div style={{ marginTop: 8 }}><PhotoUploader photos={[...(job.photos.before || []), ...(job.photos.after || [])]} disabled /></div></Card>}
          <Card><h3 style={{ marginBottom: 10 }}>Timeline</h3><Timeline events={job.timeline} /></Card>
        </div>
      </div>
    </>
  );
}
