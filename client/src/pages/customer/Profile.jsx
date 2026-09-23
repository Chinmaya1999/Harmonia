import { useState } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Field, Input, Select, Callout } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { Rating } from '../../components/domain.jsx';
import { date } from '../../lib/format.js';

const CONSENTS = [
  { purpose: 'home_record', label: 'Keep my Home Record', body: 'Store appliances, service history and warranties for my homes. Never used for third-party marketing.' },
  { purpose: 'location', label: 'Use my location', body: 'Only to find professionals near the home I am booking for.' },
  { purpose: 'marketing_harmonia', label: 'Service reminders and offers from Harmonia', body: 'Occasional messages about service due dates. No third parties.' },
];

export default function Profile() {
  const { user, refresh } = useAuth();
  const { busy, run } = useAction();
  const [f, setF] = useState({ name: user.name || '', email: user.email || '', gender: user.gender, language: user.language });
  const active = (p) => { const c = user.consents?.find((x) => x.purpose === p); return !!c?.grantedAt && !c?.withdrawnAt; };

  return (
    <div className="container narrow page">
      <PageHead title="Profile & privacy" />
      <div className="stack" style={{ '--gap': '16px' }}>
        <Card>
          <h3>About you</h3>
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Gender" hint="Used only to honour a request for a woman professional."><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} options={[{ value: 'undisclosed', label: 'Prefer not to say' }, { value: 'female', label: 'Woman' }, { value: 'male', label: 'Man' }, { value: 'other', label: 'Other' }]} /></Field>
            <Field label="Language"><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }, { value: 'kn', label: 'ಕನ್ನಡ' }, { value: 'ta', label: 'தமிழ்' }]} /></Field>
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <span className="small muted">Mobile +91 ••••••{user.phone.slice(-4)} · member since {date(user.createdAt)}</span>
            <Button variant="primary" loading={busy === 'save'} onClick={() => run('save', async () => { await api.patch('/auth/me', f); await refresh(); }, { success: 'Saved' })}>Save</Button>
          </div>
        </Card>

        <Card>
          <h3>Your rating as a customer</h3>
          <p className="small muted" style={{ marginTop: 4 }}>Professionals rate customers too — a worker-centric platform has to. They see this before accepting.</p>
          <div className="row" style={{ marginTop: 10 }}><Rating value={user.reputation?.ratingAvg} count={user.reputation?.ratingCount} /></div>
        </Card>

        <Card>
          <h3 className="row" style={{ '--gap': '8px' }}><Lock size={17} />Your data and consent</h3>
          <p className="small muted" style={{ marginTop: 4 }}>Withdrawing is as easy as granting. Your data stays in India.</p>
          <div className="stack divided" style={{ '--gap': 0, marginTop: 8 }}>
            <div className="row between" style={{ padding: '12px 0' }}><div><div className="strong small">Deliver the services I book</div><div className="tiny muted">Required to use Harmonia.</div></div><span className="badge success">Always on</span></div>
            {CONSENTS.map((c) => (
              <label key={c.purpose} className="row between" style={{ padding: '12px 0', cursor: 'pointer' }}>
                <div><div className="strong small">{c.label}</div><div className="tiny muted">{c.body}</div></div>
                <input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--brand)' }} checked={active(c.purpose)} onChange={(e) => run('c', async () => { await api.post('/auth/consents', { purpose: c.purpose, granted: e.target.checked }); await refresh(); }, { success: e.target.checked ? 'Consent granted' : 'Consent withdrawn' })} />
              </label>
            ))}
          </div>
          <Callout icon={ShieldCheck}><span className="small">You can export the full record of any home from its page at any time.</span></Callout>
        </Card>
      </div>
    </div>
  );
}
