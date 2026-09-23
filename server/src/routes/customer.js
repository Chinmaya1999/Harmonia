import { Router } from 'express';
import { z } from 'zod';
import { Home, Asset, HomeRecord, Professional, Category, User, Invite, Job, Rating, Community } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { isValidCoords, point, haversineKm } from '../lib/geo.js';
import { ASSET_SERVICE_INTERVALS } from '../config/constants.js';
import { proCard } from '../services/views.js';
import { ineligibilityReason } from '../services/matching.js';
import { addPreferred } from '../services/jobs.js';
import { rateCardFor } from '../services/pricing.js';
import { audit } from '../services/audit.js';

const r = Router();
r.use(authenticate, requireRole('customer'));

// ------------------------------------------------------------------ Homes
const homeSchema = z.object({
  label: z.string().trim().min(1).max(40),
  kind: z.enum(['own', 'rented', 'parents', 'nri_owned', 'other']).default('own'),
  type: z.enum(['apartment', 'independent', 'villa', 'office']).default('apartment'),
  bhk: z.coerce.number().int().min(0).max(10).optional(),
  sizeSqft: z.coerce.number().int().min(0).max(20000).optional(),
  ageYears: z.coerce.number().int().min(0).max(100).optional(),
  ownership: z.enum(['owner', 'tenant', 'family']).default('owner'),
  community: z.string().optional().nullable(),
  address: z.object({ line: z.string().trim().min(3).max(160), block: z.string().trim().max(40).optional(), pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')), city: z.string().default('Bengaluru') }),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  isDefault: z.boolean().optional(),
});

async function resolveLocation(body) {
  if (isValidCoords(body.lng, body.lat)) return point(body.lng, body.lat);
  if (body.community) {
    const c = await Community.findById(body.community).lean();
    if (c) return c.location;
  }
  throw badRequest('Pick your community or share your location');
}

r.get('/homes', async (req, res) => {
  const homes = await Home.find({ customer: req.user._id }).populate('community', 'name locality').sort({ isDefault: -1, createdAt: 1 }).lean();
  const counts = await Asset.aggregate([{ $match: { home: { $in: homes.map((h) => h._id) } } }, { $group: { _id: '$home', n: { $sum: 1 } } }]);
  res.json(homes.map((h) => ({ ...h, assetCount: counts.find((c) => String(c._id) === String(h._id))?.n || 0 })));
});

r.post('/homes', async (req, res) => {
  const body = homeSchema.parse(req.body);
  const location = await resolveLocation(body);
  const first = !(await Home.exists({ customer: req.user._id }));
  const home = await Home.create({ ...body, community: body.community || undefined, location, customer: req.user._id, isDefault: first || !!body.isDefault });
  if (body.isDefault && !first) await Home.updateMany({ customer: req.user._id, _id: { $ne: home._id } }, { $set: { isDefault: false } });
  if (body.community && !req.user.community) await User.updateOne({ _id: req.user._id }, { $set: { community: body.community } });
  res.status(201).json(home);
});

async function ownHome(req) {
  const home = await Home.findOne({ _id: req.params.id, customer: req.user._id });
  if (!home) throw notFound('Home not found');
  return home;
}

r.get('/homes/:id', async (req, res) => {
  const home = await ownHome(req);
  await home.populate('community', 'name locality');
  const [assets, records] = await Promise.all([
    Asset.find({ home: home._id }).sort({ createdAt: 1 }),
    HomeRecord.find({ home: home._id }).sort({ date: -1 }).lean(),
  ]);
  res.json({ home, assets, records });
});

r.patch('/homes/:id', async (req, res) => {
  const home = await ownHome(req);
  const body = homeSchema.partial().parse(req.body);
  if (body.lat || body.community) body.location = await resolveLocation({ ...home.toObject(), ...body });
  home.set(body);
  await home.save();
  if (body.isDefault) await Home.updateMany({ customer: req.user._id, _id: { $ne: home._id } }, { $set: { isDefault: false } });
  res.json(home);
});

// HOM-06 — full export at any time (DPDP portability and a trust signal).
r.get('/homes/:id/export', async (req, res) => {
  const home = await ownHome(req);
  const [assets, records] = await Promise.all([Asset.find({ home: home._id }).lean(), HomeRecord.find({ home: home._id }).lean()]);
  audit({ actor: req.user._id, actorRole: 'customer', action: 'home.exported', entity: 'Home', entityId: home._id });
  res.setHeader('Content-Disposition', `attachment; filename="harmonia-home-${home.label.replace(/\W+/g, '-').toLowerCase()}.json"`);
  res.json({ exportedAt: new Date(), format: 'harmonia.home-record.v1', home: home.toObject(), assets, serviceHistory: records });
});

const assetSchema = z.object({
  type: z.enum(Object.keys(ASSET_SERVICE_INTERVALS)),
  label: z.string().trim().max(60).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  room: z.string().trim().max(40).optional(),
  installedAt: z.coerce.date().optional(),
  purchasedAt: z.coerce.date().optional(),
  warrantyExpiresAt: z.coerce.date().optional(),
  lastServiceAt: z.coerce.date().optional(),
  serviceIntervalDays: z.coerce.number().int().min(7).max(3650).optional(),
  photos: z.array(z.object({ url: z.string(), sha256: z.string() })).max(4).optional(),
  notes: z.string().max(400).optional(),
});

r.post('/homes/:id/assets', async (req, res) => {
  const home = await ownHome(req);
  const asset = await Asset.create({ ...assetSchema.parse(req.body), home: home._id });
  res.status(201).json(asset);
});

r.patch('/assets/:assetId', async (req, res) => {
  const asset = await Asset.findById(req.params.assetId);
  if (!asset || !(await Home.exists({ _id: asset.home, customer: req.user._id }))) throw notFound('Asset not found');
  asset.set(assetSchema.partial().parse(req.body));
  await asset.save();
  res.json(asset);
});

r.delete('/assets/:assetId', async (req, res) => {
  const asset = await Asset.findById(req.params.assetId);
  if (!asset || !(await Home.exists({ _id: asset.home, customer: req.user._id }))) throw notFound('Asset not found');
  await asset.deleteOne();
  res.json({ ok: true });
});

// HOM-05 — service-due reminders across all homes.
r.get('/reminders', async (req, res) => {
  const homes = await Home.find({ customer: req.user._id }).select('_id label').lean();
  const assets = await Asset.find({ home: { $in: homes.map((h) => h._id) } });
  const horizon = Date.now() + 30 * 86400000;
  const out = [];
  for (const a of assets) {
    const due = a.nextServiceDue;
    if (due && due.getTime() <= horizon) out.push({ asset: a, home: homes.find((h) => String(h._id) === String(a.home)), dueAt: due, overdue: due.getTime() < Date.now() });
    if (a.warrantyExpiresAt && a.warrantyExpiresAt.getTime() > Date.now() && a.warrantyExpiresAt.getTime() <= horizon) out.push({ asset: a, home: homes.find((h) => String(h._id) === String(a.home)), warrantyEndsAt: a.warrantyExpiresAt, kind: 'warranty' });
  }
  const openWarranties = await Job.find({ customer: req.user._id, 'warranty.expiresAt': { $gt: new Date() }, route: { $ne: 'warranty' } }).select('ref category categoryName warranty.expiresAt paidAt').sort({ 'warranty.expiresAt': 1 }).limit(10).lean();
  res.json({ due: out.sort((a, b) => (a.dueAt || a.warrantyEndsAt) - (b.dueAt || b.warrantyEndsAt)), workmanshipWarranties: openWarranties });
});

// ------------------------------------------------------------ Browse (§5.4)
r.get('/pros', async (req, res) => {
  const q = z.object({
    category: z.string(),
    homeId: z.string().optional(),
    minTier: z.coerce.number().int().min(0).max(5).optional(),
    availableNow: z.enum(['true', 'false']).optional(),
    language: z.string().optional(),
    gender: z.enum(['female', 'male']).optional(),
    sort: z.enum(['recommended', 'distance', 'rating', 'jobs']).default('recommended'),
  }).parse(req.query);
  const category = await Category.findOne({ code: q.category.toUpperCase() }).lean();
  if (!category) throw notFound('Service not found');
  const home = q.homeId ? await Home.findOne({ _id: q.homeId, customer: req.user._id }).lean() : await Home.findOne({ customer: req.user._id }).sort({ isDefault: -1 }).lean();
  if (!home) throw badRequest('Add your home first');
  const from = home.location.coordinates;

  const filter = { 'skills.category': category.code, 'suspended.active': { $ne: true }, location: { $nearSphere: { $geometry: home.location, $maxDistance: 12000 } } };
  if (q.minTier != null) filter.tier = { $gte: q.minTier };
  if (q.availableNow === 'true') filter.status = { $in: ['available', 'window'] };
  if (q.language) filter.languages = q.language;
  if (q.gender) filter.gender = q.gender;
  const pros = (await Professional.find(filter).limit(80).lean()).filter((p) => !ineligibilityReason(p, category));

  const card = rateCardFor(category, home.address?.city);
  const minLabour = card ? Math.min(...card.jobTypes.map((j) => j.labour)) : 0;
  const team = new Set(req.user.preferredPros.map((p) => String(p.pro)));
  let list = pros.map((p) => {
    const km = haversineKm(p.location?.coordinates || p.baseLocation.coordinates, from);
    const c = proCard(p, { from });
    const availability = p.status === 'available' ? 1 : p.status === 'window' ? 0.6 : 0.2;
    // NBY-01 — default composite of distance, rating and availability, disclosed in the UI (NBY-05).
    const recommended = 0.4 * (1 - Math.min(km / 12, 1)) + 0.4 * ((p.stats?.ratingAvg || 4) - 1) / 4 + 0.2 * availability;
    return { ...c, inTeam: team.has(String(p._id)), priceFrom: card ? card.visitCharge + minLabour : null, _km: km, _rec: recommended };
  });
  const sorters = { recommended: (a, b) => b._rec - a._rec, distance: (a, b) => a._km - b._km, rating: (a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0), jobs: (a, b) => b.jobsCompleted - a.jobsCompleted };
  list.sort(sorters[q.sort]);
  list = list.map(({ _km, _rec, ...rest }) => rest);
  res.json({ pros: list, sortDisclosure: q.sort === 'recommended' ? 'Sorted by a blend of distance (40%), rating (40%) and availability (20%). No paid placement.' : `Sorted by ${q.sort}. No paid placement.` });
});

r.get('/pros/:id', async (req, res) => {
  const pro = await Professional.findById(req.params.id).lean();
  if (!pro || pro.suspended?.active) throw notFound('Professional not found');
  const home = await Home.findOne({ customer: req.user._id }).sort({ isDefault: -1 }).lean();
  const reviews = await Rating.find({ pro: pro._id, direction: 'customer_to_pro', visible: true, excluded: false }).sort({ createdAt: -1 }).limit(12).populate('rater', 'name').lean();
  const categories = await Category.find({ code: { $in: pro.skills.filter((s) => s.status === 'verified').map((s) => s.category) } }).lean();
  res.json({
    pro: { ...proCard(pro, { from: home?.location?.coordinates }), weeklySchedule: pro.weeklySchedule, scoreComponents: pro.score?.components, dimensionAvg: pro.stats?.dimensionAvg },
    categories: categories.map((c) => ({ code: c.code, name: c.name, archetype: c.archetype, rateCard: rateCardFor(c, 'Bengaluru') })),
    reviews: reviews.map((rv) => ({ _id: rv._id, overall: rv.overall, scores: rv.scores, text: rv.text, response: rv.response, at: rv.createdAt, by: rv.rater?.name?.split(' ')[0], category: rv.category })),
    inTeam: req.user.preferredPros.some((p) => String(p.pro) === String(pro._id)),
  });
});

// --------------------------------------------------------- My Harmonia Team
r.get('/team', async (req, res) => {
  const ids = req.user.preferredPros.map((p) => p.pro);
  const pros = await Professional.find({ _id: { $in: ids } }).lean();
  const cats = await Category.find({ code: { $in: req.user.preferredPros.map((p) => p.category) } }).select('code name archetype').lean();
  const home = await Home.findOne({ customer: req.user._id }).sort({ isDefault: -1 }).lean();
  res.json(
    req.user.preferredPros
      .map((p) => {
        const pro = pros.find((x) => String(x._id) === String(p.pro));
        if (!pro) return null;
        const cat = cats.find((c) => c.code === p.category);
        // PRF-04 — say who is unavailable and why.
        const why = pro.suspended?.active ? 'unavailable' : pro.status === 'busy' ? 'busy' : pro.status === 'offline' ? 'offline' : null;
        return { ...proCard(pro, { from: home?.location?.coordinates }), category: p.category, categoryName: cat?.name, archetype: cat?.archetype, source: p.source, addedAt: p.addedAt, unavailableReason: why };
      })
      .filter(Boolean),
  );
});

r.post('/team', async (req, res) => {
  const { proId, category } = z.object({ proId: z.string(), category: z.string() }).parse(req.body);
  const pro = await Professional.findById(proId).lean();
  if (!pro) throw notFound('Professional not found');
  // PRF-01 — preferred status follows a completed job with that professional.
  const worked = await Job.exists({ customer: req.user._id, professional: proId, state: { $in: ['PAID', 'CLOSED'] } });
  if (!worked && req.user.invitedBy?.pro?.toString() !== proId) throw conflict('You can add a professional to your team after a completed job with them');
  await addPreferred(req.user._id, proId, category.toUpperCase(), 'job');
  res.json({ ok: true });
});

// PRF-06 — removal is silent; the pro only sees their count change.
r.delete('/team/:proId', async (req, res) => {
  const before = req.user.preferredPros.length;
  req.user.preferredPros = req.user.preferredPros.filter((p) => String(p.pro) !== req.params.proId || (req.query.category && p.category !== req.query.category));
  await req.user.save();
  if (req.user.preferredPros.length < before) await Professional.updateOne({ _id: req.params.proId }, { $inc: { 'stats.preferredBy': -1 } });
  res.json({ ok: true });
});

// ------------------------------------------------ Invite acceptance (MIG-02)
r.post('/invites/:code/accept', async (req, res) => {
  const invite = await Invite.findOne({ code: req.params.code });
  if (!invite || (invite.expiresAt && invite.expiresAt < new Date())) throw notFound('This invite link is no longer valid');
  const pro = await Professional.findById(invite.pro).lean();
  const skills = pro.skills.filter((s) => s.status !== 'rejected').map((s) => s.category);
  if (!req.user.invitedBy?.pro) {
    req.user.invitedBy = { pro: pro._id, invite: invite._id, at: new Date() };
    await req.user.save();
    await Invite.updateOne({ _id: invite._id }, { $push: { activated: { customer: req.user._id, at: new Date() } } });
  }
  for (const cat of skills) await addPreferred(req.user._id, pro._id, cat, 'invite');
  audit({ actor: req.user._id, actorRole: 'customer', action: 'invite.accepted', entity: 'Invite', entityId: invite._id });
  res.json({ ok: true, pro: proCard(pro) });
});

export default r;
