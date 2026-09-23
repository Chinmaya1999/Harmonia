import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useFetch, useSocketEvent } from '../../hooks/useApi.js';
import { Card, Segmented, Spinner, Empty, Input } from '../../components/ui.jsx';
import { StateBadge } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, ago } from '../../lib/format.js';

export default function OpsJobs() {
  const [scope, setScope] = useState('open');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data, loading, reload } = useFetch(`/admin/jobs?${scope === 'open' ? 'scope=open' : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const last = useRef(0);
  useSocketEvent('job:update', () => { if (Date.now() - last.current > 3000) { last.current = Date.now(); reload({ silent: true }); } });

  return (
    <>
      <PageHead title="Live jobs & dispatch" sub="Every dispatch decision is logged with its inputs. Click a job to audit why each professional was — or was not — offered it."
        actions={<><div style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--muted)' }} /><Input style={{ paddingLeft: 34, width: 200 }} placeholder="Job ref" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Segmented value={scope} onChange={setScope} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All recent' }]} /></>} />
      <Card pad={false}>
        {loading && !data ? <Spinner /> : data?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ref</th><th>Service</th><th>Customer</th><th>Professional</th><th>Route</th><th>State</th><th className="right">Value</th><th>Updated</th></tr></thead>
              <tbody>
                {data.map((j) => (
                  <tr key={j._id} className="click" onClick={() => navigate(`/ops/jobs/${j._id}`)}>
                    <td className="mono small">{j.ref}</td>
                    <td><div className="small strong">{j.categoryName}</div><div className="tiny muted">{j.jobType?.name}</div></td>
                    <td className="small">{j.customer?.name}</td>
                    <td className="small">{j.professional ? <>{j.professional.displayName}<div className="tiny muted mono">{j.professional.harmoniaId}</div></> : <span className="muted">—</span>}</td>
                    <td className="small">{j.route}{j.dispatch?.mode === 'waves' && j.state === 'DISPATCHING' ? ` · wave ${j.dispatch.wave}` : ''}</td>
                    <td><StateBadge state={j.state} /></td>
                    <td className="right num small">{j.pricing?.gross != null ? money(j.pricing.gross) : `${money(j.priceBand?.min)}+`}</td>
                    <td className="small muted nowrap">{ago(j.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No jobs" />}
      </Card>
    </>
  );
}
