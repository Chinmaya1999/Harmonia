import { useSearchParams, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Info } from 'lucide-react';
import { useFetch } from '../../hooks/useApi.js';
import { Card, Select, Spinner, Empty, Button, Badge } from '../../components/ui.jsx';
import { ProCard } from '../../components/domain.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { money } from '../../lib/format.js';
import { catImg } from '../../lib/media.js';

const LANGS = [['', 'Any language'], ['en', 'English'], ['hi', 'Hindi'], ['kn', 'Kannada'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ml', 'Malayalam']];

// §5.4 — the browse route: named professionals with everything needed to choose.
export default function Browse() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const cats = useFetch('/catalogue/categories');
  const category = params.get('category') || '';
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const qs = new URLSearchParams({ category, sort: params.get('sort') || 'recommended', ...(params.get('minTier') && { minTier: params.get('minTier') }), ...(params.get('availableNow') && { availableNow: 'true' }), ...(params.get('language') && { language: params.get('language') }), ...(params.get('gender') && { gender: params.get('gender') }) });
  const pros = useFetch(category ? `/me/pros?${qs}` : null);
  const cat = cats.data?.categories.find((c) => c.code === category);

  if (!category) {
    return (
      <div className="container page">
        <PageHead title="Find a professional" sub="Choose a service to see verified professionals near you." />
        {cats.loading ? <Spinner /> : (
          <div className="grid grid-auto" style={{ '--min': '200px' }}>
            {cats.data?.categories.filter((c) => c.live).map((c, i) => (
              <button key={c.code} className="photo-tile reveal" style={{ aspectRatio: '4/3', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', '--d': `${i * 50}ms` }} onClick={() => set('category', c.code)}>
                <img src={catImg(c.code)} alt="" />
                <div className="top"><span className="badge light">{c.eligible} verified nearby</span></div>
                <div className="cap"><h3>{c.name}</h3><p style={{ fontSize: 13, opacity: .85 }}>from {money(c.fromPrice)}</p></div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="photo-hero" style={{ minHeight: 190 }}>
        <img src={catImg(category)} alt="" />
        <div className="stack" style={{ '--gap': '6px' }}>
          <button type="button" className="back btn ghost sm" style={{ paddingLeft: 0, color: 'rgba(255,255,255,.85)', alignSelf: 'flex-start' }} onClick={() => set('category', '')}>← All services</button>
          <h1>{cat ? `${cat.name} near you` : 'Professionals near you'}</h1>
          <p>Every professional shown is verified for this service. No paid placement.</p>
        </div>
      </div>
      <Card className="soft" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ '--gap': '10px' }}>
          <SlidersHorizontal size={16} className="muted" />
          <div style={{ minWidth: 160 }}><Select aria-label="Sort" value={params.get('sort') || 'recommended'} onChange={(e) => set('sort', e.target.value)} options={[{ value: 'recommended', label: 'Recommended' }, { value: 'distance', label: 'Nearest' }, { value: 'rating', label: 'Highest rated' }, { value: 'jobs', label: 'Most jobs' }]} /></div>
          <div style={{ minWidth: 160 }}><Select aria-label="Verification tier" value={params.get('minTier') || ''} onChange={(e) => set('minTier', e.target.value)} options={[{ value: '', label: 'Any tier' }, { value: '3', label: 'Skill Verified +' }, { value: '5', label: 'Harmonia Elite' }]} /></div>
          <div style={{ minWidth: 150 }}><Select aria-label="Language" value={params.get('language') || ''} onChange={(e) => set('language', e.target.value)} options={LANGS.map(([value, label]) => ({ value, label }))} /></div>
          {cat?.womanPreferenceOffered && <div style={{ minWidth: 140 }}><Select aria-label="Gender" value={params.get('gender') || ''} onChange={(e) => set('gender', e.target.value)} options={[{ value: '', label: 'Anyone' }, { value: 'female', label: 'Women only' }]} /></div>}
          <label className="check"><input type="checkbox" checked={!!params.get('availableNow')} onChange={(e) => set('availableNow', e.target.checked ? '1' : '')} />Available now</label>
        </div>
      </Card>
      {pros.data?.sortDisclosure && <p className="tiny muted row" style={{ '--gap': '6px', marginBottom: 10 }}><Info size={13} />{pros.data.sortDisclosure}</p>}
      {pros.loading ? <Spinner /> : pros.data?.pros.length ? (
        <div className="grid grid-2">
          {pros.data.pros.map((p) => (
            <ProCard key={p._id} pro={p} to={`/app/pros/${p._id}?category=${category}`}
              footer={<div className="row between" style={{ marginTop: 6 }}><span className="small">from <strong>{money(p.priceFrom)}</strong></span>
                <div className="row" style={{ '--gap': '6px' }}>{p.inTeam && <Badge tone="accent">In your team</Badge>}
                  <Button size="sm" variant="primary" onClick={(e) => { e.preventDefault(); navigate(`/app/book/${category}?pro=${p._id}`); }}>Book</Button></div></div>} />
          ))}
        </div>
      ) : <Empty title="No one matches these filters">Try removing a filter, or request now and we will find the best available match.</Empty>}
    </div>
  );
}
