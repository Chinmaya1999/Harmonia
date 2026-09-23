import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CalendarClock, Send, IdCard, LogOut, Languages, ChevronRight, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { LANGS } from '../../lib/i18n.js';
import { Card, Button, Field, Textarea } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { Avatar, PhotoUploader } from '../../components/domain.jsx';

export default function More() {
  const { user, pro, refresh, logout } = useAuth();
  const { busy, run } = useAction();
  const [bio, setBio] = useState(pro?.bio || '');
  const links = [
    { to: '/pro/verification', icon: ShieldCheck, label: 'Verification', sub: 'Tiers, documents and where you can work' },
    { to: '/pro/availability', icon: CalendarClock, label: 'Hours and area', sub: 'Weekly hours, radius and safety rules' },
    { to: '/pro/invites', icon: Send, label: 'Bring your customers', sub: 'Invite your regular households' },
    { to: `/p/${pro?.harmoniaId}`, icon: IdCard, label: 'Public Skill Passport', sub: 'What customers and builders see' },
  ];
  return (
    <div className="container narrow page">
      <PageHead title="More" />
      <div className="stack" style={{ '--gap': '16px' }}>
        <Card pad={false}>
          <div className="divided">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="list-item">
                <span className="cat-icon"><l.icon size={18} /></span>
                <div className="grow"><div className="strong">{l.label}</div><div className="small muted">{l.sub}</div></div>
                <ChevronRight size={18} className="muted" />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="row" style={{ '--gap': '8px' }}><Languages size={18} />App language</h3>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {LANGS.map((l) => (
              <Button key={l.code} variant={user.language === l.code ? 'primary' : ''} onClick={() => run('lang', async () => { await api.patch('/auth/me', { language: l.code }); await refresh(); })}>{l.label}</Button>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="row" style={{ '--gap': '8px' }}><UserRound size={18} />Profile</h3>
          <div className="row top" style={{ marginTop: 12 }}>
            <Avatar name={pro?.displayName} src={pro?.photoUrl} size="lg" />
            <div className="grow" style={{ maxWidth: 110 }}><PhotoUploader photos={[]} max={1} label="New photo" onAdd={(u) => run('photo', async () => { await api.patch('/pro/me', { photoUrl: u[0].url }); await refresh(); }, { success: 'Photo updated' })} /></div>
          </div>
          <Field label="About you (customers see this)"><Textarea value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} /></Field>
          <Button variant="primary" style={{ marginTop: 10 }} loading={busy === 'bio'} onClick={() => run('bio', async () => { await api.patch('/pro/me', { bio }); await refresh(); }, { success: 'Saved' })}>Save</Button>
        </Card>

        <Button block icon={LogOut} onClick={logout}>Sign out</Button>
      </div>
    </div>
  );
}
