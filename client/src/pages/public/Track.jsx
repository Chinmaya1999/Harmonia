import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Spinner, Empty } from '../../components/ui.jsx';
import { Avatar, TierBadge, JobStepper, StateBadge, Timeline } from '../../components/domain.jsx';
import { time } from '../../lib/format.js';

// SAF-02 — a family member can follow the job without an account.
export default function Track() {
  const { token } = useParams();
  const { data, loading, error, reload } = useFetch(`/public/track/${token}`);
  useEffect(() => { const t = setInterval(() => reload({ silent: true }), 15000); return () => clearInterval(t); }, [reload]);
  if (loading) return <Spinner />;
  if (error) return <div className="container page"><Empty title="Link not valid">This tracking link has expired or is incorrect.</Empty></div>;
  return (
    <div className="container narrow page">
      <div className="eyebrow">Shared job status</div>
      <h1 style={{ marginTop: 6 }}>{data.category}</h1>
      <p className="muted">{data.ref} · {data.community}</p>
      <Card style={{ marginTop: 16 }}>
        <div className="row between"><StateBadge state={data.state} />{data.eta && <span className="small">Expected by <strong>{time(data.eta)}</strong></span>}</div>
        <JobStepper state={data.state} />
      </Card>
      {data.pro && (
        <Card style={{ marginTop: 12 }}>
          <div className="row">
            <Avatar name={data.pro.displayName} src={data.pro.photoUrl} size="lg" />
            <div className="grow">
              <div className="strong">{data.pro.displayName}</div>
              <div className="mono tiny muted">{data.pro.harmoniaId}</div>
              <div style={{ marginTop: 6 }}><TierBadge tier={data.pro.tier} /></div>
            </div>
          </div>
          <div className="callout success" style={{ marginTop: 12 }}><ShieldCheck size={16} /><span className="small">Check the photo and Harmonia ID at the door. The professional needs the customer's arrival code to start.</span></div>
        </Card>
      )}
      <Card style={{ marginTop: 12 }}><h3 style={{ marginBottom: 10 }}>Timeline</h3><Timeline events={data.timeline} /></Card>
    </div>
  );
}
