import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Share2, ExternalLink, Plus, AlertTriangle, CheckCircle2, CircleSlash, MessageSquareReply, Info } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Card, Button, Badge, Spinner, Modal, Field, Select, Input, Textarea, Meter, Callout } from '../../components/ui.jsx';
import { ScoreRing, TierBadge, Rating } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { ProvenanceBadge } from '../public/PublicProfile.jsx';
import { REASON_LABEL, date, labelize } from '../../lib/format.js';

function rawText(k, raw) {
  if (raw == null) return 'No data yet';
  if (k === 'reliability') return `On-time ${raw.onTime != null ? `${Math.round(raw.onTime * 100)}%` : '—'} · ${raw.cancelledAfterAccept} cancelled after accepting · ${raw.noShows} no-shows`;
  if (k === 'rework') return `${raw} warranty claims per 100 jobs`;
  if (k === 'disputes') return `${raw} decided against you`;
  if (k === 'tenure') return `${raw.jobs} jobs · ${raw.months} months`;
  return `${raw} ★ average`;
}

export default function Passport() {
  const { data, loading, reload } = useFetch('/pro/me');
  const reviews = useFetch('/pro/reviews');
  const { busy, run } = useAction();
  const toast = useToast();
  const [skillOpen, setSkillOpen] = useState(false);
  const [skill, setSkill] = useState({ category: '', level: 3, yearsExperience: 5, certName: '', issuer: 'ITI' });
  const [appeal, setAppeal] = useState('');
  const [respond, setRespond] = useState(null);
  if (loading && !data) return <Spinner />;
  const { pro, eligibility } = data;
  const publicUrl = `${window.location.origin}/p/${pro.harmoniaId}`;
  const shareUrl = `${window.location.origin}/share/p/${pro.harmoniaId}`;
  const comps = Object.entries(pro.score?.components || {});
  const waText = `My verified Harmonia work record — ${pro.stats.jobsCompleted} jobs${pro.stats.ratingAvg ? `, ${pro.stats.ratingAvg}★` : ''}. Book me directly: ${shareUrl}`;

  return (
    <div className="container page">
      <PageHead title="Your Skill Passport" sub="Your identity, verified skills and work record. It belongs to you and moves with you — across customers, employers and cities." />

      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          <Card>
            <div className="row top wrap" style={{ '--gap': '20px' }}>
              <ScoreRing value={pro.score?.value} size={120} label={labelize(pro.score?.band || 'new')} />
              <div className="grow">
                <h3>How your Harmonia Score is calculated</h3>
                <p className="small muted" style={{ marginTop: 4 }}>A weighted blend of six parts, each from 0 to 100%. Recent jobs count more. New professionals start from a fair neutral point. <strong>Declining an offer never counts. Tips never count.</strong></p>
                <div className="stack" style={{ marginTop: 14, '--gap': '12px' }}>
                  {comps.map(([k, c]) => (
                    <div key={k}>
                      <div className="row between small"><span className="strong">{c.label} <span className="muted" style={{ fontWeight: 400 }}>· {c.weight}%</span></span><span className="num">{Math.round(c.value * 100)}%</span></div>
                      <Meter value={c.value * 100} />
                      <div className="tiny muted" style={{ marginTop: 2 }}>{c.source} — {rawText(k, c.raw)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {pro.review?.flagged && (
            <Card className="warning">
              <h3 className="row" style={{ '--gap': '8px' }}><AlertTriangle size={18} />Re-assessment required</h3>
              <p className="small" style={{ marginTop: 4 }}>{pro.review.reason}</p>
              {pro.review.appeal?.status === 'open' ? <Badge tone="info" style={{ marginTop: 10 }}>Appeal under human review</Badge> : (
                <div className="stack" style={{ marginTop: 10 }}>
                  <Textarea value={appeal} onChange={(e) => setAppeal(e.target.value)} placeholder="Explain anything the numbers miss — at least 20 characters" />
                  <Button variant="primary" disabled={appeal.length < 20} onClick={() => run('appeal', () => api.post('/pro/review/appeal', { text: appeal }), { success: 'Appeal sent to a human reviewer' }).then(() => reload({ silent: true }))}>Appeal to a person</Button>
                </div>
              )}
            </Card>
          )}

          <Card>
            <div className="row between"><h3>Skills</h3><Button size="sm" icon={Plus} onClick={() => setSkillOpen(true)}>Add a skill</Button></div>
            <div className="stack divided" style={{ '--gap': 0, marginTop: 6 }}>
              {pro.skills.map((s) => {
                const e = eligibility.find((x) => x.code === s.category);
                return (
                  <div key={s.category} style={{ padding: '12px 0' }}>
                    <div className="row between wrap">
                      <div><div className="strong">{e?.name || s.category}</div><div className="small muted">Level {s.level}/5 · {s.yearsExperience} years · {pro.stats.jobsByCategory?.[s.category] || 0} verified jobs</div></div>
                      <div className="row" style={{ '--gap': '6px' }}><ProvenanceBadge p={s.provenance} /><Badge tone={s.status === 'verified' ? 'success' : s.status === 'pending' ? 'warning' : 'danger'}>{labelize(s.status)}</Badge></div>
                    </div>
                    <div className="tiny" style={{ marginTop: 4, color: e?.reason ? 'var(--warning)' : 'var(--success)' }}>
                      {e?.reason ? <><CircleSlash size={12} /> Not receiving jobs: {REASON_LABEL[e.reason] || labelize(e.reason)}</> : <><CheckCircle2 size={12} /> Receiving jobs</>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Link to="/pro/verification" className="small">Verification and eligibility →</Link>
          </Card>

          <Card>
            <h3>Reviews</h3>
            <p className="small muted" style={{ marginTop: 2 }}>You can respond publicly to each review, once.</p>
            <div className="stack divided" style={{ '--gap': 0, marginTop: 6 }}>
              {(reviews.data || []).map((r) => r.hidden ? (
                <div key={r._id} className="small muted" style={{ padding: '10px 0' }}><Info size={13} /> A rating from {date(r.createdAt)} is hidden until you rate that customer, or the window closes.</div>
              ) : (
                <div key={r._id} style={{ padding: '12px 0' }}>
                  <div className="row between"><Rating value={r.overall} /><span className="tiny muted">{date(r.createdAt)}{r.excluded && ' · excluded from score'}</span></div>
                  {r.text && <p className="small" style={{ marginTop: 4 }}>{r.text}</p>}
                  {r.response?.text ? <p className="tiny muted" style={{ marginTop: 4, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>You: {r.response.text}</p>
                    : <button className="btn ghost sm" style={{ marginTop: 4, paddingLeft: 0 }} onClick={() => setRespond({ id: r._id, text: '' })}><MessageSquareReply size={14} />Respond</button>}
                </div>
              ))}
              {!reviews.data?.length && <p className="small muted" style={{ padding: '10px 0' }}>No reviews yet.</p>}
            </div>
          </Card>
        </div>

        <div className="stack sticky">
          <Card className="center">
            <div className="mono strong">{pro.harmoniaId}</div>
            <div style={{ margin: '8px 0' }}><TierBadge tier={pro.tier} /></div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 14, display: 'inline-block', border: '1px solid var(--line)' }}><QRCodeSVG value={publicUrl} size={150} fgColor="#0d4f55" /></div>
            <p className="small muted" style={{ marginTop: 8 }}>Anyone can scan this to see your live, verified record — no app needed.</p>
            <div className="stack" style={{ marginTop: 12, '--gap': '8px' }}>
              <a className="btn primary block" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><Share2 size={16} />Share on WhatsApp</a>
              <Button block icon={Copy} onClick={async () => { await navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied', tone: 'success' }); }}>Copy link</Button>
              <Link className="btn ghost block" to={`/p/${pro.harmoniaId}`} target="_blank"><ExternalLink size={16} />Open public passport (PDF)</Link>
            </div>
          </Card>
          <Card className="soft">
            <div className="grid grid-2 center">
              <div><div className="display" style={{ fontSize: 26 }}>{pro.stats.jobsCompleted}</div><div className="tiny muted">verified jobs</div></div>
              <div><div className="display" style={{ fontSize: 26 }}>{pro.stats.preferredBy}</div><div className="tiny muted">households' teams</div></div>
            </div>
          </Card>
          <Callout><span className="small">Only jobs completed on Harmonia count toward your verified record. Work before joining shows as <em>self-declared</em>.</span></Callout>
        </div>
      </div>

      <Modal open={skillOpen} onClose={() => setSkillOpen(false)} title="Add a skill" footer={<Button variant="primary" loading={busy === 'skill'} disabled={!skill.category} onClick={async () => { const r = await run('skill', () => api.post('/pro/skills', { category: skill.category, level: Number(skill.level), yearsExperience: Number(skill.yearsExperience), certificates: skill.certName ? [{ name: skill.certName, issuer: skill.issuer }] : [] }), { success: 'Added — an assessment will be scheduled' }); if (r) { setSkillOpen(false); reload({ silent: true }); } }}>Add skill</Button>}>
        <div className="stack">
          <Field label="Category"><Select value={skill.category} onChange={(e) => setSkill({ ...skill, category: e.target.value })} options={[{ value: '', label: 'Choose' }, ...eligibility.filter((e) => !e.added).map((e) => ({ value: e.code, label: `${e.name} (${e.archetypeName})` }))]} /></Field>
          <div className="grid grid-2">
            <Field label="Your level (1–5)" hint="Self-declared until assessed"><Select value={String(skill.level)} onChange={(e) => setSkill({ ...skill, level: e.target.value })} options={['1', '2', '3', '4', '5']} /></Field>
            <Field label="Years of experience"><Input type="number" min={0} value={skill.yearsExperience} onChange={(e) => setSkill({ ...skill, yearsExperience: e.target.value })} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Certificate (optional)"><Input value={skill.certName} onChange={(e) => setSkill({ ...skill, certName: e.target.value })} placeholder="e.g. Electrician — NSQF L4" /></Field>
            <Field label="Issued by"><Select value={skill.issuer} onChange={(e) => setSkill({ ...skill, issuer: e.target.value })} options={['ITI', 'NCVET', 'NSDC', 'OEM', 'Other']} /></Field>
          </div>
          <Callout>A verified ITI / NCVET / NSDC certificate, or a short practical assessment, unlocks this category.</Callout>
        </div>
      </Modal>

      <Modal open={!!respond} onClose={() => setRespond(null)} title="Respond publicly" footer={<Button variant="primary" disabled={(respond?.text || '').length < 2} onClick={async () => { await run('resp', () => api.post(`/pro/reviews/${respond.id}/respond`, { text: respond.text }), { success: 'Response published' }); setRespond(null); reviews.reload({ silent: true }); }}>Publish</Button>}>
        <Field label="Your response" hint="You can respond once. Keep it factual and polite."><Textarea value={respond?.text || ''} maxLength={400} onChange={(e) => setRespond({ ...respond, text: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}
