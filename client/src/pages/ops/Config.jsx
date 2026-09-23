import { useEffect, useState } from 'react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Spinner, Field, Input, Select, Callout } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';

const GROUPS = {
  'matching.weights': { title: 'Matching score weights (§5.2)', help: 'MatchScore = w1·Proximity + w2·SkillMatch + w3·Reliability + w4·Quality + w5·Availability − w6·Load − w7·Fatigue + bounded TipBoost + decaying NewProAllowance.', fields: { proximity: 'w1 Proximity (travel time)', skill: 'w2 Skill match', reliability: 'w3 Reliability', quality: 'w4 Quality', availability: 'w5 Availability', load: 'w6 Current load (−)', fatigue: 'w7 Fatigue (−)', tipBoostMax: 'Max tip boost', tipBoostFullAtPaise: 'Tip for full boost (paise)', newProAllowance: 'New-pro allowance', newProJobs: 'Allowance decays over N jobs' } },
  dispatch: { title: 'Dispatch waves (§5.3)', help: 'Wave 0 preferred pro → 1 near radius → 2 extended → 3 broadcast → 4 fallback. Empty waves are skipped immediately.', fields: { wave0Sec: 'Wave 0 seconds', wave1Sec: 'Wave 1 seconds', wave2Sec: 'Wave 2 seconds', wave3Sec: 'Wave 3 seconds', nearKm: 'Near radius km', extKm: 'Extended radius km', maxKm: 'Max radius km', wave1Count: 'Wave 1 offers', wave2Count: 'Wave 2 offers', namedOfferMin: 'Named booking wait (min)', warrantyOfferMin: 'Warranty first-refusal (min)', maxActiveInstantJobs: 'Max active instant jobs / pro' } },
  windows: { title: 'Windows & SLAs', fields: { autoConfirmHours: 'Auto-confirm after (h)', ratingWindowHours: 'Rating window (h)', disputeWindowDays: 'Dispute window (days)', tipWindowDays: 'Tip window (days)', noShowGraceMin: 'No-show grace (min)', etaBufferMin: 'ETA buffer (min)' } },
  payments: { title: 'Payments', help: 'Commission by archetype in basis points (1500 = 15%). Tax treatment must be confirmed with a CA before launch (§8.5).', fields: { gatewayBps: 'Gateway cost (bps)', tdsBps: 'TDS 194-O (bps)', gstBps: 'GST (bps)', tipCapPaise: 'Tip cap (paise)', tipCapPct: 'Tip cap (% of job)', feeHolidayDays: 'Fee holiday days', feeHolidayMaxJobs: 'Fee holiday max jobs', reworkPayoutPct: 'Replacement payout %' }, nested: { commissionBps: ['A', 'B', 'C', 'D', 'E'] } },
  score: { title: 'Harmonia Score', help: 'Component weights (%). Changes apply at the next recomputation and are visible to every professional.', fields: { halfLifeDays: 'Recency half-life (days)', priorJobs: 'Cold-start prior (jobs)', reviewBelow: 'Review threshold', reviewMinJobs: 'Review after N jobs' }, nested: { weights: ['quality', 'reliability', 'conduct', 'rework', 'disputes', 'tenure'] } },
};

function Group({ k, value, onSave, busy }) {
  const g = GROUPS[k];
  const [v, setV] = useState(value);
  const [scope, setScope] = useState('global');
  useEffect(() => setV(value), [value]);
  const num = (x) => (x === '' ? '' : Number(x));
  return (
    <Card>
      <h3>{g.title}</h3>
      {g.help && <p className="small muted" style={{ marginTop: 4 }}>{g.help}</p>}
      <div className="grid grid-3" style={{ marginTop: 12, '--gap': '10px' }}>
        {Object.entries(g.fields).map(([f, label]) => <Field key={f} label={label}><Input type="number" step="any" value={v[f] ?? ''} onChange={(e) => setV({ ...v, [f]: num(e.target.value) })} /></Field>)}
        {Object.entries(g.nested || {}).flatMap(([n, keys]) => keys.map((kk) => <Field key={`${n}.${kk}`} label={`${n} · ${kk}`}><Input type="number" step="any" value={v[n]?.[kk] ?? ''} onChange={(e) => setV({ ...v, [n]: { ...v[n], [kk]: num(e.target.value) } })} /></Field>))}
      </div>
      <div className="row wrap" style={{ marginTop: 14 }}>
        <div style={{ width: 240 }}><Select value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: 'global', label: 'Everywhere' }, { value: 'city:Bengaluru', label: 'Bengaluru only' }, ...['ELEC', 'PLMB', 'ACRP', 'CARP', 'DCLN'].map((c) => ({ value: `category:${c}`, label: `Category ${c} only` }))]} /></div>
        <Button variant="primary" loading={busy === k} onClick={() => onSave(k, scope, v)}>Save — no deployment needed</Button>
      </div>
    </Card>
  );
}

// MTC-02 — weights and rules configurable per city and category without a code deployment.
export default function Config() {
  const { data, loading, reload } = useFetch('/admin/config');
  const { busy, run } = useAction();
  if (loading && !data) return <Spinner />;
  const save = async (key, scope, value) => { await run(key, () => api.put(`/admin/config/${key}`, { scope, value }), { success: 'Saved and audited' }); reload({ silent: true }); };
  return (
    <>
      <PageHead title="Matching & rules" sub="Every change is audited. Scoped overrides apply on top of the global value." />
      <Callout>Declines never enter any score. Tips never enter the Harmonia Score. These are product rules, not settings.</Callout>
      <div className="stack" style={{ marginTop: 16 }}>
        {Object.keys(GROUPS).map((k) => <Group key={k} k={k} value={data.merged[k]} busy={busy} onSave={save} />)}
      </div>
      {data.overrides.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h3>Active overrides</h3>
          <div className="stack" style={{ marginTop: 8, '--gap': '4px' }}>{data.overrides.map((o) => <div key={o._id} className="small mono">{o.key} @ {o.scope}: {JSON.stringify(o.value).slice(0, 160)}</div>)}</div>
        </Card>
      )}
    </>
  );
}
