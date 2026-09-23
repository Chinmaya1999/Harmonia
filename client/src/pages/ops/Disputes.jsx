import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { useFetch, useNow } from '../../hooks/useApi.js';
import { Card, Segmented, Spinner, Empty, Badge } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, labelize, ago } from '../../lib/format.js';

export default function Disputes() {
  const [status, setStatus] = useState('');
  const { data, loading } = useFetch(`/admin/disputes${status ? `?status=${status}` : ''}`);
  const navigate = useNavigate();
  const now = useNow(60000);
  return (
    <>
      <PageHead title="Disputes" sub="Published, symmetric policy. The customer is not automatically right. 72-hour SLA." actions={<Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'Needs action' }, { value: 'decided', label: 'Decided' }, { value: 'closed', label: 'Closed' }]} />} />
      <Card pad={false}>
        {loading ? <Spinner /> : data?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ref</th><th>Job</th><th>Raised by</th><th>Reason</th><th className="right">Held</th><th>SLA</th><th>Status</th></tr></thead>
              <tbody>
                {data.map((d) => {
                  const left = (new Date(d.slaDueAt) - now) / 3600000;
                  return (
                    <tr key={d._id} className="click" onClick={() => navigate(`/ops/disputes/${d._id}`)}>
                      <td className="mono small">{d.ref}</td>
                      <td className="small">{d.job?.ref}<div className="tiny muted">{d.job?.categoryName}</div></td>
                      <td className="small">{labelize(d.raisedByRole)}<div className="tiny muted">{ago(d.createdAt)}</div></td>
                      <td className="small">{labelize(d.reason)}</td>
                      <td className="right num small">{money(d.amountHeld)}</td>
                      <td>{d.status === 'open' ? <Badge tone={left < 0 ? 'danger' : left < 12 ? 'warning' : ''}>{left < 0 ? `${Math.abs(Math.round(left))}h overdue` : `${Math.round(left)}h left`}</Badge> : '—'}</td>
                      <td><Badge tone={d.status === 'open' ? 'warning' : d.status === 'appealed' ? 'info' : 'success'}>{d.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={Scale} title="No disputes here" />}
      </Card>
    </>
  );
}
