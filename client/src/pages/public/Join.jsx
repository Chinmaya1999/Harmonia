import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, Wallet, BadgeCheck, CalendarHeart } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Spinner, Empty } from '../../components/ui.jsx';
import { ProCard } from '../../components/domain.jsx';

// MIG-01/02 — an invited customer lands pre-attached to their professional.
export default function Join() {
  const { code } = useParams();
  const { data, loading, error } = useFetch(`/public/invites/${code}`);
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <div className="container page"><Empty title="Invite link not valid">Ask your professional to send a fresh link.</Empty></div>;
  const first = data.pro.displayName.split(' ')[0];

  const accept = async () => {
    if (!user) return navigate(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
    if (user.role !== 'customer') return toast({ title: 'Sign in with a customer account to join', tone: 'warning' });
    setBusy(true);
    try {
      await api.post(`/me/invites/${code}/accept`);
      toast({ title: `${first} is now on your team`, body: 'They get first refusal on your requests.', tone: 'success' });
      navigate('/app/team');
    } catch (err) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container narrow page">
      <div className="eyebrow">An invitation from your professional</div>
      <h1 style={{ marginTop: 8 }}>{first} now takes bookings through Harmonia</h1>
      <p className="muted" style={{ marginTop: 8 }}>Keep booking the person you already trust — with protection you did not have before.</p>
      <div style={{ marginTop: 18 }}><ProCard pro={data.pro} /></div>
      <Card style={{ marginTop: 12 }}>
        <div className="grid grid-2">
          {[
            [Wallet, 'Pay after the work is done', 'Your money is held safely until you confirm.'],
            [BadgeCheck, '30-day workmanship warranty', `If it fails, ${first} comes back — or we send someone — free.`],
            [ShieldCheck, 'Verified identity', 'Background-checked, with a Harmonia ID you can verify.'],
            [CalendarHeart, `${first} first, always`, 'Your requests go to them before anyone else.'],
          ].map(([Icon, t, b]) => (
            <div key={t} className="row top"><span className="cat-icon"><Icon size={18} /></span><div><div className="strong small">{t}</div><div className="tiny muted">{b}</div></div></div>
          ))}
        </div>
      </Card>
      <Button variant="primary" size="lg" block style={{ marginTop: 18 }} loading={busy} onClick={accept}>{user ? `Add ${first} to my team` : 'Sign in to join'}</Button>
    </div>
  );
}
