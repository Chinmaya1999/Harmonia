import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Home, Search, Users, House, ClipboardList, LogOut, LayoutDashboard, Wallet, IdCard, ShieldCheck, Gauge, Radio, Scale, Siren,
  Layers, SlidersHorizontal, Building2, BookText, ScrollText, UserCog, MapPin,
} from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext.jsx';
import { Avatar } from './domain.jsx';
import { Spinner } from './ui.jsx';
import { useFetch } from '../hooks/useApi.js';

export function Brand({ tag }) {
  return (
    <Link to="/" className="logo" aria-label="Harmonia home">
      <span className="brand-mark">H</span>
      Harmonia
      {tag && <small>{tag}</small>}
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  return (
    <div className="row" style={{ '--gap': '8px' }}>
      <div className="row" style={{ '--gap': '8px' }}>
        <Avatar name={user?.name} size="sm" />
        <span className="small strong hide-sm" style={{ maxWidth: 140 }}>{user?.name?.split(' ')[0]}</span>
      </div>
      <button className="btn ghost icon" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
    </div>
  );
}

export function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Brand />
          <div className="spacer" />
          {user ? <Link className="btn primary" to={homePathFor(user.role)}>Open Harmonia</Link> : <>
            <Link className="btn ghost" to="/login?as=professional">For professionals</Link>
            <Link className="btn primary" to="/login">Sign in</Link>
          </>}
        </div>
      </header>
      <Outlet />
    </>
  );
}

const CUSTOMER_NAV = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/jobs', label: 'Bookings', icon: ClipboardList },
  { to: '/app/team', label: 'My Team', icon: Users },
  { to: '/app/homes', label: 'My Homes', icon: House },
];
const PRO_NAV = [
  { to: '/pro', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/pro/jobs', label: 'Jobs', icon: ClipboardList },
  { to: '/pro/earnings', label: 'Earnings', icon: Wallet },
  { to: '/pro/passport', label: 'Passport', icon: IdCard },
  { to: '/pro/more', label: 'More', icon: UserCog },
];

export function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}

export function AppLayout({ kind }) {
  const nav = kind === 'pro' ? PRO_NAV : CUSTOMER_NAV;
  const { community } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Brand tag={kind === 'pro' ? 'Pro' : null} />
          <nav className="nav" aria-label="Main">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={16} />{n.label}</NavLink>)}
            {kind === 'customer' && <NavLink to="/app/browse"><Search size={16} />Find a professional</NavLink>}
          </nav>
          <div className="spacer" />
          {kind === 'customer' && community && <Link to="/app/homes" className="loc-pill" title="Your community"><MapPin size={14} /><span>{community.name}</span></Link>}
          <UserMenu />
        </div>
      </header>
      <main><Outlet /></main>
      <nav className="tabbar" aria-label="Main">
        {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={20} />{n.label}</NavLink>)}
      </nav>
    </>
  );
}

const OPS_NAV = [
  { group: 'Pilot', items: [{ to: '/ops', label: 'Scorecard', icon: Gauge, end: true }, { to: '/ops/jobs', label: 'Live jobs & dispatch', icon: Radio }] },
  { group: 'Trust', items: [{ to: '/ops/verification', label: 'Verification', icon: ShieldCheck, key: 'verification' }, { to: '/ops/disputes', label: 'Disputes', icon: Scale, key: 'disputes' }, { to: '/ops/safety', label: 'Safety', icon: Siren, key: 'incidents' }] },
  { group: 'Network', items: [{ to: '/ops/communities', label: 'Communities', icon: Building2 }, { to: '/ops/professionals', label: 'Professionals', icon: IdCard }, { to: '/ops/catalogue', label: 'Catalogue & rates', icon: Layers }] },
  { group: 'Controls', items: [{ to: '/ops/config', label: 'Matching & rules', icon: SlidersHorizontal }, { to: '/ops/ledger', label: 'Ledger', icon: BookText }, { to: '/ops/audit', label: 'Audit log', icon: ScrollText }] },
];

export function OpsLayout() {
  const v = useFetch('/admin/verification');
  const d = useFetch('/admin/disputes');
  const i = useFetch('/admin/incidents');
  const counts = { verification: v.data?.length, disputes: d.data?.length, incidents: i.data?.length };
  return (
    <>
      <header className="topbar">
        <div className="container" style={{ maxWidth: 'none' }}>
          <Brand tag="Operations" />
          <div className="spacer" />
          <UserMenu />
        </div>
      </header>
      <div className="ops-shell">
        <aside className="ops-side">
          {OPS_NAV.map((g) => (
            <div key={g.group} className="stack" style={{ '--gap': '2px', marginBottom: 14 }}>
              <h4 style={{ padding: '4px 12px' }}>{g.group}</h4>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}>
                  <n.icon size={16} />{n.label}
                  {n.key && counts[n.key] > 0 && <span className="count">{counts[n.key]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <main className="ops-main"><Outlet /></main>
      </div>
    </>
  );
}

export function PageHead({ title, sub, actions, back }) {
  return (
    <>
      {back && <Link to={back.to} className="back">← {back.label}</Link>}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="row wrap">{actions}</div>}
      </div>
    </>
  );
}

