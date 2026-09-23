import { useState } from 'react';
import { Send, Copy, MessageCircle, Smartphone, Users, Gift } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Field, Input, Spinner, Stat, Empty, Badge, Callout } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { dateShort } from '../../lib/format.js';

// §3.8 — bring your own customers; convert unrecorded reputation into a record you own.
export default function Invites() {
  const { data, loading, reload } = useFetch('/pro/invites');
  const { busy, run } = useAction();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState(null);

  const create = async (channel) => {
    const r = await run('create', () => api.post('/pro/invites', { label: label || undefined, channel }));
    if (!r) return;
    setCreated(r);
    setLabel('');
    reload({ silent: true });
    if (channel === 'whatsapp') window.open(r.whatsapp, '_blank');
    if (channel === 'sms') window.location.href = r.sms;
  };

  return (
    <div className="container page">
      <PageHead title="Bring your customers" sub="Your regular customers can book you directly on Harmonia. Every job they book builds your verified record." back={{ to: '/pro/more', label: 'More' }} />
      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          <Card>
            <h3>Invite a customer</h3>
            <p className="small muted" style={{ marginTop: 2 }}>They join straight into your team — you get first refusal on everything they book.</p>
            <Field label="Who is this for? (only you see this)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mrs Rao, B-402" /></Field>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button variant="primary" icon={MessageCircle} loading={busy === 'create'} onClick={() => create('whatsapp')}>Send on WhatsApp</Button>
              <Button icon={Smartphone} onClick={() => create('sms')}>SMS</Button>
              <Button icon={Copy} onClick={async () => { const r = await run('create', () => api.post('/pro/invites', { label: label || undefined, channel: 'link' })); if (r) { await navigator.clipboard.writeText(r.url); setCreated(r); toast({ title: 'Invite link copied', tone: 'success' }); reload({ silent: true }); } }}>Copy link</Button>
            </div>
            {created && <div className="card soft pad" style={{ marginTop: 12 }}><div className="tiny muted">Message</div><p className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{created.shareText}</p></div>}
          </Card>

          <Card pad={false}>
            <div className="card-head"><h3>Your invites</h3></div>
            {loading ? <Spinner /> : data?.invites.length ? (
              <div className="divided">
                {data.invites.map((i) => (
                  <div key={i._id} className="list-item">
                    <span className="cat-icon"><Send size={16} /></span>
                    <div className="grow"><div className="small strong">{i.label || 'Invite link'}</div><div className="tiny muted">{dateShort(i.createdAt)} · {i.channel} · <span className="mono">{i.code}</span></div></div>
                    <div className="row wrap" style={{ '--gap': '6px' }}><Badge>{i.opens} opened</Badge><Badge tone="brand">{i.activatedCount} joined</Badge><Badge tone="success">{i.bookedCount} booked</Badge></div>
                  </div>
                ))}
              </div>
            ) : <Empty icon={Users} title="No invites yet">Start with the five households who call you most often.</Empty>}
          </Card>
        </div>

        <div className="stack sticky">
          {data && (
            <div className="grid grid-2" style={{ '--gap': '12px' }}>
              <Stat label="Joined" value={data.totals.activated} sub={`${data.totals.opened} opened`} />
              <Stat label="Rebooked" value={data.totals.rebooked} sub={`${data.totals.booked} booked once`} tone="success" />
            </div>
          )}
          <Card className="accent">
            <h3 className="row" style={{ '--gap': '8px' }}><Gift size={18} color="var(--accent)" />Fee holiday on your own customers</h3>
            <p className="small" style={{ marginTop: 6 }}>For 90 days after a customer joins through your link, Harmonia charges <strong>no platform fee</strong> on up to 10 of their jobs with you.</p>
          </Card>
          <Callout><span className="small">What you get: guaranteed same-day payment, GST-ready invoices, a job history per household, and a verified record you can show any builder or RWA. Contacts you do not invite are never stored.</span></Callout>
        </div>
      </div>
    </div>
  );
}
