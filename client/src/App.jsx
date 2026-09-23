import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PublicLayout, AppLayout, OpsLayout, RequireRole } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useGlobalReveal } from './components/motion.jsx';

const Landing = lazy(() => import('./pages/public/Landing.jsx'));
const Login = lazy(() => import('./pages/public/Login.jsx'));
const PublicProfile = lazy(() => import('./pages/public/PublicProfile.jsx'));
const Track = lazy(() => import('./pages/public/Track.jsx'));
const Join = lazy(() => import('./pages/public/Join.jsx'));

const CHome = lazy(() => import('./pages/customer/Home.jsx'));
const CBook = lazy(() => import('./pages/customer/Book.jsx'));
const CBrowse = lazy(() => import('./pages/customer/Browse.jsx'));
const CProDetail = lazy(() => import('./pages/customer/ProDetail.jsx'));
const CJobs = lazy(() => import('./pages/customer/Jobs.jsx'));
const CJob = lazy(() => import('./pages/customer/JobDetail.jsx'));
const CTeam = lazy(() => import('./pages/customer/Team.jsx'));
const CHomes = lazy(() => import('./pages/customer/Homes.jsx'));
const CHomeDetail = lazy(() => import('./pages/customer/HomeDetail.jsx'));
const CProfile = lazy(() => import('./pages/customer/Profile.jsx'));

const PDash = lazy(() => import('./pages/pro/Dashboard.jsx'));
const PJobs = lazy(() => import('./pages/pro/Jobs.jsx'));
const PJob = lazy(() => import('./pages/pro/JobRun.jsx'));
const PEarnings = lazy(() => import('./pages/pro/Earnings.jsx'));
const PPassport = lazy(() => import('./pages/pro/Passport.jsx'));
const PVerification = lazy(() => import('./pages/pro/Verification.jsx'));
const PAvailability = lazy(() => import('./pages/pro/Availability.jsx'));
const PInvites = lazy(() => import('./pages/pro/Invites.jsx'));
const PMore = lazy(() => import('./pages/pro/More.jsx'));

const OOverview = lazy(() => import('./pages/ops/Overview.jsx'));
const OJobs = lazy(() => import('./pages/ops/Jobs.jsx'));
const OJob = lazy(() => import('./pages/ops/JobDispatch.jsx'));
const OVerification = lazy(() => import('./pages/ops/Verification.jsx'));
const ODisputes = lazy(() => import('./pages/ops/Disputes.jsx'));
const ODispute = lazy(() => import('./pages/ops/DisputeDetail.jsx'));
const OSafety = lazy(() => import('./pages/ops/Safety.jsx'));
const OCommunities = lazy(() => import('./pages/ops/Communities.jsx'));
const OPros = lazy(() => import('./pages/ops/Professionals.jsx'));
const OCatalogue = lazy(() => import('./pages/ops/Catalogue.jsx'));
const OConfig = lazy(() => import('./pages/ops/Config.jsx'));
const OLedger = lazy(() => import('./pages/ops/Ledger.jsx'));
const OAudit = lazy(() => import('./pages/ops/Audit.jsx'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  useGlobalReveal();
  return (
    <Suspense fallback={<Spinner />}>
      <ScrollTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="p/:hid" element={<PublicProfile />} />
          <Route path="track/:token" element={<Track />} />
          <Route path="join/:code" element={<Join />} />
        </Route>

        <Route path="app" element={<RequireRole role="customer"><AppLayout kind="customer" /></RequireRole>}>
          <Route index element={<CHome />} />
          <Route path="book" element={<CBook />} />
          <Route path="book/:code" element={<CBook />} />
          <Route path="browse" element={<CBrowse />} />
          <Route path="pros/:id" element={<CProDetail />} />
          <Route path="jobs" element={<CJobs />} />
          <Route path="jobs/:id" element={<CJob />} />
          <Route path="team" element={<CTeam />} />
          <Route path="homes" element={<CHomes />} />
          <Route path="homes/:id" element={<CHomeDetail />} />
          <Route path="profile" element={<CProfile />} />
        </Route>

        <Route path="pro" element={<RequireRole role="professional"><AppLayout kind="pro" /></RequireRole>}>
          <Route index element={<PDash />} />
          <Route path="jobs" element={<PJobs />} />
          <Route path="jobs/:id" element={<PJob />} />
          <Route path="earnings" element={<PEarnings />} />
          <Route path="passport" element={<PPassport />} />
          <Route path="verification" element={<PVerification />} />
          <Route path="availability" element={<PAvailability />} />
          <Route path="invites" element={<PInvites />} />
          <Route path="more" element={<PMore />} />
        </Route>

        <Route path="ops" element={<RequireRole role="admin"><OpsLayout /></RequireRole>}>
          <Route index element={<OOverview />} />
          <Route path="jobs" element={<OJobs />} />
          <Route path="jobs/:id" element={<OJob />} />
          <Route path="verification" element={<OVerification />} />
          <Route path="disputes" element={<ODisputes />} />
          <Route path="disputes/:id" element={<ODispute />} />
          <Route path="safety" element={<OSafety />} />
          <Route path="communities" element={<OCommunities />} />
          <Route path="professionals" element={<OPros />} />
          <Route path="catalogue" element={<OCatalogue />} />
          <Route path="config" element={<OConfig />} />
          <Route path="ledger" element={<OLedger />} />
          <Route path="audit" element={<OAudit />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
