import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { House, Plus, ChevronRight, MapPin, LocateFixed } from 'lucide-react';
import { useFetch, useAction } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { Card, Button, Modal, Field, Input, Select, Spinner, Empty, Badge } from '../../components/ui.jsx';
import { PageHead } from '../../components/Layout.jsx';
import { SCENES } from '../../lib/media.js';

const ROOMS = [SCENES.room, SCENES.room2, SCENES.room3];

const KIND = { own: 'My home', rented: 'Rented out', parents: "Parents' home", nri_owned: 'NRI-owned', other: 'Other' };

export function HomeForm({ initial, onSaved, onClose }) {
  const communities = useFetch('/catalogue/communities');
  const { busy, run } = useAction();
  const [f, setF] = useState(initial || { label: 'Home', kind: 'own', type: 'apartment', bhk: 2, ownership: 'owner', community: '', address: { line: '', block: '', pincode: '', city: 'Bengaluru' } });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setAddr = (k, v) => setF((x) => ({ ...x, address: { ...x.address, [k]: v } }));
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setF((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude })));
  const save = () => run('save', async () => {
    const body = { ...f, community: f.community || null, bhk: f.bhk ? Number(f.bhk) : undefined, ageYears: f.ageYears ? Number(f.ageYears) : undefined, sizeSqft: f.sizeSqft ? Number(f.sizeSqft) : undefined };
    const out = initial?._id ? await api.patch(`/me/homes/${initial._id}`, body) : await api.post('/me/homes', body);
    onSaved(out);
  }, { success: 'Home saved' });

  return (
    <Modal open onClose={onClose} title={initial?._id ? 'Edit home' : 'Add a home'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy === 'save'} disabled={!f.address.line || (!f.community && !f.lat)} onClick={save}>Save home</Button></>}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Name"><Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Home, Parents' flat" /></Field>
          <Field label="This home is"><Select value={f.kind} onChange={(e) => set('kind', e.target.value)} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} /></Field>
        </div>
        <Field label="Apartment community" hint="Harmonia launches community by community.">
          <Select value={f.community || ''} onChange={(e) => set('community', e.target.value)} options={[{ value: '', label: 'Not in a listed community' }, ...(communities.data || []).map((c) => ({ value: c._id, label: `${c.name} — ${c.locality}` }))]} />
        </Field>
        <Field label="Flat and street"><Input value={f.address.line} onChange={(e) => setAddr('line', e.target.value)} placeholder="B-402, Palm Grove Residency" /></Field>
        <div className="grid grid-3">
          <Field label="Tower / block"><Input value={f.address.block || ''} onChange={(e) => setAddr('block', e.target.value)} /></Field>
          <Field label="PIN code"><Input inputMode="numeric" maxLength={6} value={f.address.pincode || ''} onChange={(e) => setAddr('pincode', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="BHK"><Input type="number" min={0} max={10} value={f.bhk ?? ''} onChange={(e) => set('bhk', e.target.value)} /></Field>
        </div>
        <div className="grid grid-3">
          <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)} options={['apartment', 'independent', 'villa', 'office'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} /></Field>
          <Field label="Building age (years)"><Input type="number" min={0} value={f.ageYears ?? ''} onChange={(e) => set('ageYears', e.target.value)} /></Field>
          <Field label="You are the"><Select value={f.ownership} onChange={(e) => set('ownership', e.target.value)} options={[{ value: 'owner', label: 'Owner' }, { value: 'tenant', label: 'Tenant' }, { value: 'family', label: 'Family' }]} /></Field>
        </div>
        {!f.community && <Button icon={LocateFixed} onClick={locate}>{f.lat ? 'Location captured ✓' : 'Use my current location'}</Button>}
      </div>
    </Modal>
  );
}

export default function Homes() {
  const { data, loading, reload } = useFetch('/me/homes');
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (params.get('new')) { setOpen(true); setParams({}, { replace: true }); } }, [params, setParams]);

  return (
    <div className="container page">
      <PageHead title="My Homes" sub="Every job writes to the Home Record automatically — what was done, by whom, with which parts, and until when it is under warranty." actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Add home</Button>} />
      {loading ? <Spinner /> : !data?.length ? (
        <Empty icon={House} title="No homes yet" action={<Button variant="primary" onClick={() => setOpen(true)}>Add your home</Button>}>You can add your own flat, a rented property, your parents' home, or a property you own from abroad.</Empty>
      ) : (
        <div className="grid grid-2">
          {data.map((h, i) => (
            <Link key={h._id} to={`/app/homes/${h._id}`} className="svc-card reveal" style={{ '--d': `${i * 80}ms` }}>
              <div className="img" style={{ aspectRatio: '16/8' }}><img src={ROOMS[i % ROOMS.length]} alt="" />{h.isDefault && <span className="badge light">Default</span>}</div>
              <div className="body">
              <div className="row between top">
                <div><div className="strong" style={{ fontSize: 17 }}>{h.label}</div><div className="small muted row" style={{ '--gap': '4px' }}><MapPin size={12} />{h.address?.line}</div></div>
                <ChevronRight size={18} className="muted" />
              </div>
              <div className="row wrap" style={{ marginTop: 8, '--gap': '6px' }}>
                <Badge>{KIND[h.kind]}</Badge>
                {h.bhk && <Badge>{h.bhk} BHK</Badge>}
                <Badge tone="brand">{h.assetCount} appliances tracked</Badge>
              </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {open && <HomeForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </div>
  );
}
