import { CheckCircle2, XCircle } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Spinner, Badge, Stat, Empty } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, dateTime, labelize } from '../../lib/format.js';

// PAY-10 — double-entry, idempotent, reconciled daily.
export default function Ledger() {
  const { data, loading } = useFetch('/admin/ledger');
  if (loading && !data) return <Spinner />;
  const sumNet = (rows) => rows.reduce((a, r) => a + r.net, 0);
  return (
    <>
      <PageHead title="Ledger" sub="Harmonia never holds customer funds: money sits in the payment aggregator's escrow. Every movement is a balanced, immutable, idempotent transaction." />
      <Card className={data.trial.balanced ? 'success' : 'danger'} style={{ marginBottom: 16 }}>
        <div className="row">{data.trial.balanced ? <CheckCircle2 color="var(--success)" /> : <XCircle color="var(--danger)" />}<div><strong>Trial balance {data.trial.balanced ? 'balances' : 'DOES NOT BALANCE'}</strong><div className="small muted">{data.trial.txns} transactions · debits {money(data.trial.debit)} · credits {money(data.trial.credit)}</div></div></div>
      </Card>
      <div className="grid grid-4">
        <Stat label="Platform revenue" value={money(sumNet(data.platform.filter((r) => r.account === 'platform:revenue')))} />
        <Stat label="Costs borne" value={money(-sumNet(data.costs))} sub={data.costs.map((c) => `${c.account.split(':')[1]} ${money(-c.net)}`).join(' · ')} />
        <Stat label="Owed to government" value={money(sumNet(data.govt), { exact: true })} sub={data.govt.map((g) => `${g.account.replace('govt:', '')} ${money(g.net, { exact: true })}`).join(' · ')} />
        <Stat label="Cash commission owed" value={money(data.cashReconciliation.reduce((a, r) => a + r.owed, 0), { exact: true })} sub={`${data.cashReconciliation.length} professionals`} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card pad={false}>
          <div className="card-head"><h3>Cash reconciliation</h3></div>
          {data.cashReconciliation.length ? (
            <div className="divided">{data.cashReconciliation.map((r) => <div key={r.account} className="list-item"><div className="grow"><div className="small strong">{r.pro?.displayName}</div><div className="tiny muted mono">{r.pro?.harmoniaId}</div></div><span className="num strong">{money(r.owed, { exact: true })}</span></div>)}</div>
          ) : <Empty title="Nothing outstanding" />}
          <p className="tiny muted" style={{ padding: '10px 18px' }}>Netted automatically from each professional's next online payout.</p>
        </Card>
        <Card pad={false}>
          <div className="card-head"><h3>Recent transactions</h3></div>
          <div className="divided" style={{ maxHeight: 520, overflow: 'auto' }}>
            {data.recent.map((t) => (
              <div key={t._id} style={{ padding: '10px 18px' }}>
                <div className="row between"><Badge>{labelize(t.kind)}</Badge><span className="tiny muted">{dateTime(t.createdAt)}</span></div>
                <div className="tiny muted" style={{ margin: '4px 0' }}>{t.memo}{t.externalRef ? ` · ${t.externalRef}` : ''}</div>
                <table className="table" style={{ fontSize: 12 }}><tbody>{t.lines.map((l, i) => <tr key={i}><td className="mono" style={{ padding: '3px 0' }}>{l.account}</td><td className="right num" style={{ padding: '3px 0' }}>{l.debit ? money(l.debit, { exact: true }) : ''}</td><td className="right num" style={{ padding: '3px 0' }}>{l.credit ? money(l.credit, { exact: true }) : ''}</td></tr>)}</tbody></table>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
