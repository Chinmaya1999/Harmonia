import { Link, useNavigate } from 'react-router-dom';
import { Zap, UserRoundCheck, ChevronRight, CalendarClock, BellRing, ShieldCheck, Plus, Clock, Wallet, House, ArrowRight } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Card, Badge, Button, Skeleton, Empty } from '../../components/ui.jsx';
import { CategoryIcon, StateBadge, Avatar, TierBadge, AssuranceStrip, ServiceCard } from '../../components/domain.jsx';
import { Tilt } from '../../components/motion.jsx';
import { money, date, ago } from '../../lib/format.js';
import { catImg, SCENES } from '../../lib/media.js';

export default function Home() {
  const { user, community } = useAuth();
  const navigate = useNavigate();
  const cats = useFetch('/catalogue/categories');
  const open = useFetch('/jobs?scope=open');
  const team = useFetch('/me/team');
  const reminders = useFetch('/me/reminders');
  const homes = useFetch('/me/homes');

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const noHome = homes.data && homes.data.length === 0;
  const live = (cats.data?.categories || []).filter((c) => c.live);
  // Most-booked shelf: the headline job type of each live category.
  const popular = live.flatMap((c) => c.jobTypes.slice(0, 2).map((j) => ({ c, j }))).slice(0, 10);

  return (
    <div className="container page">
      {noHome && (
        <Card className="info" style={{ marginBottom: 18 }}>
          <div className="row between wrap">
            <div><div className="strong">Add your home to get started</div><div className="small muted">We use it to find verified professionals near you and to keep your Home Record.</div></div>
            <Button variant="primary" icon={Plus} onClick={() => navigate('/app/homes?new=1')}>Add home</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-2" style={{ alignItems: 'center', '--gap': '32px' }}>
        <div>
          <h1 className="reveal" style={{ fontSize: 'clamp(30px, 4vw, 42px)' }}>{greet}, {user?.name?.split(' ')[0]}.<br /><span className="grad-text">What needs fixing today?</span></h1>
          <p className="muted reveal" style={{ marginTop: 8, '--d': '80ms' }}>Verified professionals in {community?.name || 'your community'}. Pay only after the work is done.</p>
          <Card className="reveal" style={{ marginTop: 20, '--d': '140ms' }}>
            <div className="row between" style={{ marginBottom: 14 }}><h3>What are you looking for?</h3><Link to="/app/browse" className="small">Browse professionals</Link></div>
            <div className="svc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
              {cats.loading && [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} h={120} />)}
              {cats.data?.categories.map((c) => (c.live ? (
                <Link key={c.code} to={`/app/book/${c.code}`} className="svc">
                  <span className="thumb"><img src={catImg(c.code)} alt="" loading="lazy" />{c.onlineNow > 0 && <span className="flag badge light"><span className="dot live" style={{ color: 'var(--success)' }} />{c.onlineNow}</span>}</span>
                  <span className="name">{c.name}</span>
                </Link>
              ) : (
                <div key={c.code} className="svc off" title={`Opens when ${c.needed} verified professionals are ready nearby (${c.eligible} so far)`}>
                  <span className="thumb"><img src={catImg(c.code)} alt="" loading="lazy" /><span className="flag badge light">Soon</span></span>
                  <span className="name">{c.name}</span>
                </div>
              )))}
            </div>
          </Card>
        </div>

        <div className="reveal hide-sm" style={{ position: 'relative', height: 480, '--d': '120ms' }}>
          <Tilt max={7} style={{ position: 'absolute', left: 0, top: 0, width: '56%', height: '62%', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <img src={catImg('ELEC')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Tilt>
          <Tilt max={7} style={{ position: 'absolute', right: 0, top: 30, width: '40%', height: '44%', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <img src={catImg('DCLN')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Tilt>
          <Tilt max={7} style={{ position: 'absolute', left: '12%', bottom: 0, width: '44%', height: '34%', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <img src={catImg('ACRP')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Tilt>
          <Tilt max={7} style={{ position: 'absolute', right: 0, bottom: 20, width: '40%', height: '40%', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
            <img src={catImg('PLMB')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Tilt>
          <div className="glass float" style={{ position: 'absolute', left: '36%', top: '52%', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', zIndex: 5 }}>
            <span className="cat-icon" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}><Wallet size={18} /></span>
            <div><div className="tiny muted">Every job</div><div className="strong small">Paid after you confirm</div></div>
          </div>
        </div>
      </div>

      {open.data?.length > 0 && (
        <div className="stack reveal" style={{ marginTop: 28 }}>
          <h4>Happening now</h4>
          {open.data.map((j) => (
            <Link key={j._id} to={`/app/jobs/${j._id}`} className="card hover" style={{ display: 'flex', overflow: 'hidden', alignItems: 'stretch' }}>
              <div style={{ width: 110, flex: 'none' }}><img src={catImg(j.category)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
              <div className="row between grow" style={{ padding: '14px 18px' }}>
                <div>
                  <div className="strong">{j.categoryName} · {j.jobType?.name}</div>
                  <div className="small muted">{j.professional ? `${j.professional.displayName} · ` : ''}{j.ref} · {ago(j.createdAt)}</div>
                </div>
                <div className="row"><StateBadge state={j.state} /><ChevronRight size={18} className="muted" /></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* §3.3 — Route 2 has equal prominence to Route 1. */}
      <div className="scroller" style={{ marginTop: 32, gridAutoColumns: 'minmax(300px, 1fr)' }}>
        <Link to="/app/book" className="banner reveal" style={{ '--tint': 'linear-gradient(100deg, rgba(17,17,20,.94), rgba(42,28,115,.75) 60%, rgba(90,62,232,.35))' }}>
          <img src={SCENES.room} alt="" />
          <Zap size={24} color="#ffb547" />
          <h3 style={{ marginTop: 8 }}>Get help now</h3>
          <p>Your preferred professional first, then the best verified match nearby.</p>
          <span className="btn white sm" style={{ alignSelf: 'flex-start', marginTop: 12 }}>Book now <ArrowRight size={14} /></span>
        </Link>
        <Link to="/app/browse" className="banner reveal" style={{ '--d': '80ms' }}>
          <img src={catImg('CARP')} alt="" />
          <UserRoundCheck size={24} color="#b3a3ff" />
          <h3 style={{ marginTop: 8 }}>Book your professional</h3>
          <p>Choose a named person by rating, verified jobs, tier and price.</p>
          <span className="btn white sm" style={{ alignSelf: 'flex-start', marginTop: 12 }}>Browse <ArrowRight size={14} /></span>
        </Link>
        <Link to="/app/homes" className="banner reveal" style={{ '--d': '160ms', '--tint': 'linear-gradient(100deg, rgba(10,40,30,.9), rgba(10,40,30,.25))' }}>
          <img src={SCENES.room3} alt="" />
          <House size={24} color="#7de0a8" />
          <h3 style={{ marginTop: 8 }}>Your Home Record</h3>
          <p>Every appliance, service and warranty in one place.</p>
          <span className="btn white sm" style={{ alignSelf: 'flex-start', marginTop: 12 }}>Open <ArrowRight size={14} /></span>
        </Link>
      </div>

      {popular.length > 0 && (
        <>
          <div className="section-head reveal" style={{ marginTop: 34, marginBottom: 14 }}><h2>Most booked in your community</h2></div>
          <div className="scroller">
            {popular.map(({ c, j }, i) => (
              <div key={`${c.code}${j.code}`} className="reveal" style={{ '--d': `${i * 50}ms` }}>
                <ServiceCard to={`/app/book/${c.code}?jt=${j.code}`} code={c.code} title={j.name} sub={c.name} badge={i < 3 ? 'Most booked' : c.archetype === 'A' ? 'Instant' : 'Scheduled'}
                  price={`from ${money(c.visitCharge + j.labour)}`} meta={<><Clock size={13} />{j.durationMin} min</>} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-2" style={{ marginTop: 30 }}>
        <Card pad={false} className="reveal">
          <div className="card-head"><h3>My Harmonia Team</h3><Link to="/app/team" className="small">See all</Link></div>
          {team.data?.length ? (
            <div className="divided">
              {team.data.slice(0, 4).map((p) => (
                <div key={`${p._id}${p.category}`} className="list-item">
                  <Avatar name={p.displayName} src={p.photoUrl} />
                  <div className="grow">
                    <div className="strong small">{p.displayName}</div>
                    <div className="row wrap" style={{ '--gap': '6px', marginTop: 2 }}><span className="tiny muted">{p.categoryName}</span><TierBadge tier={p.tier} compact /></div>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => navigate(`/app/book/${p.category}?pro=${p._id}`)}>Book</Button>
                </div>
              ))}
            </div>
          ) : <Empty title="Your team is empty">After a good job, add the professional here. They get first refusal on your next request.</Empty>}
        </Card>

        <Card pad={false} className="reveal" style={{ '--d': '80ms' }}>
          <div className="card-head"><h3 className="row" style={{ '--gap': '8px' }}><BellRing size={16} />Coming up for your home</h3><Link to="/app/homes" className="small">Home Record</Link></div>
          {reminders.data && (reminders.data.due.length || reminders.data.workmanshipWarranties.length) ? (
            <div className="divided">
              {reminders.data.due.slice(0, 4).map((r) => (
                <div key={`${r.asset._id}${r.kind || 'svc'}`} className="list-item">
                  <span className="cat-icon"><CalendarClock size={18} /></span>
                  <div className="grow">
                    <div className="strong small">{r.asset.label || r.asset.make || r.asset.type.replace(/_/g, ' ')}</div>
                    <div className="tiny muted">{r.kind === 'warranty' ? `Manufacturer warranty ends ${date(r.warrantyEndsAt)}` : r.overdue ? `Service overdue since ${date(r.dueAt)}` : `Service due ${date(r.dueAt)}`}</div>
                  </div>
                  {r.kind !== 'warranty' && <Badge tone={r.overdue ? 'warning' : ''}>{r.overdue ? 'Overdue' : 'Due soon'}</Badge>}
                </div>
              ))}
              {reminders.data.workmanshipWarranties.slice(0, 3).map((w) => (
                <Link key={w._id} to={`/app/jobs/${w._id}`} className="list-item">
                  <CategoryIcon code={w.category} photo />
                  <div className="grow"><div className="strong small">{w.categoryName}</div><div className="tiny muted"><ShieldCheck size={11} /> Warranty until {date(w.warranty.expiresAt)}</div></div>
                  <ChevronRight size={16} className="muted" />
                </Link>
              ))}
            </div>
          ) : <Empty title="Nothing due">Add appliances to your Home Record and we will remind you before they need service.</Empty>}
        </Card>
      </div>

      <div style={{ marginTop: 26 }}><AssuranceStrip /></div>
    </div>
  );
}
