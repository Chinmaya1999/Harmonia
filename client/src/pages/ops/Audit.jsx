import { useState } from 'react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Spinner, Input, Select, Badge, Empty } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { dateTime } from '../../lib/format.js';

// NFR-09 — complete audit trail on verification, dispatch, payment and disputes.
export default function Audit() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const { data, loading } = useFetch(`/admin/audit?${new URLSearchParams({ ...(entity && { entity }), ...(action && { action }) })}`);
  return (
    <>
      <PageHead title="Audit log" sub="Append-only. Nothing here can be edited or deleted."
        actions={<><div style={{ width: 170 }}><Select value={entity} onChange={(e) => setEntity(e.target.value)} options={[{ value: '', label: 'All entities' }, 'Job', 'Professional', 'Dispute', 'Incident', 'User', 'Category', 'Config', 'Community', 'Home', 'Invite'].map((x) => (typeof x === 'string' ? { value: x, label: x } : x))} /></div>
          <Input style={{ width: 200 }} placeholder="Action contains…" value={action} onChange={(e) => setAction(e.target.value)} /></>} />
      <Card pad={false}>
        {loading && !data ? <Spinner /> : data?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Data</th></tr></thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a._id}>
                    <td className="small nowrap">{dateTime(a.createdAt)}</td>
                    <td className="small">{a.actor?.name || <span className="muted">system</span>}<div className="tiny muted">{a.actorRole}</div></td>
                    <td><Badge tone={a.action.includes('reject') || a.action.includes('suspend') ? 'warning' : ''}>{a.action}</Badge></td>
                    <td className="small">{a.entity}<div className="tiny muted mono">{String(a.entityId || '').slice(-8)}</div></td>
                    <td className="tiny mono muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.data ? JSON.stringify(a.data) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No entries" />}
      </Card>
    </>
  );
}
