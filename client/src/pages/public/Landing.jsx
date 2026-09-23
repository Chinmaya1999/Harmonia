import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, ShieldCheck, Wallet, Clock, BookMarked, BadgeCheck, IndianRupee, Fingerprint, ArrowRight, Star, KeyRound, CheckCircle2,
  Sparkles, MapPin, Heart, Zap, CalendarCheck, HeartHandshake,
} from 'lucide-react';
import { useAuth, homePathFor } from '../../context/AuthContext.jsx';
import { Tilt, Stage3D, Counter } from '../../components/motion.jsx';
import { TierBadge } from '../../components/domain.jsx';
import { SCENES, catImg } from '../../lib/media.js';

const SERVICES = [
  { code: 'ELEC', name: 'Electrician', from: 248, blurb: 'Fans, switches, MCB trips, wiring' },
  { code: 'PLMB', name: 'Plumber', from: 248, blurb: 'Leaks, blockages, taps, geysers' },
  { code: 'ACRP', name: 'AC service & repair', from: 498, blurb: 'Not cooling, servicing, gas' },
  { code: 'CARP', name: 'Carpenter', from: 298, blurb: 'Hinges, doors, furniture assembly' },
  { code: 'DCLN', name: 'Deep cleaning', from: 699, blurb: 'Kitchen, bathroom, full home' },
  { code: 'TUTR', name: 'Home tutor', from: 500, blurb: 'Maths and science, grades 5–10' },
  { code: 'ITSP', name: 'IT support', from: 299, blurb: 'Wi-Fi, laptops, printers' },
];

// §12.7 — published in these words.
const PROMISE = [
  'Verified, background-checked professionals only.',
  'Transparent price, agreed before work begins. No revision without your approval.',
  'Pay after the work is done.',
  'Thirty-day workmanship warranty. If it fails, we fix it free.',
  'If your professional does not turn up, we send a replacement at no cost.',
  'The same professional again next time, if you want them.',
];

const TRUST = ['Background-checked professionals', 'Payment held in escrow', '30-day workmanship warranty', 'Zero commission on tips', 'Free replacement on no-show', 'Your Home Record, exportable', 'Same-day payouts for pros', 'Masked calling — numbers stay private'];

function HeroStage() {
  return (
    <Stage3D>
      <div className="blob" style={{ width: 360, height: 360, background: '#7c64ff', left: 40, top: 40 }} />
      <div className="blob" style={{ width: 300, height: 300, background: '#ff9a6a', right: 0, bottom: 20, animationDelay: '-6s' }} />
      {/* Photo card */}
      <div className="layer float" style={{ left: 10, top: 40, transform: 'translateZ(-40px)' }}>
        <div style={{ width: 320, height: 400, borderRadius: 26, overflow: 'hidden', boxShadow: '0 40px 90px rgba(20,16,60,.35)', position: 'relative' }}>
          <img src={catImg('ELEC')} alt="Verified electrician at work" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.7))' }} />
          <div style={{ position: 'absolute', left: 16, bottom: 16, color: '#fff' }}>
            <div className="badge light" style={{ marginBottom: 8 }}><ShieldCheck size={12} />Background verified</div>
            <div style={{ fontWeight: 800, fontFamily: 'var(--display)', fontSize: 18 }}>Ravi Kumar</div>
            <div style={{ fontSize: 12, opacity: .85 }}>Electrician · 16 years · HM-BLR-000001</div>
          </div>
        </div>
      </div>
      {/* Phone */}
      <div className="layer float d2" style={{ right: 20, top: 10, transform: 'translateZ(60px)' }}>
        <div className="phone">
          <div className="screen">
            <div className="notch" />
            <div style={{ height: 150, position: 'relative' }}>
              <img src={SCENES.room} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.1), rgba(0,0,0,.55))' }} />
              <div style={{ position: 'absolute', left: 14, bottom: 12, color: '#fff' }}>
                <div style={{ fontSize: 11, opacity: .85 }}>Electrical repair</div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--display)', fontSize: 17 }}>Ravi is on the way</div>
              </div>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5, 6].map((i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 9, background: i <= 3 ? '#5a3ee8' : '#e7e7ee' }} />)}</div>
              <div style={{ background: '#f4f2ff', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, color: '#6e6e78', display: 'flex', justifyContent: 'center', gap: 4, alignItems: 'center' }}><KeyRound size={11} />Arrival code</div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 26, letterSpacing: '.3em', color: '#5a3ee8' }}>4821</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#6e6e78' }}>Expected by</span><b>6:42 pm</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#6e6e78' }}>Price agreed on site</span><b>₹248+</b></div>
              <div style={{ background: '#111114', color: '#fff', borderRadius: 12, padding: '11px 0', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Chat · Call privately</div>
            </div>
          </div>
        </div>
      </div>
      {/* Floating glass cards */}
      <div className="layer float d3" style={{ left: -10, bottom: 50, transform: 'translateZ(110px)' }}>
        <div className="glass" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="cat-icon" style={{ background: '#e7f7ee', color: '#12a150' }}><Wallet size={18} /></span>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Held in escrow</div><div style={{ fontWeight: 800 }}>₹518 until you confirm</div></div>
        </div>
      </div>
      <div className="layer float" style={{ left: 250, top: 0, transform: 'translateZ(140px)' }}>
        <div className="glass" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Star size={16} fill="#e08a0b" color="#e08a0b" /><b>4.9</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>214 verified jobs</span>
        </div>
      </div>
      <div className="layer float d2" style={{ right: 0, bottom: 20, transform: 'translateZ(120px)' }}>
        <div className="glass" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <HeartHandshake size={16} color="#e08a0b" /><span style={{ fontSize: 13 }}><b>₹50 tip</b> · 100% to Ravi</span>
        </div>
      </div>
    </Stage3D>
  );
}

function HeroSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const matches = useMemo(() => SERVICES.filter((s) => `${s.name} ${s.blurb}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5), [q]);
  const go = (code) => navigate(user?.role === 'customer' ? `/app/book/${code}` : `/login?next=${encodeURIComponent(`/app/book/${code}`)}`);
  return (
    <div className="search-wrap" style={{ maxWidth: 520, marginTop: 28 }}>
      <form className="search-bar" onSubmit={(e) => { e.preventDefault(); if (matches[0]) go(matches[0].code); }}>
        <Search size={18} className="muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="What do you need help with?" aria-label="Search services" />
        <button className="btn primary">Search</button>
      </form>
      {open && (
        <div className="search-results">
          {matches.map((s) => (
            <a key={s.code} href="#" onMouseDown={(e) => { e.preventDefault(); go(s.code); }}>
              <span className="cat-icon"><img src={catImg(s.code)} alt="" /></span>
              <span className="grow"><span className="strong" style={{ display: 'block' }}>{s.name}</span><span className="tiny muted">{s.blurb}</span></span>
              <span className="small muted">from ₹{s.from}</span>
            </a>
          ))}
          {!matches.length && <div className="small muted" style={{ padding: 12 }}>No service matches “{q}” yet.</div>}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const start = user ? homePathFor(user.role) : '/login';
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="badge brand reveal"><Sparkles size={12} />Now live in HSR Layout, Bengaluru</div>
            <h1 className="reveal" style={{ marginTop: 18, '--d': '80ms' }}>Home services by professionals you can <span className="grad-text">actually trust.</span></h1>
            <p className="lead reveal" style={{ '--d': '160ms' }}>Verified electricians, plumbers and technicians — at your door when you need them, and yours to keep for next time. Pay only after the work is done.</p>
            <div className="reveal" style={{ '--d': '240ms' }}><HeroSearch /></div>
            <div className="row wrap reveal" style={{ marginTop: 18, '--gap': '8px', '--d': '320ms' }}>
              {SERVICES.slice(0, 5).map((s) => (
                <Link key={s.code} to={user?.role === 'customer' ? `/app/book/${s.code}` : `/login?next=${encodeURIComponent(`/app/book/${s.code}`)}`} className="badge outline" style={{ padding: '4px 12px 4px 4px', gap: 8, color: 'var(--ink)', background: 'var(--surface)' }}>
                  <span className="avatar sm" style={{ '--s': '24px', border: 0 }}><img src={catImg(s.code)} alt="" /></span>{s.name}
                </Link>
              ))}
            </div>
            <div className="row wrap small muted reveal" style={{ marginTop: 24, '--gap': '18px', '--d': '400ms' }}>
              <span className="row" style={{ '--gap': '6px' }}><ShieldCheck size={16} color="var(--success)" />Escrow on every job</span>
              <span className="row" style={{ '--gap': '6px' }}><BadgeCheck size={16} color="var(--success)" />30-day warranty</span>
              <span className="row" style={{ '--gap': '6px' }}><IndianRupee size={16} color="var(--success)" />Zero commission on tips</span>
            </div>
          </div>
          <div className="reveal" style={{ '--d': '200ms' }}><HeroStage /></div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '16px 0', background: 'var(--surface-2)' }}>
        <div className="marquee"><div className="track">
          {[...TRUST, ...TRUST].map((t, i) => <span key={i} className="row small strong" style={{ '--gap': '8px', whiteSpace: 'nowrap' }}><CheckCircle2 size={16} color="var(--brand-2)" />{t}</span>)}
        </div></div>
      </div>

      <section className="section">
        <div className="container">
          <div className="section-head reveal">
            <div><div className="eyebrow">Services</div><h2 style={{ marginTop: 8 }}>What can we help you with?</h2></div>
            <Link to={start} className="btn">See all services <ArrowRight size={16} /></Link>
          </div>
          <div className="grid grid-auto" style={{ '--min': '150px', '--gap': '14px' }}>
            {SERVICES.map((s, i) => (
              <Tilt key={s.code} as={Link} to={user?.role === 'customer' ? `/app/book/${s.code}` : `/login?next=${encodeURIComponent(`/app/book/${s.code}`)}`} className="photo-tile reveal" style={{ '--d': `${i * 60}ms` }}>
                <img src={catImg(s.code)} alt={s.name} loading="lazy" />
                <div className="top"><span className="badge light">from ₹{s.from}</span></div>
                <div className="cap"><h3>{s.name}</h3><p style={{ fontSize: 13, opacity: .85, marginTop: 2 }}>{s.blurb}</p></div>
              </Tilt>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark-section" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="blob" style={{ width: 420, height: 420, background: '#5a3ee8', right: -120, top: -120, opacity: .45 }} />
        <div className="container grid grid-2" style={{ alignItems: 'center', '--gap': '48px' }}>
          <Tilt className="reveal" max={6} style={{ borderRadius: 26, overflow: 'hidden', aspectRatio: '4/5', boxShadow: '0 40px 90px rgba(0,0,0,.5)' }}>
            <img src={SCENES.proAtWork} alt="A verified electrician safely testing a switchboard" style={{ objectPosition: '30% center', width: '100%', height: '100%', objectFit: 'cover' }} />
          </Tilt>
          <div className="reveal" style={{ '--d': '120ms' }}>
            <div className="eyebrow" style={{ color: '#b3a3ff' }}>Our promise</div>
            <h2 style={{ marginTop: 10, fontSize: 'clamp(28px, 4vw, 42px)' }}>Six things we will always do.</h2>
            <p className="muted" style={{ marginTop: 10 }}>Written once, published in every community we serve, and held to on every single job.</p>
            <ul className="promise-list" style={{ marginTop: 24 }}>
              {PROMISE.map((p, i) => <li key={p} className="reveal" style={{ '--d': `${160 + i * 70}ms` }}><CheckCircle2 size={20} color="#9a86ff" />{p}</li>)}
            </ul>
            <Link to={start} className="btn white lg" style={{ marginTop: 28 }}>Book your first professional <ArrowRight size={17} /></Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head reveal"><div><div className="eyebrow">How it works</div><h2 style={{ marginTop: 8 }}>Three steps. No phone tag.</h2></div></div>
          <div className="grid grid-3">
            {[
              { img: SCENES.customer, icon: Zap, t: 'Tell us what you need', b: 'Pick a service and see the published price. Your favourite professional gets first refusal, then the best verified match nearby.' },
              { img: catImg('PLMB'), icon: KeyRound, t: 'A verified pro arrives', b: 'Check their photo and Harmonia ID at the door, share your arrival code, and approve a firm price before any work starts.' },
              { img: SCENES.room2, icon: CalendarCheck, t: 'Confirm, then pay', b: 'Money is released only when you confirm. Every job lands in your Home Record with a 30-day warranty.' },
            ].map((s, i) => (
              <div key={s.t} className="card reveal" style={{ overflow: 'hidden', '--d': `${i * 100}ms` }}>
                <div style={{ aspectRatio: '16/10', overflow: 'hidden' }}><img src={s.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                <div className="card-body">
                  <div className="row"><span className="step-num">{i + 1}</span><h3>{s.t}</h3></div>
                  <p className="small muted" style={{ marginTop: 10 }}>{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--surface-2)' }}>
        <div className="container">
          <div className="section-head reveal"><div><div className="eyebrow">Why not just the building WhatsApp group?</div><h2 style={{ marginTop: 8, maxWidth: 640 }}>Four things a referral network structurally cannot give you.</h2></div></div>
          <div className="grid grid-4">
            {[
              { icon: Fingerprint, t: 'A stranger you can check', b: 'Graded verification — identity, police check, skill — shown honestly, never a blanket tick.' },
              { icon: Wallet, t: 'Recourse when work fails', b: 'Your money is held until you confirm. Every job carries a workmanship warranty.' },
              { icon: Clock, t: 'Someone at 10 p.m.', b: 'A verified panel inside your community, with first refusal for the people you already trust.' },
              { icon: BookMarked, t: 'A record of your home', b: 'What was fitted, when, by whom, under what warranty — kept for you and exportable.' },
            ].map((c, i) => (
              <Tilt key={c.t} className="card pad reveal" max={8} style={{ '--d': `${i * 80}ms` }}>
                <span className="cat-icon"><c.icon size={20} /></span>
                <h3 style={{ marginTop: 14 }}>{c.t}</h3>
                <p className="small muted" style={{ marginTop: 6 }}>{c.b}</p>
              </Tilt>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stat-strip">
          {[
            { n: 5, s: '', l: 'honest verification tiers' },
            { n: 30, s: '-day', l: 'workmanship warranty' },
            { n: 0, s: '%', l: 'commission on tips' },
            { n: 100, s: '%', l: 'same-day payouts to pros' },
          ].map((x, i) => (
            <div key={x.l} className="reveal center" style={{ '--d': `${i * 80}ms` }}>
              <div className="n"><Counter to={x.n} suffix={x.s} /></div>
              <div className="muted small">{x.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container grid grid-2" style={{ alignItems: 'center', '--gap': '48px' }}>
          <div className="reveal">
            <div className="eyebrow">For professionals</div>
            <h2 style={{ marginTop: 10, fontSize: 'clamp(28px, 4vw, 42px)' }}>Your skill. Your reputation. <span className="grad-text">Your future.</span></h2>
            <p style={{ marginTop: 14, color: 'var(--ink-2)', fontSize: 17 }}>Bring the customers you already have, and we will turn years of unrecorded reputation into something you own and can prove.</p>
            <ul className="promise-list" style={{ marginTop: 20 }}>
              <li><CheckCircle2 size={19} />Guaranteed payment, settled the same day</li>
              <li><CheckCircle2 size={19} />No charge for jobs — access to work is never sold</li>
              <li><CheckCircle2 size={19} />Tips reach you in full — zero commission</li>
              <li><CheckCircle2 size={19} />A Harmonia ID and verified record that move with you</li>
              <li><CheckCircle2 size={19} />Disputes decided on evidence — the customer is not automatically right</li>
            </ul>
            <Link to="/login?as=professional" className="btn violet lg" style={{ marginTop: 26 }}>Build your professional identity <ArrowRight size={17} /></Link>
          </div>
          <div className="reveal" style={{ position: 'relative', minHeight: 480, '--d': '120ms' }}>
            <div style={{ position: 'absolute', inset: '0 60px 60px 0', borderRadius: 26, overflow: 'hidden' }}>
              <img src={catImg('CARP')} alt="A carpenter at work" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <Tilt className="card pad-lg float" max={14} style={{ position: 'absolute', right: 0, bottom: 0, width: 320, boxShadow: 'var(--shadow-lg)' }}>
              <div className="row z1" style={{ '--gap': '14px' }}>
                <span className="avatar lg"><img src={catImg('CARP')} alt="" /></span>
                <div><div className="strong" style={{ fontSize: 18 }}>Mahesh Achari</div><div className="mono tiny muted">HM-BLR-000018</div></div>
              </div>
              <div className="row wrap z1" style={{ marginTop: 14 }}><TierBadge tier={3} /><span className="badge brand">Score 88</span></div>
              <hr />
              <div className="grid grid-3 center z1">
                <div><div className="display" style={{ fontSize: 24 }}>214</div><div className="tiny muted">verified jobs</div></div>
                <div><div className="display" style={{ fontSize: 24 }}>4.9</div><div className="tiny muted">rating</div></div>
                <div><div className="display" style={{ fontSize: 24 }}>1.2</div><div className="tiny muted">rework/100</div></div>
              </div>
              <p className="tiny muted" style={{ marginTop: 12 }}>A Skill Passport with a QR any builder or RWA can verify.</p>
            </Tilt>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="banner reveal" style={{ minHeight: 280, padding: 40, '--tint': 'linear-gradient(100deg, rgba(17,17,20,.92), rgba(42,28,115,.6) 60%, rgba(90,62,232,.2))' }}>
            <img src={SCENES.community} alt="" />
            <MapPin size={26} color="#b3a3ff" />
            <h3 style={{ fontSize: 'clamp(24px, 3.4vw, 36px)', marginTop: 10, maxWidth: 560 }}>Launching community by community.</h3>
            <p style={{ maxWidth: 520, marginTop: 8 }}>Live in HSR Layout, Bengaluru. Ask your RWA to bring Harmonia's verified panel to your society.</p>
            <div className="row wrap" style={{ marginTop: 18 }}>
              <Link to={start} className="btn white lg">Get started</Link>
              <Link to="/login?as=professional" className="btn lg" style={{ '--b': 'transparent', '--c': '#fff', borderColor: 'rgba(255,255,255,.4)' }}><Heart size={16} />Join as a professional</Link>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '32px 0 44px' }}>
        <div className="container row between wrap small muted">
          <span><strong style={{ color: 'var(--ink)' }}>Harmonia</strong> — organises the professional, and the home.</span>
          <span>Grievance officer: grievance@harmonia.example · Data stays in India · Photos: Unsplash</span>
        </div>
      </footer>
    </>
  );
}
