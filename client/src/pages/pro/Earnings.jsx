import { useState } from 'react';
import { Download, IndianRupee, HeartHandshake, Landmark } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Button, Segmented, Spinner, Stat, Empty, Badge, Callout } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, dateShort, dateTime } from '../../lib/format.js';

// PAY-08 — daily, weekly and monthly, per-job breakdown, downloadable.
export default function Earnings() {
  const { pro } = useAuth();
  const [days, setDays] = useState(30);
  const [bucket, setBucket] = useState('daily');
  const { data, loading } = useFetch(`/pro/earnings?days=${days}`);
  const { run, busy } = useAction();
  if (loading && !data) return <Spinner />;
  const series = [...(data?.[bucket] || [])].reverse().slice(-20);
  const max = Math.max(1, ...series.map((x) => x.net + x.tips));

  return (
    <div className="container page">
      <PageHead title="Earnings" sub="Every job is settled to your UPI the same day the customer confirms."
        actions={<>
          <Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} />
          <Button icon={Download} loading={busy === 'csv'} onClick={() => run('csv', () => api.download(`/pro/earnings?days=${days}&format=csv`, `harmonia-earnings-${pro?.harmoniaId}.csv`))}>Statement (CSV)</Button>
        </>} />

      <div className="grid grid-4">
        <Stat label="Net earnings" value={money(data.totals.net)} sub={`${data.totals.jobs} jobs`} tone="success" />
        <Stat label="Tips (zero commission)" value={money(data.totals.tips)} tone="accent" />
        <Stat label="Platform fees" value={money(data.totals.platformFees)} sub="on visit + labour only" />
        <Stat label="TDS withheld" value={money(data.totals.tds, { exact: true })} sub="claimable in your ITR" />
      </div>
      {data.totals.cashCommissionOwed > 0 && <div style={{ marginTop: 12 }}><Callout icon={IndianRupee}>{money(data.totals.cashCommissionOwed, { exact: true })} commission from cash jobs will be netted from your next online payout.</Callout></div>}

      <Card style={{ marginTop: 16 }}>
        <div className="row between wrap"><h3>Trend</h3><Segmented value={bucket} onChange={setBucket} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} /></div>
        {series.length ? (
          <div className="bar-chart" style={{ marginTop: 16 }}>
            {series.map((x) => <div key={x.key} className="b" style={{ height: `${((x.net + x.tips) / max) * 100}%` }} data-tip={`${x.key}: ${money(x.net)}${x.tips ? ` + ${money(x.tips)} tips` : ''} · ${x.jobs} jobs`} />)}
          </div>
        ) : <Empty title="No earnings in this period" />}
      </Card>

      <div className="split" style={{ marginTop: 16 }}>
        <Card pad={false}>
          <div className="card-head"><h3>Per job</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Job</th><th className="right">Customer paid</th><th className="right">Fee</th><th className="right">TDS</th><th className="right">You got</th><th className="right">Tips</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.jobId}>
                    <td className="nowrap">{dateShort(r.date)}</td>
                    <td><div className="small strong">{r.category}</div><div className="tiny muted mono">{r.ref}</div>{r.feeHoliday && <Badge tone="success">Fee holiday</Badge>}{r.mode === 'cash' && <Badge>Cash</Badge>}{r.mode === 'warranty' && <Badge tone="accent">Warranty</Badge>}</td>
                    <td className="right num">{money(r.gross)}</td>
                    <td className="right num muted">{money(r.platformFee, { exact: true })}</td>
                    <td className="right num muted">{money(r.tds, { exact: true })}</td>
                    <td className="right num strong">{money(r.net + r.priorityTip, { exact: true })}</td>
                    <td className="right num" style={{ color: 'var(--accent)' }}>{r.tips ? money(r.tips) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && <Empty title="No jobs in this period" />}
          </div>
        </Card>
        <Card pad={false}>
          <div className="card-head"><h3 className="row" style={{ '--gap': '8px' }}><Landmark size={16} />Payouts</h3></div>
          <div className="divided">
            {data.payouts.map((p, i) => (
              <div key={i} className="list-item">
                <span className="cat-icon">{p.kind === 'tip_payout' ? <HeartHandshake size={18} /> : <IndianRupee size={18} />}</span>
                <div className="grow"><div className="small strong">{p.kind === 'tip_payout' ? 'Tip' : 'Job settlement'}</div><div className="tiny muted">{dateTime(p.at)} · <span className="mono">{p.ref || 'netted'}</span></div></div>
                <span className="strong num">{money(p.amount, { exact: true })}</span>
              </div>
            ))}
            {!data.payouts.length && <Empty title="No payouts yet" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
