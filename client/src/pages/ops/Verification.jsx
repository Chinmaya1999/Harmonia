import { useState } from 'react';
import { ShieldCheck, FileText } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Spinner, Empty, Badge, Modal, Field, Input, Select, Textarea } from '../../components/ui.jsx';
import { Avatar, TierBadge } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { ago } from '../../lib/format.js';

export default function OpsVerification() {
  const { data, loading, reload } = useFetch('/admin/verification');
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState(null);
  const [f, setF] = useState({});

  const decideCheck = (pro, check, decision) => { setF({ reference: '', note: '', validMonths: check === 'police' ? 24 : '' }); setDlg({ kind: 'check', pro, check, decision }); };
  const submit = async () => {
    if (dlg.kind === 'check') await run('go', () => api.post(`/admin/pros/${dlg.pro._id}/checks/${dlg.check.check}`, { decision: dlg.decision, note: f.note || undefined, reference: f.reference || undefined, validMonths: f.validMonths ? Number(f.validMonths) : undefined }), { success: 'Recorded in the audit log' });
    if (dlg.kind === 'skill') await run('go', () => api.post(`/admin/pros/${dlg.pro._id}/skills/${dlg.skill.category}`, { decision: dlg.decision, level: Number(f.level), provenance: f.provenance, note: f.note || undefined }), { success: 'Skill decision recorded' });
    if (dlg.kind === 'appeal') await run('go', () => api.post(`/admin/pros/${dlg.pro._id}/appeal`, { decision: dlg.decision, note: f.note }), { success: 'Appeal decided' });
    setDlg(null);
    reload({ silent: true });
  };

  return (
    <>
      <PageHead title="Verification queue" sub="Every decision is written to the immutable audit log (VER-08). Police checks and licences carry an expiry and are re-run automatically." />
      {loading ? <Spinner /> : !data?.length ? <Card><Empty icon={ShieldCheck} title="Queue is clear" /></Card> : (
        <div className="stack">
          {data.map((p) => (
            <Card key={p._id}>
              <div className="row between wrap">
                <div className="row"><Avatar name={p.displayName} src={p.photoUrl} /><div><div className="strong">{p.displayName}</div><div className="tiny muted mono">{p.harmoniaId} · ••••{p.phoneLast4} · joined {ago(p.createdAt)}</div></div></div>
                <TierBadge tier={p.tier} />
              </div>
              <div className="stack divided" style={{ '--gap': 0, marginTop: 10 }}>
                {p.pendingChecks.map((c) => (
                  <div key={c.check} className="row wrap" style={{ padding: '10px 0' }}>
                    <div className="grow"><div className="small strong">{c.label}</div><div className="tiny muted">Submitted {ago(c.submittedAt)}{c.note ? ` · ${c.note}` : ''}{c.reference ? ` · ${c.reference}` : ''}</div></div>
                    {c.documentUrl && <a className="btn sm" href={c.documentUrl} target="_blank" rel="noreferrer"><FileText size={14} />Document</a>}
                    <Button size="sm" onClick={() => decideCheck(p, c, 'reject')}>Reject</Button>
                    <Button size="sm" variant="primary" onClick={() => decideCheck(p, c, 'verify')}>Verify</Button>
                  </div>
                ))}
                {p.pendingSkills.map((s) => (
                  <div key={s.category} className="row wrap" style={{ padding: '10px 0' }}>
                    <div className="grow"><div className="small strong">Skill · {s.category}</div><div className="tiny muted">Self-declared level {s.level} · {s.yearsExperience} yrs{s.certificates?.length ? ` · ${s.certificates.map((c) => `${c.name} (${c.issuer})`).join(', ')}` : ' · no certificate'}</div></div>
                    <Button size="sm" onClick={() => { setF({ note: '' }); setDlg({ kind: 'skill', pro: p, skill: s, decision: 'reject' }); }}>Reject</Button>
                    <Button size="sm" variant="primary" onClick={() => { setF({ level: s.level, provenance: s.certificates?.length ? 'document_verified' : 'platform_assessed', note: '' }); setDlg({ kind: 'skill', pro: p, skill: s, decision: 'verify' }); }}>Assess & verify</Button>
                  </div>
                ))}
                {p.appeal && (
                  <div className="row wrap" style={{ padding: '10px 0' }}>
                    <div className="grow"><div className="small strong">Score appeal <Badge tone="warning">human review</Badge></div><div className="tiny muted">{p.appeal.reason}</div><p className="small" style={{ marginTop: 4 }}>“{p.appeal.appeal?.text}”</p></div>
                    <Button size="sm" onClick={() => { setF({ note: '' }); setDlg({ kind: 'appeal', pro: p, decision: 'rejected' }); }}>Reject</Button>
                    <Button size="sm" variant="primary" onClick={() => { setF({ note: '' }); setDlg({ kind: 'appeal', pro: p, decision: 'upheld' }); }}>Uphold</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg ? `${dlg.decision === 'verify' || dlg.decision === 'upheld' ? 'Confirm' : 'Reject'} — ${dlg.pro.displayName}` : ''}
        footer={<Button variant={dlg?.decision === 'reject' || dlg?.decision === 'rejected' ? 'danger' : 'primary'} loading={busy === 'go'} disabled={(dlg?.kind === 'check' && dlg.check.check === 'police' && dlg.decision === 'verify' && !f.reference) || (dlg?.kind === 'appeal' && (f.note || '').length < 5)} onClick={submit}>Record decision</Button>}>
        {dlg?.kind === 'check' && (
          <div className="stack">
            {dlg.check.check === 'police' && dlg.decision === 'verify' && <Field label="Agency report reference" hint="Required."><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>}
            {dlg.decision === 'verify' && ['police', 'licence'].includes(dlg.check.check) && <Field label="Valid for (months)"><Input type="number" value={f.validMonths} onChange={(e) => setF({ ...f, validMonths: e.target.value })} /></Field>}
            <Field label={dlg.decision === 'reject' ? 'What needs fixing? (the professional sees this)' : 'Note (optional)'}><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
        )}
        {dlg?.kind === 'skill' && (
          <div className="stack">
            {dlg.decision === 'verify' && <div className="grid grid-2">
              <Field label="Assessed level"><Select value={String(f.level)} onChange={(e) => setF({ ...f, level: e.target.value })} options={['1', '2', '3', '4', '5']} /></Field>
              <Field label="Basis"><Select value={f.provenance} onChange={(e) => setF({ ...f, provenance: e.target.value })} options={[{ value: 'platform_assessed', label: 'Practical assessment' }, { value: 'document_verified', label: 'Certificate verified' }]} /></Field>
            </div>}
            <Field label="Assessor note"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
        )}
        {dlg?.kind === 'appeal' && <Field label="Decision note (the professional sees this)"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>}
      </Modal>
    </>
  );
}
