import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Download, Pencil, Trash2, CalendarClock, ShieldCheck, Wrench, AirVent, Flame, Droplets, WashingMachine, Refrigerator, Zap, Box } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Modal, Field, Input, Select, Spinner, ErrorState, Badge, Empty, Textarea } from '../../components/ui.jsx';
import { PhotoUploader } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { HomeForm } from './Homes.jsx';
import { money, date, labelize } from '../../lib/format.js';

const ASSET_ICON = { air_conditioner: AirVent, geyser: Flame, water_purifier: Droplets, washing_machine: WashingMachine, refrigerator: Refrigerator, electrical_panel: Zap, chimney: AirVent, inverter: Zap, plumbing_fixture: Droplets };
const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function AssetForm({ homeId, asset, types, onClose, onSaved }) {
  const { busy, run } = useAction();
  const [f, setF] = useState(asset ? { ...asset, installedAt: toDateInput(asset.installedAt), lastServiceAt: toDateInput(asset.lastServiceAt), warrantyExpiresAt: toDateInput(asset.warrantyExpiresAt) } : { type: 'air_conditioner', photos: [] });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = () => run('save', async () => {
    const body = { type: f.type, label: f.label, make: f.make, model: f.model, room: f.room, notes: f.notes, photos: f.photos, installedAt: f.installedAt || undefined, lastServiceAt: f.lastServiceAt || undefined, warrantyExpiresAt: f.warrantyExpiresAt || undefined };
    if (asset?._id) await api.patch(`/me/assets/${asset._id}`, body);
    else await api.post(`/me/homes/${homeId}/assets`, body);
    onSaved();
  }, { success: 'Saved to your Home Record' });
  return (
    <Modal open onClose={onClose} title={asset ? 'Edit appliance' : 'Add an appliance or fitting'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 'save'} onClick={save}>Save</Button></>}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)} options={types.map((t) => ({ value: t, label: labelize(t) }))} /></Field>
          <Field label="Name"><Input value={f.label || ''} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Bedroom AC" /></Field>
        </div>
        <div className="grid grid-3">
          <Field label="Brand"><Input value={f.make || ''} onChange={(e) => set('make', e.target.value)} /></Field>
          <Field label="Model"><Input value={f.model || ''} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label="Room"><Input value={f.room || ''} onChange={(e) => set('room', e.target.value)} /></Field>
        </div>
        <div className="grid grid-3">
          <Field label="Installed on"><Input type="date" value={f.installedAt || ''} onChange={(e) => set('installedAt', e.target.value)} /></Field>
          <Field label="Last serviced"><Input type="date" value={f.lastServiceAt || ''} onChange={(e) => set('lastServiceAt', e.target.value)} /></Field>
          <Field label="Warranty until"><Input type="date" value={f.warrantyExpiresAt || ''} onChange={(e) => set('warrantyExpiresAt', e.target.value)} /></Field>
        </div>
        <div className="field"><span className="label">Photo of the label or invoice</span><PhotoUploader photos={f.photos || []} max={4} onAdd={(u) => set('photos', [...(f.photos || []), ...u.map(({ url, sha256 }) => ({ url, sha256 }))])} /></div>
        <Field label="Notes"><Textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function HomeDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(`/me/homes/${id}`);
  const meta = useFetch('/catalogue/meta');
  const { run } = useAction();
  const [assetModal, setAssetModal] = useState(null);
  const [editHome, setEditHome] = useState(false);
  if (loading) return <Spinner />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;
  const { home, assets, records } = data;

  const exportRecord = () => run('export', () => api.download(`/me/homes/${id}/export`, `harmonia-home-${home.label.toLowerCase().replace(/\W+/g, '-')}.json`), { success: 'Home Record downloaded' });

  return (
    <div className="container page">
      <PageHead title={home.label} sub={`${home.address?.line}${home.community?.name ? ` · ${home.community.name}` : ''}`} back={{ to: '/app/homes', label: 'My Homes' }}
        actions={<><Button icon={Pencil} onClick={() => setEditHome(true)}>Edit</Button><Button icon={Download} onClick={exportRecord}>Export record</Button></>} />

      <div className="row between" style={{ marginBottom: 12 }}>
        <h2>Appliances & fittings</h2>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setAssetModal('new')}>Add</Button>
      </div>
      {assets.length ? (
        <div className="grid grid-auto" style={{ '--min': '260px' }}>
          {assets.map((a) => {
            const Icon = ASSET_ICON[a.type] || Box;
            const due = a.nextServiceDue && new Date(a.nextServiceDue);
            const overdue = due && due < new Date();
            const soon = due && !overdue && due - Date.now() < 30 * 86400000;
            return (
              <Card key={a._id}>
                <div className="row between top">
                  <div className="row"><span className="cat-icon"><Icon size={20} /></span><div><div className="strong">{a.label || labelize(a.type)}</div><div className="small muted">{[a.make, a.model].filter(Boolean).join(' ') || labelize(a.type)}{a.room ? ` · ${a.room}` : ''}</div></div></div>
                  <div className="row" style={{ '--gap': '2px' }}>
                    <button className="btn ghost icon sm" aria-label="Edit" onClick={() => setAssetModal(a)}><Pencil size={14} /></button>
                    <button className="btn ghost icon sm" aria-label="Delete" onClick={() => window.confirm('Remove this appliance from your Home Record?') && run('del', () => api.del(`/me/assets/${a._id}`)).then(() => reload({ silent: true }))}><Trash2 size={14} /></button>
                  </div>
                </div>
                <dl className="kv small" style={{ marginTop: 12 }}>
                  <dt>Last service</dt><dd>{date(a.lastServiceAt)}</dd>
                  <dt>Next service</dt><dd style={{ color: overdue ? 'var(--danger)' : soon ? 'var(--warning)' : undefined }}>{due ? date(due) : '—'}</dd>
                  {a.warrantyExpiresAt && <><dt>Warranty</dt><dd>{new Date(a.warrantyExpiresAt) > new Date() ? `until ${date(a.warrantyExpiresAt)}` : 'Expired'}</dd></>}
                </dl>
                {(overdue || soon) && <Link to="/app/book" className="btn soft sm block" style={{ marginTop: 12 }}><CalendarClock size={14} />{overdue ? 'Overdue — book a service' : 'Book a service'}</Link>}
              </Card>
            );
          })}
        </div>
      ) : <Card><Empty icon={Box} title="No appliances yet" action={<Button variant="primary" onClick={() => setAssetModal('new')}>Add the first one</Button>}>Add your AC, geyser, water purifier and so on — we will remind you before they need service.</Empty></Card>}

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>Service history</h2>
      <Card pad={false}>
        {records.length ? (
          <div className="divided">
            {records.map((r) => (
              <Link key={r._id} to={`/app/jobs/${r.job}`} className="list-item">
                <span className="cat-icon">{r.isRework ? <ShieldCheck size={18} /> : <Wrench size={18} />}</span>
                <div className="grow">
                  <div className="strong small">{r.workDone}</div>
                  <div className="tiny muted">{date(r.date)} · {r.professionalName} <span className="mono">({r.harmoniaId})</span>{r.parts?.length ? ` · ${r.parts.map((p) => p.name).join(', ')}` : ''}</div>
                </div>
                <div className="stack right" style={{ '--gap': '2px', alignItems: 'flex-end' }}>
                  <span className="small strong num">{r.isRework ? 'Free' : money(r.cost)}</span>
                  {r.warrantyExpiresAt && new Date(r.warrantyExpiresAt) > new Date() && <Badge tone="success">Warranty to {date(r.warrantyExpiresAt)}</Badge>}
                </div>
              </Link>
            ))}
          </div>
        ) : <Empty title="No jobs yet">Completed jobs appear here automatically.</Empty>}
      </Card>

      {assetModal && <AssetForm homeId={id} asset={assetModal === 'new' ? null : assetModal} types={meta.data?.assetTypes || ['air_conditioner']} onClose={() => setAssetModal(null)} onSaved={() => { setAssetModal(null); reload({ silent: true }); }} />}
      {editHome && <HomeForm initial={{ ...home, community: home.community?._id || '' }} onClose={() => setEditHome(false)} onSaved={() => { setEditHome(false); reload({ silent: true }); }} />}
    </div>
  );
}
