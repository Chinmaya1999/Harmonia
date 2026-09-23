import { useState } from 'react';
import { Building2, Plus, FileSignature } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Spinner, Badge, Modal, Field, Input, Select, MoneyInput, Meter } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, date, toPaise } from '../../lib/format.js';

const STAGES = ['prospect', 'signed', 'panel_ready', 'live', 'contracted'];
const STAGE_LABEL = { prospect: 'Prospect', signed: '1 · Association signed', panel_ready: '2 · Panel ready', live: '3 · Households live', contracted: '4 · Contracted' };

// §2.5 — the apartment community is the unit of entry, and payback per
// community is the number that makes the model fundable.
export default function Communities() {
  const { data, loading, reload } = useFetch('/admin/communities');
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState(null);
  const [f, setF] = useState({});

  if (loading && !data) return <Spinner />;
  const save = async () => {
    const body = { ...f, households: Number(f.households || 0), buildingAgeYears: f.buildingAgeYears ? Number(f.buildingAgeYears) : undefined, lat: Number(f.lat), lng: Number(f.lng), activationCostPaise: f.activationCost ? toPaise(f.activationCost) : undefined };
    delete body.activationCost;
    await run('save', () => (dlg === 'new' ? api.post('/admin/communities', body) : api.patch(`/admin/communities/${dlg._id}`, body)), { success: 'Saved' });
    setDlg(null); reload({ silent: true });
  };

  return (
    <>
      <PageHead title="Communities" sub="Sign the association → stand up the panel → win the households → convert to contracts." actions={<Button variant="primary" icon={Plus} onClick={() => { setF({ city: 'Bengaluru', state: 'Karnataka', stage: 'prospect', lat: 12.9116, lng: 77.6474 }); setDlg('new'); }}>Add community</Button>} />
      <div className="grid grid-2">
        {data.map((c) => {
          const activation = c.households ? Math.round((c.activeHouseholds / c.households) * 1000) / 10 : 0;
          const monthsLive = Math.max(1, (Date.now() - new Date(c.firstJobAt || c.createdAt)) / (30 * 86400000));
          const monthly = c.revenue / monthsLive;
          const payback = c.activationCostPaise && monthly > 0 ? (c.activationCostPaise / monthly).toFixed(1) : null;
          return (
            <Card key={c._id}>
              <div className="row between top">
                <div className="row"><span className="cat-icon"><Building2 size={20} /></span><div><div className="strong">{c.name}</div><div className="small muted">{c.locality}, {c.city} · {c.households} homes{c.buildingAgeYears ? ` · ${c.buildingAgeYears} yrs old` : ''}</div></div></div>
                <Badge tone={c.stage === 'contracted' ? 'success' : c.stage === 'live' ? 'brand' : c.stage === 'prospect' ? '' : 'info'}>{STAGE_LABEL[c.stage]}</Badge>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="row between tiny"><span>Household activation</span><span className="num">{activation}% ({c.activeHouseholds})</span></div>
                <Meter value={activation} max={25} />
                <div className="tiny muted">Model assumes 25% activation</div>
              </div>
              <dl className="kv small" style={{ marginTop: 12 }}>
                <dt>Paid jobs</dt><dd>{c.jobs}</dd>
                <dt>GMV</dt><dd>{money(c.gmv)}</dd>
                <dt>Platform revenue</dt><dd>{money(c.revenue)}</dd>
                <dt>Activation cost</dt><dd>{money(c.activationCostPaise)}</dd>
                <dt>Payback (months, at current run-rate)</dt><dd>{payback ?? '—'}</dd>
              </dl>
              {c.contracts?.length > 0 && <div className="stack" style={{ marginTop: 10, '--gap': '4px' }}>{c.contracts.map((k, i) => <div key={i} className="small"><Badge tone="success">{k.kind.toUpperCase()}</Badge> {money(k.valuePaise)} / yr · {date(k.signedAt)}{k.note ? ` · ${k.note}` : ''}</div>)}</div>}
              <div className="row wrap" style={{ marginTop: 12 }}>
                <Button size="sm" onClick={() => { setF({ ...c, lat: c.location.coordinates[1], lng: c.location.coordinates[0], activationCost: c.activationCostPaise ? c.activationCostPaise / 100 : '' }); setDlg(c); }}>Edit</Button>
                <Button size="sm" icon={FileSignature} onClick={() => { setF({ kind: 'loi', value: '', note: '' }); setDlg({ contract: c }); }}>Record contract</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={!!dlg && !dlg.contract} onClose={() => setDlg(null)} title={dlg === 'new' ? 'Add community' : 'Edit community'} footer={<Button variant="primary" loading={busy === 'save'} onClick={save}>Save</Button>}>
        <div className="stack">
          <div className="grid grid-2"><Field label="Name"><Input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Locality"><Input value={f.locality || ''} onChange={(e) => setF({ ...f, locality: e.target.value })} /></Field></div>
          <div className="grid grid-3"><Field label="City"><Input value={f.city || ''} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field><Field label="State"><Input value={f.state || ''} onChange={(e) => setF({ ...f, state: e.target.value })} /></Field><Field label="Households"><Input type="number" value={f.households || ''} onChange={(e) => setF({ ...f, households: e.target.value })} /></Field></div>
          <div className="grid grid-3"><Field label="Latitude"><Input value={f.lat ?? ''} onChange={(e) => setF({ ...f, lat: e.target.value })} /></Field><Field label="Longitude"><Input value={f.lng ?? ''} onChange={(e) => setF({ ...f, lng: e.target.value })} /></Field><Field label="Building age"><Input type="number" value={f.buildingAgeYears || ''} onChange={(e) => setF({ ...f, buildingAgeYears: e.target.value })} /></Field></div>
          <div className="grid grid-2"><Field label="Stage"><Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} /></Field><Field label="Activation cost"><MoneyInput value={f.activationCost ?? ''} onChange={(v) => setF({ ...f, activationCost: v })} /></Field></div>
        </div>
      </Modal>
      <Modal open={!!dlg?.contract} onClose={() => setDlg(null)} title={`Contract — ${dlg?.contract?.name || ''}`} footer={<Button variant="primary" loading={busy === 'k'} disabled={!f.value} onClick={async () => { await run('k', () => api.post(`/admin/communities/${dlg.contract._id}/contracts`, { kind: f.kind, valuePaise: toPaise(f.value), note: f.note || undefined }), { success: 'Contract recorded' }); setDlg(null); reload({ silent: true }); }}>Record</Button>}>
        <div className="stack">
          <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'loi', label: 'Letter of intent' }, { value: 'amc', label: 'Common-area AMC' }, { value: 'membership_pilot', label: 'Membership pilot' }]} /></Field>
          <Field label="Annual value"><MoneyInput value={f.value} onChange={(v) => setF({ ...f, value: v })} /></Field>
          <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
