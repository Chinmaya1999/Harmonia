import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Segmented, Spinner, Empty } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { JobRow } from '../customer/Jobs.jsx';

export default function ProJobs() {
  const [scope, setScope] = useState('open');
  const { data, loading } = useFetch(`/jobs?scope=${scope}&limit=100`);
  return (
    <div className="container page">
      <PageHead title="Jobs" actions={<Segmented value={scope} onChange={setScope} options={[{ value: 'open', label: 'Active' }, { value: 'history', label: 'Completed' }]} />} />
      <Card pad={false}>
        {loading ? <Spinner /> : data?.length ? <div className="divided">{data.map((j) => <JobRow key={j._id} j={{ ...j, professional: null }} to={`/pro/jobs/${j._id}`} />)}</div>
          : <Empty icon={ClipboardList} title={scope === 'open' ? 'No active jobs' : 'No completed jobs yet'}>Every job you complete on Harmonia adds to your verified record.</Empty>}
      </Card>
    </div>
  );
}
