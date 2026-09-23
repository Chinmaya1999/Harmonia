import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, ShieldCheck } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Segmented, Spinner, Empty, Badge } from '../../components/ui.jsx';
import { CategoryIcon, StateBadge } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money, dateTime } from '../../lib/format.js';

export function JobRow({ j, to }) {
  return (
    <Link to={to} className="list-item">
      <CategoryIcon code={j.category} photo />
      <div className="grow">
        <div className="row wrap" style={{ '--gap': '8px' }}><span className="strong">{j.categoryName}</span>{j.route === 'warranty' && <Badge tone="accent"><ShieldCheck size={11} />Warranty</Badge>}</div>
        <div className="small muted truncate">{j.jobType?.name} · {j.professional?.displayName || 'Not assigned'} · {dateTime(j.scheduledAt || j.createdAt)}</div>
      </div>
      <div className="stack right" style={{ '--gap': '4px', alignItems: 'flex-end' }}>
        <StateBadge state={j.state} />
        {j.pricing?.gross != null && <span className="small strong num">{money(j.pricing.gross + (j.pricing.priorityTip || 0))}</span>}
      </div>
      <ChevronRight size={16} className="muted" />
    </Link>
  );
}

export default function Jobs() {
  const [scope, setScope] = useState('open');
  const { data, loading } = useFetch(`/jobs?scope=${scope}&limit=100`);
  return (
    <div className="container page">
      <PageHead title="Bookings" actions={<Segmented value={scope} onChange={setScope} options={[{ value: 'open', label: 'Active' }, { value: 'history', label: 'Past' }]} />} />
      <Card pad={false}>
        {loading ? <Spinner /> : data?.length ? <div className="divided">{data.map((j) => <JobRow key={j._id} j={j} to={`/app/jobs/${j._id}`} />)}</div>
          : <Empty icon={ClipboardList} title={scope === 'open' ? 'No active bookings' : 'No past bookings yet'} action={<Link to="/app/book" className="btn primary">Book a professional</Link>} />}
      </Card>
    </div>
  );
}
