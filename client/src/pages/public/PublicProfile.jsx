import { Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Circle, Printer, ShieldCheck, Star, Award, FileCheck2, UserCheck, Activity, Share2 } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Badge, Spinner, Empty, Button, Meter } from '../../components/ui.jsx';
import { Avatar, TierBadge, ScoreRing, Rating } from '../../components/domain.jsx';
import { date, labelize } from '../../lib/format.js';
import { useToast } from '../../context/ToastContext.jsx';

// SKP-02 — every claim carries a provenance marker.
const PROVENANCE = {
  self_declared: { label: 'Self-declared', tone: '', icon: Circle },
  platform_assessed: { label: 'Platform-assessed', tone: 'brand', icon: UserCheck },
  document_verified: { label: 'Document-verified', tone: 'info', icon: FileCheck2 },
  performance_derived: { label: 'Performance-derived', tone: 'accent', icon: Activity },
};

export function ProvenanceBadge({ p }) {
  const x = PROVENANCE[p] || PROVENANCE.self_declared;
  return <Badge tone={x.tone}><x.icon size={12} />{x.label}</Badge>;
}

const VERIF_LABEL = { identity: 'Identity (DigiLocker)', pan: 'PAN', address: 'Address', bank: 'Bank account name match', background: 'Police background check', references: 'Work references', licence: 'Professional licence' };

