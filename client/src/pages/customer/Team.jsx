import { useNavigate } from 'react-router-dom';
import { Users, Trash2 } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Button, Spinner, Empty, Callout } from '../../components/ui.jsx';
import { ProCard } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { REASON_LABEL } from '../../lib/format.js';

// §5.5 — My Harmonia Team: one-tap rebooking, first refusal, silent removal.
export default function Team() {
  const { data, loading, reload } = useFetch('/me/team');
  const { run } = useAction();
  const navigate = useNavigate();
  const groups = (data || []).reduce((m, p) => ({ ...m, [p.categoryName]: [...(m[p.categoryName] || []), p] }), {});

  return (
    <div className="container page">
      <PageHead title="My Harmonia Team" sub="The professionals you trust. They get first refusal on your requests, before anyone else." />
      <Callout>Removing someone is silent — they only see their total count change.</Callout>
      {loading ? <Spinner /> : !data?.length ? (
        <Empty icon={Users} title="No one in your team yet" action={<Button variant="primary" onClick={() => navigate('/app/browse')}>Find a professional</Button>}>After a job you liked, add the professional to your team from the rating screen.</Empty>
      ) : Object.entries(groups).map(([cat, list]) => (
        <div key={cat} style={{ marginTop: 22 }}>
          <h4 style={{ marginBottom: 10 }}>{cat}</h4>
          <div className="grid grid-2">
            {list.map((p) => (
              <ProCard key={`${p._id}${p.category}`} pro={p}
                footer={
                  <div className="row between wrap" style={{ marginTop: 8 }}>
                    <span className="small muted">{p.unavailableReason ? REASON_LABEL[p.unavailableReason] || p.unavailableReason : 'Available now'}{p.source === 'invite' && ' · invited you'}</span>
                    <div className="row" style={{ '--gap': '6px' }}>
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove from team" onClick={() => run('rm', () => api.del(`/me/team/${p._id}?category=${p.category}`)).then(() => reload({ silent: true }))} />
                      <Button size="sm" variant="primary" onClick={() => navigate(`/app/book/${p.category}?pro=${p._id}`)}>Book again</Button>
                    </div>
                  </div>
                } />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
