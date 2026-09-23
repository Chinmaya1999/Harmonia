import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Spinner, Badge, Modal, Field, Input, Select, MoneyInput } from '../../components/ui.jsx';
import { CategoryIcon } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, toPaise } from '../../lib/format.js';

const ARCH = { A: 'Instant on-site', B: 'Scheduled on-site', C: 'Project', D: 'Consultation', E: 'Retainer' };

export default function Catalogue() {
  const { data, loading, reload } = useFetch('/admin/categories');
  const { busy, run } = useAction();
  const [edit, setEdit] = useState(null);
  const [rc, setRc] = useState(null);
  if (loading && !data) return <Spinner />;

  const saveRules = async () => {
    await run('save', () => api.patch(`/admin/categories/${edit.code}`, {
      active: edit.active, minTier: Number(edit.minTier), warrantyDays: Number(edit.warrantyDays), minActivePros: Number(edit.minActivePros),
      commissionBps: edit.commissionPct === '' || edit.commissionPct == null ? null : Math.round(Number(edit.commissionPct) * 100),
      cancellation: { freeBeforeState: edit.cancellation.freeBeforeState, feePaise: toPaise(edit.cancelFee) }, vulnerableAccess: edit.vulnerableAccess, womanPreferenceOffered: edit.womanPreferenceOffered,
    }), { success: 'Category rules saved' });
    setEdit(null); reload({ silent: true });
  };
  const saveCard = async () => {
    await run('card', () => api.put(`/admin/categories/${rc.code}/rate-card`, { city: rc.city, visitCharge: toPaise(rc.visit), jobTypes: rc.jobTypes.map((j) => ({ code: j.code, name: j.name, labour: toPaise(j.labour), standardParts: toPaise(j.parts), durationMin: Number(j.durationMin) })) }), { success: 'Rate card published' });
    setRc(null); reload({ silent: true });
  };

  return (
    <>
      <PageHead title="Catalogue & rate cards" sub="Every category has an archetype, a minimum verification tier, a rate card, a duration, a cancellation policy and a warranty. Categories open by depth, never breadth." />
      <div className="stack">
        {data.map((c) => {
          const card = c.rateCards[0];
          return (
            <Card key={c.code}>
              <div className="row between wrap">
                <div className="row"><CategoryIcon icon={c.icon} code={c.code} /><div><div className="row wrap" style={{ '--gap': '6px' }}><strong>{c.name}</strong><Badge>{c.code}</Badge><Badge tone="brand">{c.archetype} · {ARCH[c.archetype]}</Badge>{c.collar === 'white' && <Badge tone="info">White collar</Badge>}{!c.active && <Badge tone="danger">Inactive</Badge>}</div>
                  <div className="small muted">Tier ≥ {c.minTier}{c.vulnerableAccess ? ' · vulnerable-access (tier 2 mandatory)' : ''} · {c.warrantyDays}-day warranty · commission {c.commissionBps != null ? `${c.commissionBps / 100}%` : 'archetype default'} · cancel fee {money(c.cancellation?.feePaise)}</div></div></div>
                <div className="row wrap">
                  {c.liveness && <Badge tone={c.liveness.live ? 'success' : 'warning'}>{c.liveness.live ? 'Live' : 'Not live'} · {c.liveness.eligible}/{c.minActivePros} eligible · {c.liveness.onlineNow} online</Badge>}
                  <Button size="sm" onClick={() => setEdit({ ...c, commissionPct: c.commissionBps != null ? c.commissionBps / 100 : '', cancelFee: (c.cancellation?.feePaise || 0) / 100 })}>Rules</Button>
                  <Button size="sm" variant="primary" onClick={() => setRc({ code: c.code, name: c.name, city: card?.city || 'Bengaluru', visit: (card?.visitCharge || 0) / 100, jobTypes: (card?.jobTypes || []).map((j) => ({ code: j.code, name: j.name, labour: j.labour / 100, parts: j.standardParts / 100, durationMin: j.durationMin })) })}>Rate card</Button>
                </div>
              </div>
              {card && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="table">
                    <thead><tr><th>Job type</th><th className="right">Visit</th><th className="right">Labour</th><th className="right">Std. parts</th><th className="right">Minutes</th></tr></thead>
                    <tbody>{card.jobTypes.map((j) => <tr key={j.code}><td className="small">{j.name} <span className="tiny muted mono">{j.code}</span></td><td className="right num small">{money(card.visitCharge)}</td><td className="right num small">{money(j.labour)}</td><td className="right num small">{money(j.standardParts)}</td><td className="right num small">{j.durationMin}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Rules — ${edit?.name}`} footer={<Button variant="primary" loading={busy === 'save'} onClick={saveRules}>Save</Button>}>
        {edit && <div className="stack">
          <div className="grid grid-3">
            <Field label="Minimum tier"><Select value={String(edit.minTier)} onChange={(e) => setEdit({ ...edit, minTier: e.target.value })} options={['0', '1', '2', '3', '4']} /></Field>
            <Field label="Warranty days"><Input type="number" value={edit.warrantyDays} onChange={(e) => setEdit({ ...edit, warrantyDays: e.target.value })} /></Field>
            <Field label="Min pros to go live" hint="§3.2 depth rule"><Input type="number" value={edit.minActivePros} onChange={(e) => setEdit({ ...edit, minActivePros: e.target.value })} /></Field>
          </div>
          <div className="grid grid-3">
            <Field label="Commission %" hint="Blank = archetype default"><Input type="number" step="0.5" value={edit.commissionPct} onChange={(e) => setEdit({ ...edit, commissionPct: e.target.value })} /></Field>
            <Field label="Free cancel before"><Select value={edit.cancellation.freeBeforeState} onChange={(e) => setEdit({ ...edit, cancellation: { ...edit.cancellation, freeBeforeState: e.target.value } })} options={[{ value: 'ASSIGNED', label: 'Assigned' }, { value: 'EN_ROUTE', label: 'On the way' }, { value: 'ARRIVED', label: 'Arrived' }]} /></Field>
            <Field label="Cancellation fee"><MoneyInput value={edit.cancelFee} onChange={(v) => setEdit({ ...edit, cancelFee: v })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Active</label>
          <label className="check"><input type="checkbox" checked={edit.vulnerableAccess} onChange={(e) => setEdit({ ...edit, vulnerableAccess: e.target.checked })} />Unsupervised access to children, elderly or vulnerable (forces background check)</label>
          <label className="check"><input type="checkbox" checked={edit.womanPreferenceOffered} onChange={(e) => setEdit({ ...edit, womanPreferenceOffered: e.target.checked })} />Offer "woman professional only"</label>
        </div>}
      </Modal>

      <Modal wide open={!!rc} onClose={() => setRc(null)} title={`Rate card — ${rc?.name} (${rc?.city})`} footer={<Button variant="primary" loading={busy === 'card'} onClick={saveCard}>Publish rate card</Button>}>
        {rc && <div className="stack">
          <Field label="Visit charge"><MoneyInput value={rc.visit} onChange={(v) => setRc({ ...rc, visit: v })} /></Field>
          {rc.jobTypes.map((j, i) => (
            <div key={i} className="row wrap" style={{ '--gap': '8px', alignItems: 'flex-end' }}>
              <div style={{ width: 90 }}><Field label="Code"><Input value={j.code} onChange={(e) => setRc({ ...rc, jobTypes: rc.jobTypes.map((x, k) => (k === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} /></Field></div>
              <div className="grow" style={{ minWidth: 180 }}><Field label="Name"><Input value={j.name} onChange={(e) => setRc({ ...rc, jobTypes: rc.jobTypes.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></Field></div>
              <div style={{ width: 120 }}><Field label="Labour"><MoneyInput value={j.labour} onChange={(v) => setRc({ ...rc, jobTypes: rc.jobTypes.map((x, k) => (k === i ? { ...x, labour: v } : x)) })} /></Field></div>
              <div style={{ width: 120 }}><Field label="Std parts"><MoneyInput value={j.parts} onChange={(v) => setRc({ ...rc, jobTypes: rc.jobTypes.map((x, k) => (k === i ? { ...x, parts: v } : x)) })} /></Field></div>
              <div style={{ width: 80 }}><Field label="Min"><Input type="number" value={j.durationMin} onChange={(e) => setRc({ ...rc, jobTypes: rc.jobTypes.map((x, k) => (k === i ? { ...x, durationMin: e.target.value } : x)) })} /></Field></div>
              <button className="btn ghost icon" aria-label="Remove" onClick={() => setRc({ ...rc, jobTypes: rc.jobTypes.filter((_, k) => k !== i) })}><Trash2 size={16} /></button>
            </div>
          ))}
          <Button size="sm" icon={Plus} style={{ alignSelf: 'flex-start' }} onClick={() => setRc({ ...rc, jobTypes: [...rc.jobTypes, { code: '', name: '', labour: '', parts: 0, durationMin: 60 }] })}>Add job type</Button>
        </div>}
      </Modal>
    </>
  );
}
