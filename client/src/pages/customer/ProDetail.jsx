import { Fragment } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Heart, IdCard } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Spinner, ErrorState, Badge, Meter } from '../../components/ui.jsx';
import { Avatar, TierBadge, Rating, ScoreRing, AvailabilityDot } from '../../components/domain.jsx';
import { money, date } from '../../lib/format.js';
import { ProvenanceBadge } from '../public/PublicProfile.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(`/me/pros/${id}`);
  if (loading) return <Spinner />;
  if (error) return <div className="container page"><ErrorState error={error} onRetry={reload} /></div>;
  const { pro, categories, reviews } = data;
  const focus = params.get('category') || categories[0]?.code;

  return (
    <div className="container page">
      <button type="button" className="back btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => navigate(-1)}>← Back</button>
      <div className="split">
        <div className="stack" style={{ '--gap': '16px' }}>
          <Card pad="lg">
            <div className="row top wrap" style={{ '--gap': '20px' }}>
              <Avatar name={pro.displayName} src={pro.photoUrl} size="xl" />
              <div className="grow stack" style={{ '--gap': '8px' }}>
                <div className="row wrap"><h1 style={{ fontSize: 28 }}>{pro.displayName}</h1>{data.inTeam && <Badge tone="accent"><Heart size={12} />In your team</Badge>}</div>
                <div className="mono small muted">{pro.harmoniaId}</div>
                <div className="row wrap"><TierBadge tier={pro.tier} /><AvailabilityDot status={pro.status} /></div>
                <div className="row wrap small muted" style={{ '--gap': '14px' }}>
                  <Rating value={pro.ratingAvg} count={pro.ratingCount} />
                  <span>{pro.jobsCompleted} verified jobs</span>
                  {pro.distanceKm && <span>~{pro.distanceKm} km away</span>}
                  <span>Speaks {pro.languages?.map((l) => ({ en: 'English', hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', mr: 'Marathi' }[l] || l)).join(', ')}</span>
                </div>
                {pro.bio && <p style={{ color: 'var(--ink-2)' }}>{pro.bio}</p>}
              </div>
              <ScoreRing value={pro.score} />
            </div>
          </Card>

          <Card>
            <h3>Rated by customers on</h3>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              {[['quality', 'Work quality'], ['punctuality', 'Punctuality'], ['conduct', 'Behaviour'], ['cleanliness', 'Cleanliness'], ['priceFairness', 'Price fairness']].map(([k, l]) => (
                <div key={k}><div className="row between small"><span>{l}</span><strong className="num">{pro.dimensionAvg?.[k]?.toFixed?.(1) ?? '—'}</strong></div><Meter value={((pro.dimensionAvg?.[k] || 0) / 5) * 100} tone="accent" /></div>
              ))}
            </div>
          </Card>

          <Card>
            <h3>Reviews</h3>
            {reviews.length ? (
              <div className="stack divided" style={{ '--gap': 0, marginTop: 6 }}>
                {reviews.map((r) => (
                  <div key={r._id} style={{ padding: '12px 0' }}>
                    <div className="row between"><span className="row" style={{ '--gap': '8px' }}><Rating value={r.overall} /><span className="small strong">{r.by}</span></span><span className="tiny muted">{date(r.at)}</span></div>
                    {r.text && <p className="small" style={{ marginTop: 4 }}>{r.text}</p>}
                    {r.response?.text && <p className="tiny muted" style={{ marginTop: 4, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>{pro.displayName.split(' ')[0]}: {r.response.text}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="small muted" style={{ marginTop: 8 }}>No written reviews yet.</p>}
          </Card>
        </div>

        <div className="stack sticky">
          {categories.map((c) => (
            <Card key={c.code} className={c.code === focus ? '' : 'soft'}>
              <div className="row between"><h3>{c.name}</h3><ProvenanceBadge p={pro.skills.find((s) => s.category === c.code)?.provenance} /></div>
              <dl className="kv small" style={{ marginTop: 10 }}>
                {c.rateCard?.visitCharge > 0 && <><dt>Visit charge</dt><dd>{money(c.rateCard.visitCharge)}</dd></>}
                {c.rateCard?.jobTypes.slice(0, 4).map((j) => <Fragment key={j.code}><dt>{j.name}</dt><dd>{money(j.labour)}</dd></Fragment>)}
              </dl>
              <Link to={`/app/book/${c.code}?pro=${pro._id}`} className="btn primary block" style={{ marginTop: 12 }}>Book {pro.displayName.split(' ')[0]}</Link>
            </Card>
          ))}
          {pro.weeklySchedule?.length > 0 && (
            <Card className="soft">
              <h4>Usual hours</h4>
              <div className="small" style={{ marginTop: 8 }}>{pro.weeklySchedule.map((s) => `${DAYS[s.day]} ${s.from}–${s.to}`).join(' · ')}</div>
            </Card>
          )}
          <Link to={`/p/${pro.harmoniaId}`} className="btn ghost block"><IdCard size={16} />View public Skill Passport</Link>
        </div>
      </div>
    </div>
  );
}
