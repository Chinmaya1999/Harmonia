import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Ban, CheckCircle2 } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Spinner, Input, Badge, Button, Modal, Field, Textarea } from '../../components/ui.jsx';
import { Avatar, TierBadge, Rating, AvailabilityDot } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { labelize } from '../../lib/format.js';

export default function Professionals() {
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch(`/admin/pros${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState(null);
  const [reason, setReason] = useState('');

  return (
    <>
      <PageHead title="Professionals" sub="Score bands govern dispatch priority and access — transparently. Every suspension is recorded and reversible."
        actions={<div style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--muted)' }} /><Input style={{ paddingLeft: 34, width: 240 }} placeholder="Name or Harmonia ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>} />
      <Card pad={false}>
        {loading && !data ? <Spinner /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Professional</th><th>Tier</th><th>Skills</th><th className="right">Score</th><th>Rating</th><th className="right">Jobs</th><th className="right">Rework/100</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.map((p) => {
                  const rw = p.stats?.jobsCompleted ? Math.round((p.stats.reworkClaims / p.stats.jobsCompleted) * 1000) / 10 : 0;
                  return (
                    <tr key={p._id}>
                      <td><div className="row" style={{ '--gap': '10px' }}><Avatar name={p.displayName} src={p.photoUrl} size="sm" /><div><Link to={`/p/${p.harmoniaId}`} target="_blank" className="small strong">{p.displayName}</Link><div className="tiny muted mono">{p.harmoniaId}</div></div></div></td>
                      <td><TierBadge tier={p.tier} compact /></td>
                      <td className="small">{p.skills.map((s) => <Badge key={s.category} tone={s.status === 'verified' ? 'brand' : s.status === 'pending' ? 'warning' : 'danger'} style={{ marginRight: 4 }}>{s.category}</Badge>)}</td>
                      <td className="right num strong">{p.score?.value ?? '—'}<div className="tiny muted">{labelize(p.score?.band || '')}</div></td>
                      <td><Rating value={p.stats?.ratingAvg} count={p.stats?.ratingCount} /></td>
                      <td className="right num">{p.stats?.jobsCompleted || 0}</td>
                      <td className="right num" style={{ color: rw > 6 ? 'var(--danger)' : undefined }}>{rw}</td>
                      <td>{p.suspended?.active ? <Badge tone="danger">Suspended</Badge> : <AvailabilityDot status={p.status} />}{p.review?.flagged && <Badge tone="warning" style={{ marginLeft: 4 }}>Review</Badge>}</td>
                      <td><Button size="sm" variant="ghost" icon={p.suspended?.active ? CheckCircle2 : Ban} onClick={() => { setReason(''); setDlg(p); }}>{p.suspended?.active ? 'Reinstate' : 'Suspend'}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.suspended?.active ? `Reinstate ${dlg?.displayName}` : `Suspend ${dlg?.displayName}`}
        footer={<Button variant={dlg?.suspended?.active ? 'primary' : 'danger'} loading={busy === 's'} disabled={reason.length < 3} onClick={async () => { await run('s', () => api.post(`/admin/users/${dlg.user}/suspend`, { active: !dlg.suspended?.active, reason }), { success: 'Recorded' }); setDlg(null); reload({ silent: true }); }}>Confirm</Button>}>
        <Field label="Reason (the professional sees this and can appeal)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