export default function PublicProfile() {
  const { hid } = useParams();
  const { data: p, loading, error } = useFetch(`/public/pros/${hid}`);
  const toast = useToast();
  if (loading) return <Spinner />;
  if (error || !p) return <div className="container page"><Empty title="Profile not found">No professional holds the Harmonia ID {hid}.</Empty></div>;
  const url = `${window.location.origin}/p/${p.harmoniaId}`;
  const share = async () => {
    const shareUrl = `${window.location.origin}/share/p/${p.harmoniaId}`;
    if (navigator.share) await navigator.share({ title: `${p.displayName} on Harmonia`, url: shareUrl }).catch(() => {});
    else { await navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied', tone: 'success' }); }
  };

  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      {p.suspended && <Card className="danger" style={{ marginBottom: 16 }}><strong>This professional is currently not taking jobs on Harmonia.</strong></Card>}
      <Card pad="lg">
        <div className="row top wrap" style={{ '--gap': '24px' }}>
          <Avatar name={p.displayName} src={p.photoUrl} size="xl" />
          <div className="grow stack" style={{ '--gap': '8px', minWidth: 240 }}>
            <div className="eyebrow">Harmonia Skill Passport</div>
            <h1>{p.displayName}</h1>
            <div className="mono muted">{p.harmoniaId}</div>
            <div className="row wrap"><TierBadge tier={p.tier} /><Rating value={p.ratingAvg} count={p.ratingCount} /><span className="small muted">{p.jobsCompleted} verified jobs · member since {date(p.memberSince)}</span></div>
            {p.bio && <p style={{ color: 'var(--ink-2)', marginTop: 4 }}>{p.bio}</p>}
            <div className="row wrap no-print" style={{ marginTop: 8 }}>
              <Button size="sm" icon={Share2} onClick={share}>Share</Button>
              <Button size="sm" icon={Printer} onClick={() => window.print()}>Save as PDF</Button>
            </div>
          </div>
          <div className="stack center" style={{ '--gap': '6px', alignItems: 'center' }}>
            <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid var(--line)' }}><QRCodeSVG value={url} size={116} fgColor="#0d4f55" /></div>
            <span className="tiny muted">Scan to verify live</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card>
          <h3 className="row" style={{ '--gap': '8px' }}><ShieldCheck size={18} color="var(--brand-2)" />Verification</h3>
          <div className="stack" style={{ '--gap': '8px', marginTop: 12 }}>
            {p.tiers.map((t) => (
              <div key={t.level} className="row between small">
                <span className="row" style={{ '--gap': '8px', color: t.achieved ? 'var(--ink)' : 'var(--muted)' }}>{t.achieved ? <CheckCircle2 size={16} color="var(--success)" /> : <Circle size={16} />}Tier {t.level} · {t.name}</span>
                <span className="tiny muted">{t.unlocks}</span>
              </div>
            ))}
          </div>
          <hr />
          <dl className="kv small">
            {Object.entries(p.verification).filter(([, v]) => v.status !== 'not_started').map(([k, v]) => (
              <Fragment key={k}><dt>{VERIF_LABEL[k]}</dt><dd>{v.status === 'verified' ? <span style={{ color: 'var(--success)' }}>Verified {date(v.at)}</span> : labelize(v.status)}</dd></Fragment>
            ))}
          </dl>
        </Card>

        <Card>
          <div className="row between">
            <h3 className="row" style={{ '--gap': '8px' }}><Award size={18} color="var(--brand-2)" />Harmonia Score</h3>
            {p.score && <Badge tone="brand">{labelize(p.score.band)}</Badge>}
          </div>
          {p.score ? (
            <div className="row top" style={{ marginTop: 12, '--gap': '18px' }}>
              <ScoreRing value={p.score.value} />
              <div className="grow stack" style={{ '--gap': '8px' }}>
                {Object.entries(p.score.components).map(([k, c]) => (
                  <div key={k}>
                    <div className="row between tiny"><span>{c.label}</span><span className="muted">{c.weight}%</span></div>
                    <Meter value={c.value * 100} />
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="small muted" style={{ marginTop: 10 }}>Score appears after the first completed jobs.</p>}
          <hr />
          <div className="row between small"><span className="muted">Upheld serious complaints</span><strong>{p.safetyRecord.upheldSeriousComplaints}</strong></div>
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <h3>Skills</h3>
        <div className="stack divided" style={{ '--gap': '0', marginTop: 8 }}>
          {p.skills.map((s) => (
            <div key={s.category} className="row between wrap" style={{ padding: '12px 0' }}>
              <div>
                <div className="strong">{s.categoryName}</div>
                <div className="small muted">Level {s.level}/5 · {s.yearsExperience} years · <strong>{s.verifiedJobs}</strong> verified jobs on Harmonia</div>
                {s.certificates?.length > 0 && <div className="tiny muted" style={{ marginTop: 2 }}>{s.certificates.map((c) => `${c.name} (${c.issuer})`).join(' · ')}</div>}
              </div>
              <ProvenanceBadge p={s.provenance} />
            </div>
          ))}
        </div>
        {p.selfDeclaredHistory?.years > 0 && (
          <div className="callout" style={{ marginTop: 12 }}>
            <Circle size={16} />
            <div className="small"><strong>Self-declared, not verified:</strong> about {p.selfDeclaredHistory.approxJobs?.toLocaleString('en-IN')} jobs over {p.selfDeclaredHistory.years} years before joining Harmonia. Only jobs completed on Harmonia count toward the verified record.</div>
          </div>
        )}
      </Card>

      {p.reviews.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <h3 className="row" style={{ '--gap': '8px' }}><Star size={18} color="var(--accent)" />Recent reviews</h3>
          <div className="grid grid-2" style={{ marginTop: 12 }}>
            {p.reviews.map((r, i) => (
              <div key={i} className="card soft pad">
                <div className="row between"><Rating value={r.overall} /><span className="tiny muted">{date(r.at)}</span></div>
                {r.text && <p className="small" style={{ marginTop: 6 }}>“{r.text}”</p>}
                {r.response && <p className="tiny muted" style={{ marginTop: 6 }}>Response: {r.response}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="tiny muted center" style={{ marginTop: 20 }}>This record is issued by Harmonia and can be verified live at {url}. Ratings from disputes decided in the professional's favour are excluded.</p>
    </div>
  );
}
