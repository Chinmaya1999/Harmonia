import { useState } from 'react';
import { CheckCircle2, Clock, Circle, XCircle, Lock, ShieldCheck } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Badge, Spinner, Modal, Field, Input, Select, Callout } from '../../components/ui.jsx';
import { TierBadge, PhotoUploader } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { REASON_LABEL, date, labelize } from '../../lib/format.js';

const TIERS = [
  { level: 0, name: 'Registered', checks: ['otp', 'selfie'], unlocks: 'Your permanent Harmonia ID' },
  { level: 1, name: 'Identity Verified', checks: ['pan', 'digilocker', 'address', 'bank'], unlocks: 'Scheduled jobs (appointments, IT support)' },
  { level: 2, name: 'Background Verified', checks: ['police', 'references'], unlocks: 'Instant jobs and entry into homes' },
  { level: 3, name: 'Skill Verified', checks: [], unlocks: 'Each category you are assessed in, higher priority' },
  { level: 4, name: 'Licence Verified', checks: ['licence'], unlocks: 'Regulated professions (later phase)' },
  { level: 5, name: 'Harmonia Elite', checks: [], unlocks: 'Earned by performance — premium jobs, priority' },
];
const LABEL = { otp: 'Mobile number', selfie: 'Selfie with liveness', pan: 'PAN card', digilocker: 'Identity via DigiLocker', address: 'Address proof', bank: 'Bank / UPI (name match)', police: 'Police verification', references: 'Two work references', licence: 'Professional licence' };
const HELP = {
  selfie: 'A clear photo of your face. It becomes your profile photo that customers see at the door.',
  pan: 'We check the PAN and keep only the last four characters.',
  digilocker: 'Share your identity from DigiLocker. We never ask for, see or store your Aadhaar number.',
  address: 'A utility bill, rent agreement or bank statement.',
  bank: 'We send ₹1 to confirm the account is in your name. Your earnings are paid here the same day.',
  police: 'An empanelled agency runs the check (about 5–7 days). Renewed every 2 years.',
  references: 'Two customers or employers who know your work. We call them.',
  licence: 'Only for regulated professions.',
};

function StatusIcon({ s }) {
  if (s === 'verified') return <CheckCircle2 size={20} color="var(--success)" />;
  if (s === 'submitted') return <Clock size={20} color="var(--info)" />;
  if (s === 'rejected' || s === 'expired') return <XCircle size={20} color="var(--danger)" />;
  return <Circle size={20} color="var(--line-2)" />;
}

