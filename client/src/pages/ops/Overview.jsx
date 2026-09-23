import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Wallet, Timer, CheckCircle2, Info } from 'lucide-react';
import { useFetch, useSocketEvent } from '../../hooks/useApi.js';
import { Card, Button, Segmented, Spinner, Stat, Meter, Badge } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

const fmt = (m) => {
  if (m.value == null) return '—';
  if (m.unit === '%') return `${m.value}%`;
  if (m.unit === 'paise/job') return money(m.value);
  return `${m.value}${m.unit ? ` ${m.unit}` : ''}`;
};
const band = (key, m) => {
  const t = m.thresholds;
  if (!t) return key === 'contribution' ? 'GO: positive · MODIFY: slightly negative · STOP: deeply negative' : '';
  if (key === 'reworkPer100') return `GO < ${t.go} · MODIFY ${t.go}–${t.stop} · STOP > ${t.stop}`;
  if (key === 'contracts') return `GO ≥ ${t.go} · MODIFY 1 · STOP 0`;
  return `GO ≥ ${t.go}% · MODIFY ${t.stop}–${t.go}% · STOP < ${t.stop}%`;
};
const secs = (s) => (s == null ? '—' : s < 90 ? `${s}s` : `${Math.round(s / 60)} min`);

export default function Overview() {
  const [days, setDays] = useState(84);
  const { data, loading, reload } = useFetch(`/admin/metrics?days=${days}`);
  const last = useRef(0);
  useSocketEvent('job:update', () => { if (Date.now() - last.current > 8000) { last.current = Date.now(); reload({ silent: true }); } });
  if (loading && !data) return <Spinner />;
  const { scorecard: sc, daily } = data;
  const verdictTone = { GO: 'success', MODIFY: 'warning', STOP: 'danger' }[sc.verdict];

  return (
    <>
      <div className="page-head">
        <div><h1>Pilot scorecard</h1><p>Judged on these numbers and nothing else. Downloads, sign-ups and traffic are not evidence.</p></div>
        <div className="row"><Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '28', label: '4 weeks' }, { value: '84', label: '12 weeks' }, { value: '180', label: '6 months' }]} /><Button icon={RefreshCw} onClick={() => reload()}>Refresh</Button></div>
      </div>

      <Card pad="lg" className={verdictTone} style={{ marginBottom: 18 }}>
        <div className="row between wrap">
          <div>
            <h4>Current verdict</h4>
            <div className="display" style={{ fontSize: 44, fontWeight: 700, color: `var(--${verdictTone})` }}>{sc.verdict}</div>
            <p className="small" style={{ maxWidth: 620, color: 'var(--ink-2)' }}>
              {sc.verdict === 'GO' && 'Build the Phase 1 product — on the specification this pilot has produced, not the one written in advance.'}
              {sc.verdict === 'MODIFY' && 'Directionally right, something specific is wrong. Change it and run another eight weeks. Do not build product to paper over a model problem.'}
              {sc.verdict === 'STOP' && 'The central hypothesis is false at this price point. Worth knowing now rather than after the build.'}
            </p>
          </div>
          <div className="stack right" style={{ '--gap': '4px' }}>
            <span className="small muted">{sc.secondary.paidJobs} paid jobs in window</span>
            {sc.secondary.paidJobs < 400 && <Badge tone="warning"><Info size={12} />Below the 400-job evidence threshold</Badge>}
          </div>
        </div>
      </Card>

      <div className="grid grid-auto" style={{ '--min': '260px' }}>
        {Object.entries(sc.metrics).map(([k, m]) => (
          <Card key={k}>
            <div className="row between top"><div className="small strong" style={{ maxWidth: 180 }}>{m.label}</div><span className={`gate ${m.gate}`}>{m.gate.replace('_', ' ')}</span></div>
            <div className="display num" style={{ fontSize: 32, marginTop: 8 }}>{fmt(m)}</div>
            {m.unit === '%' && m.value != null && <div style={{ marginTop: 6 }}><Meter value={m.value} /></div>}
            <div className="tiny muted" style={{ marginTop: 8 }}>{band(k, m)}</div>
            {m.n != null && <div className="tiny muted">n = {m.n}{k === 'proRetention90' && !m.matureCohort ? ' · no 90-day cohort yet' : ''}</div>}
            {k === 'contribution' && <div className="tiny muted">Total {money(m.total)} after welfare, gateway, warranty and goodwill costs</div>}
          </Card>
        ))}
      </div>

      <h2 style={{ margin: '28px 0 12px' }}>Today — the ten-minute review</h2>
      <div className="grid grid-4">
        <Stat label="Requested" value={daily.requested} sub={`${daily.filled} filled`} />
        <Stat label="Avg time to assign" value={secs(daily.avgAssignSec)} sub={`p50 ${secs(sc.secondary.timeToAssignP50)} · p95 ${secs(sc.secondary.timeToAssignP95)} (window)`} />
        <Stat label="Completed & settled" value={daily.settled} tone="success" />
        <Stat label="Issues raised" value={daily.issues.incidents + daily.issues.disputes + daily.issues.rework + daily.issues.noShows} sub={`${daily.issues.disputes} disputes · ${daily.issues.rework} rework · ${daily.issues.noShows} no-shows · ${daily.issues.incidents} safety`} tone={daily.issues.incidents ? 'danger' : undefined} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card pad={false}>
          <div className="card-head"><h3 className="row" style={{ '--gap': '8px' }}><AlertTriangle size={16} />Unfilled today — and why</h3><Link to="/ops/jobs" className="small">Live jobs</Link></div>
          {daily.unfilled.length ? (
            <div className="divided">{daily.unfilled.map((u) => <div key={u.ref} className="list-item"><span className="mono small">{u.ref}</span><div className="grow small">{u.category}</div><span className="small muted">{u.reason}</span></div>)}</div>
          ) : <div className="empty"><CheckCircle2 size={22} color="var(--success)" style={{ margin: '0 auto' }} /><div className="small" style={{ marginTop: 6 }}>Every request today found a professional.</div></div>}
        </Card>
        <Card>
          <h3 className="row" style={{ '--gap': '8px' }}><Wallet size={16} />Cash collected vs reconciled</h3>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Cash jobs settled today</dt><dd>{daily.cash.jobs}</dd>
            <dt>Cash collected by professionals</dt><dd>{money(daily.cash.collected)}</dd>
            <dt>Commission outstanding (all pros)</dt><dd>{money(daily.cash.outstandingCommission, { exact: true })}</dd>
            <dt>Professionals owing</dt><dd>{daily.cash.prosOwing}</dd>
          </dl>
          <Link to="/ops/ledger" className="small" style={{ display: 'inline-block', marginTop: 10 }}>Open reconciliation →</Link>
        </Card>
      </div>

      <h2 style={{ margin: '28px 0 12px' }}>Supporting metrics</h2>
      <div className="grid grid-4">
        <Stat label="Average ticket" value={money(sc.secondary.avgTicket)} />
        <Stat label="Tip attachment" value={sc.secondary.tipAttachment != null ? `${sc.secondary.tipAttachment}%` : '—'} sub={`avg tip ${money(sc.secondary.avgTip)}`} />
        <Stat label="Preferred-pro attachment" value={sc.secondary.preferredAttachment != null ? `${sc.secondary.preferredAttachment}%` : '—'} sub="of paying households" />
        <Stat label="Homes with 3+ assets" value={sc.secondary.homesWith3Assets} sub={`of ${sc.secondary.homes} homes`} />
        <Stat label="Dispute rate" value={sc.secondary.disputeRate != null ? `${sc.secondary.disputeRate}%` : '—'} sub={`avg resolution ${sc.secondary.avgResolutionHours ?? '—'} h`} />
        <Stat label="Active professionals" value={sc.secondary.activePros} sub={`${sc.secondary.jobsPerProPerDay ?? '—'} jobs / pro / day`} />
        <Stat label="Platform revenue" value={money(sc.secondary.revenue)} />
        <Stat label="Costs borne" value={money(sc.secondary.costs.reduce((a, c) => a + c.amount, 0))} sub={sc.secondary.costs.map((c) => `${c.account.split(':')[1]} ${money(c.amount)}`).join(' · ')} />
      </div>
      <p className="tiny muted" style={{ marginTop: 16 }}><Timer size={12} /> Refreshes automatically as jobs change.</p>
    </>
  );
}
