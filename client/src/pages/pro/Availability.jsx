import { useEffect, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Spinner, Field, Input, Callout } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// AVL-02 / AVL-04 / SAF-06
export default function Availability() {
  const { data, loading, reload } = useFetch('/pro/me');
  const { busy, run } = useAction();
  const [sched, setSched] = useState([]);
  const [radius, setRadius] = useState(6);
  const [r, setR] = useState({ earliest: '', latest: '', womenCustomersOnly: false });

  useEffect(() => {
    if (!data) return;
    const p = data.pro;
    setSched(DAYS.map((_, day) => { const s = p.weeklySchedule.find((x) => x.day === day); return { day, on: !!s, from: s?.from || '09:00', to: s?.to || '19:00' }; }));
    setRadius(p.radiusKm);
    setR({ earliest: p.restrictions?.earliest || '', latest: p.restrictions?.latest || '', womenCustomersOnly: !!p.restrictions?.womenCustomersOnly });
  }, [data]);

  if (loading && !data) return <Spinner />;
  const saveSchedule = () => run('sched', () => api.put('/pro/schedule', { weeklySchedule: sched.filter((s) => s.on).map(({ day, from, to }) => ({ day, from, to })), scheduleOverrides: data.pro.scheduleOverrides || [] }), { success: 'Weekly hours saved' });
  const saveRules = () => run('rules', () => api.patch('/pro/me', { radiusKm: Number(radius), restrictions: { earliest: r.earliest || null, latest: r.latest || null, womenCustomersOnly: r.womenCustomersOnly } }), { success: 'Saved' }).then(() => reload({ silent: true }));
  const setBase = () => navigator.geolocation?.getCurrentPosition((p) => run('base', () => api.patch('/pro/me', { baseLat: p.coords.latitude, baseLng: p.coords.longitude }), { success: 'Service base updated' }).then(() => reload({ silent: true })));

  return (
    <div className="container narrow page">
      <PageHead title="Hours and area" sub="You decide when and where you work. None of these settings lower your score." back={{ to: '/pro/more', label: 'More' }} />
      <div className="stack" style={{ '--gap': '16px' }}>
        <Card>
          <h3>Usual weekly hours</h3>
          <p className="small muted" style={{ marginTop: 2 }}>Used for scheduled bookings. For instant jobs, switch to Available on the Today screen.</p>
          <div className="stack" style={{ marginTop: 12, '--gap': '8px' }}>
            {sched.map((s, i) => (
              <div key={s.day} className="row wrap" style={{ '--gap': '10px' }}>
                <label className="check" style={{ width: 80 }}><input type="checkbox" checked={s.on} onChange={(e) => setSched(sched.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />{DAYS[s.day]}</label>
                <input className="input" type="time" style={{ width: 130 }} disabled={!s.on} value={s.from} onChange={(e) => setSched(sched.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} aria-label={`${DAYS[s.day]} from`} />
                <span className="muted">to</span>
                <input className="input" type="time" style={{ width: 130 }} disabled={!s.on} value={s.to} onChange={(e) => setSched(sched.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} aria-label={`${DAYS[s.day]} to`} />
              </div>
            ))}
          </div>
          <Button variant="primary" style={{ marginTop: 14 }} loading={busy === 'sched'} onClick={saveSchedule}>Save hours</Button>
        </Card>

        <Card>
          <h3>Area and safety rules</h3>
          <Field label={`Working radius: ${radius} km`} hint="You will only be offered jobs within this distance of where you are.">
            <input type="range" min={1} max={15} value={radius} onChange={(e) => setRadius(e.target.value)} style={{ accentColor: 'var(--brand)' }} />
          </Field>
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <Field label="Earliest start"><Input type="time" value={r.earliest} onChange={(e) => setR({ ...r, earliest: e.target.value })} /></Field>
            <Field label="Latest start"><Input type="time" value={r.latest} onChange={(e) => setR({ ...r, latest: e.target.value })} /></Field>
          </div>
          {data.pro.gender === 'female' && <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={r.womenCustomersOnly} onChange={(e) => setR({ ...r, womenCustomersOnly: e.target.checked })} /><span><strong>Only accept jobs from women customers</strong><br /><span className="small muted">No dispatch penalty.</span></span></label>}
          <Button variant="primary" style={{ marginTop: 14 }} loading={busy === 'rules'} onClick={saveRules}>Save rules</Button>
        </Card>

        <Card>
          <h3>Service base</h3>
          <p className="small muted" style={{ marginTop: 2 }}>Where you usually start from. Live location is only used while you are Available or on a job — never when offline.</p>
          <Button icon={LocateFixed} style={{ marginTop: 12 }} loading={busy === 'base'} onClick={setBase}>Set base to my current location</Button>
        </Card>
        <Callout><span className="small">Your fatigue limit is built in: after long days you are offered fewer jobs automatically. A worker-centric platform never optimises you into eleven-hour days.</span></Callout>
      </div>
    </div>
  );
}