function CheckForm({ check, onDone, onClose }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ refs: [{ name: '', phone: '', relation: '' }, { name: '', phone: '', relation: '' }], kind: 'utility_bill' });
  const submit = async () => {
    const body = {
      selfie: { documentUrl: f.photo?.url },
      pan: { pan: f.pan },
      digilocker: { consent: true },
      address: { documentUrl: f.photo?.url, kind: f.kind },
      bank: { upiOrAccount: f.upi, ifsc: f.ifsc || undefined },
      police: { consent: true },
      references: { refs: f.refs },
      licence: { body: f.body, number: f.number },
    }[check];
    const r = await run('submit', () => api.post(`/pro/verification/${check}`, body), { success: 'Submitted' });
    if (r) onDone();
  };
  return (
    <Modal open onClose={onClose} title={LABEL[check]} footer={<Button variant="primary" loading={busy === 'submit'} onClick={submit}>{check === 'digilocker' ? 'Continue with DigiLocker' : check === 'police' ? 'I consent — start the check' : 'Submit'}</Button>}>
      <div className="stack">
        <p className="small">{HELP[check]}</p>
        {['selfie', 'address'].includes(check) && <PhotoUploader photos={f.photo ? [f.photo] : []} max={1} label={check === 'selfie' ? 'Take selfie' : 'Upload'} onAdd={(u) => setF({ ...f, photo: u[0] })} />}
        {check === 'address' && <Field label="Document type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'utility_bill', label: 'Utility bill' }, { value: 'rent_agreement', label: 'Rent agreement' }, { value: 'bank_statement', label: 'Bank statement' }, { value: 'other', label: 'Other' }]} /></Field>}
        {check === 'pan' && <Field label="PAN"><Input value={f.pan || ''} maxLength={10} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" /></Field>}
        {check === 'bank' && <><Field label="UPI ID or account number"><Input value={f.upi || ''} onChange={(e) => setF({ ...f, upi: e.target.value })} placeholder="name@okaxis" /></Field><Field label="IFSC (for bank account)"><Input value={f.ifsc || ''} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} /></Field></>}
        {check === 'digilocker' && <Callout icon={Lock}>You will be asked to approve sharing on DigiLocker. Harmonia receives a verification result and reference only.</Callout>}
        {check === 'references' && f.refs.map((r, i) => (
          <div key={i} className="grid grid-3">
            <Field label={`Reference ${i + 1} name`}><Input value={r.name} onChange={(e) => setF({ ...f, refs: f.refs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></Field>
            <Field label="Mobile"><Input inputMode="numeric" maxLength={10} value={r.phone} onChange={(e) => setF({ ...f, refs: f.refs.map((x, j) => (j === i ? { ...x, phone: e.target.value.replace(/\D/g, '') } : x)) })} /></Field>
            <Field label="How they know you"><Input value={r.relation} onChange={(e) => setF({ ...f, refs: f.refs.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)) })} placeholder="Customer" /></Field>
          </div>
        ))}
        {check === 'licence' && <div className="grid grid-2"><Field label="Issuing body"><Input value={f.body || ''} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field><Field label="Registration number"><Input value={f.number || ''} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field></div>}
      </div>
    </Modal>
  );
}

export default function Verification() {
  const { data, loading, reload } = useFetch('/pro/me');
  const [open, setOpen] = useState(null);
  if (loading && !data) return <Spinner />;
  const { pro, eligibility } = data;
  const verifiedSkill = pro.skills.some((s) => s.status === 'verified' && s.provenance !== 'self_declared');

  return (
    <div className="container page">
      <PageHead title="Verification" sub="Graded and honest: each tier means something specific, and customers see exactly which one you hold." actions={<TierBadge tier={pro.tier} />} />
      <div className="split">
        <div className="stack" style={{ '--gap': '14px' }}>
          {TIERS.map((t) => {
            const achieved = pro.tier >= t.level;
            const current = pro.tier + 1 === t.level;
            return (
              <Card key={t.level} className={current ? 'info' : ''} style={{ opacity: !achieved && !current && t.level > pro.tier + 1 ? 0.7 : 1 }}>
                <div className="row between wrap">
                  <div><div className="row" style={{ '--gap': '8px' }}><TierBadge tier={t.level} compact /><h3>Tier {t.level} · {t.name}</h3></div><div className="small muted" style={{ marginTop: 2 }}>Unlocks: {t.unlocks}</div></div>
                  {achieved ? <Badge tone="success"><ShieldCheck size={12} />Achieved</Badge> : current ? <Badge tone="info">Next step</Badge> : null}
                </div>
                {t.checks.length > 0 && (
                  <div className="stack divided" style={{ '--gap': 0, marginTop: 10 }}>
                    {t.checks.map((k) => {
                      const c = pro.checks?.[k] || {};
                      const canSubmit = k !== 'otp' && ['not_started', 'rejected', 'expired'].includes(c.status || 'not_started');
                      return (
                        <div key={k} className="row" style={{ padding: '10px 0' }}>
                          <StatusIcon s={c.status} />
                          <div className="grow">
                            <div className="strong small">{LABEL[k]}</div>
                            <div className="tiny muted">{c.status === 'verified' ? `Verified ${date(c.verifiedAt)}${c.expiresAt ? ` · renew by ${date(c.expiresAt)}` : ''}` : c.status === 'submitted' ? 'Under review' : c.status === 'rejected' ? `Needs another look${c.note ? `: ${c.note}` : ''}` : c.status === 'expired' ? 'Expired — please renew' : 'Not started'}</div>
                          </div>
                          {canSubmit && <Button size="sm" variant={current ? 'primary' : ''} onClick={() => setOpen(k)}>{c.status === 'not_started' || !c.status ? 'Start' : 'Resubmit'}</Button>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {t.level === 3 && <p className="small" style={{ marginTop: 8 }}>{verifiedSkill ? <><CheckCircle2 size={14} color="var(--success)" /> At least one skill is assessed.</> : <>Add a skill on your <a href="/pro/passport">Skill Passport</a> with a certificate, or book a practical assessment.</>}</p>}
              </Card>
            );
          })}
        </div>
        <div className="stack sticky">
          <Card>
            <h3>Where you can receive jobs</h3>
            <div className="stack divided" style={{ '--gap': 0, marginTop: 8 }}>
              {eligibility.map((e) => (
                <div key={e.code} className="row between" style={{ padding: '9px 0' }}>
                  <div><div className="small strong">{e.name}</div><div className="tiny muted">Needs tier {e.requiredTier} · {e.archetypeName}</div></div>
                  {e.reason ? <Badge tone={e.added ? 'warning' : ''}>{REASON_LABEL[e.reason] || labelize(e.reason)}</Badge> : <Badge tone="success">Receiving jobs</Badge>}
                </div>
              ))}
            </div>
          </Card>
          <Callout icon={Lock}><span className="small">Your documents are used only for verification. Aadhaar numbers are never stored.</span></Callout>
        </div>
      </div>
      {open && <CheckForm check={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload({ silent: true }); }} />}
    </div>
  );
}
