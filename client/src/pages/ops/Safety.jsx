import { useState } from 'react';
import { Siren } from 'lucide-react';
import { useFetch, useAction, useSocketEvent } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Segmented, Spinner, Empty, Badge, Modal, Field, Select, Textarea } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { labelize, ago } from '../../lib/format.js';

export default function Safety() {
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch(`/admin/incidents${status ? `?status=${status}` : ''}`);
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState(null);
  const [f, setF] = useState({ resolution: 'not_upheld', notes: '', liftSuspension: false });
  useSocketEvent('incident:new', () => reload({ silent: true }));

  return (
    <>
      <PageHead title="Safety" sub="SOS alerts and complaints. Serious complaints suspend the other party immediately, pending investigation (SAF-07)." actions={<Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'Open' }, { value: 'resolved', label: 'Resolved' }]} />} />
      <Card pad={false}>
        {loading ? <Spinner /> : data?.length ? (
          <div className="divided">
            {data.map((i) => (
              <div key={i._id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span className="cat-icon" style={{ background: i.kind === 'sos' ? 'var(--danger-soft)' : undefined, color: i.kind === 'sos' ? 'var(--danger)' : undefined }}><Siren size={18} /></span>
                <div className="grow">
                  <div className="row wrap" style={{ '--gap': '6px' }}><strong>{labelize(i.kind)}</strong>{i.serious && <Badge tone="danger">Serious</Badge>}<Badge>{i.status}</Badge></div>
                  <div className="small muted">{i.job?.ref} {i.job?.categoryName} · raised by {i.raisedBy?.name || 'system'} ({i.raisedByRole}){i.against ? ` · about ${i.against.name} (${i.against.role})` : ''} · {ago(i.createdAt)}</div>
                  {i.description && <p className="small" style={{ marginTop: 4 }}>{i.description}</p>}
                  {i.location?.coordinates?.length === 2 && <a className="small" href={`https://www.google.com/maps?q=${i.location.coordinates[1]},${i.location.coordinates[0]}`} target="_blank" rel="noreferrer">Location at time of alert →</a>}
                  {i.resolution && <p className="small" style={{ marginTop: 4 }}>Resolution: {i.resolution}</p>}
                </div>
                {i.status !== 'resolved' && <Button size="sm" onClick={() => { setF({ resolution: 'not_upheld', notes: '', liftSuspension: false }); setDlg(i); }}>Resolve</Button>}
              </div>
            ))}
          </div>
        ) : <Empty icon={Siren} title="No open incidents" />}
      </Card>
      <Modal open={!!dlg} onClose={() => setDlg(null)} title="Resolve incident" footer={<Button variant="primary" loading={busy === 'r'} disabled={f.notes.length < 5} onClick={async () => { await run('r', () => api.post(`/admin/incidents/${dlg._id}/resolve`, f), { success: 'Resolved' }); setDlg(null); reload({ silent: true }); }}>Resolve</Button>}>
        <div className="stack">
          <Field label="Finding"><Select value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} options={[{ value: 'not_upheld', label: 'Not upheld' }, { value: 'upheld', label: 'Upheld' }]} /></Field>
          <Field label="Investigation notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={f.liftSuspension} onChange={(e) => setF({ ...f, liftSuspension: e.target.checked })} />Lift the precautionary suspension</label>
          {f.resolution === 'upheld' && <p className="small muted">An upheld serious complaint against a professional forces a fresh background check.</p>}
        </div>
      </Modal>
    </>
  );
}
