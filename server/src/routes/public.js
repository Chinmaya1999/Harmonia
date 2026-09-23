import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Professional, Rating, Category, Incident, Invite, Job } from '../models/index.js';
import { TIERS } from '../config/constants.js';
import { notFound } from '../lib/errors.js';
import { proCard } from '../services/views.js';

const r = Router();
r.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

// ID-06/07, SKP-01..04 — public Skill Passport, no account needed.
r.get('/pros/:harmoniaId', async (req, res) => {
  const pro = await Professional.findOne({ harmoniaId: req.params.harmoniaId.toUpperCase() }).lean();
  if (!pro) throw notFound('No professional with this Harmonia ID');
  const [reviews, categories, seriousUpheld] = await Promise.all([
    Rating.find({ pro: pro._id, direction: 'customer_to_pro', visible: true, excluded: false }).sort({ createdAt: -1 }).limit(8).lean(),
    Category.find({ code: { $in: pro.skills.map((s) => s.category) } }).select('code name archetype').lean(),
    Incident.countDocuments({ against: pro.user, serious: true, status: 'resolved', resolution: /upheld/i }),
  ]);
  const provenanceOf = (k) => (pro.checks?.[k]?.status === 'verified' ? { status: 'verified', at: pro.checks[k].verifiedAt } : { status: pro.checks?.[k]?.status || 'not_started' });
  res.json({
    ...proCard(pro),
    suspended: !!pro.suspended?.active,
    memberSince: pro.createdAt,
    homeCity: pro.homeCity,
    tiers: TIERS.map((t) => ({ ...t, achieved: pro.tier >= t.level })),
    verification: {
      identity: provenanceOf('digilocker'), pan: provenanceOf('pan'), address: provenanceOf('address'), bank: provenanceOf('bank'),
      background: provenanceOf('police'), references: provenanceOf('references'), licence: provenanceOf('licence'),
    },
    skills: pro.skills.map((s) => ({
      category: s.category, categoryName: categories.find((c) => c.code === s.category)?.name, level: s.level, yearsExperience: s.yearsExperience,
      provenance: s.status === 'verified' ? s.provenance : 'self_declared', status: s.status, certificates: s.certificates?.map((c) => ({ name: c.name, issuer: c.issuer, issuedOn: c.issuedOn })),
      verifiedJobs: pro.stats?.jobsByCategory?.[s.category] || 0,
    })),
    score: pro.score?.value != null ? { value: pro.score.value, band: pro.score.band, components: Object.fromEntries(Object.entries(pro.score.components || {}).map(([k, v]) => [k, { value: v.value, weight: v.weight, label: v.label }])) } : null,
    dimensionAvg: pro.stats?.dimensionAvg,
    safetyRecord: { upheldSeriousComplaints: seriousUpheld },
    selfDeclaredHistory: pro.selfDeclaredHistory, // MIG-05 — clearly labelled, never counted
    reviews: reviews.map((x) => ({ overall: x.overall, text: x.text, response: x.response?.text, at: x.createdAt, category: x.category })),
  });
});

r.get('/invites/:code', async (req, res) => {
  const invite = await Invite.findOneAndUpdate({ code: req.params.code }, { $inc: { opens: 1 } }, { new: true }).lean();
  if (!invite || (invite.expiresAt && invite.expiresAt < new Date())) throw notFound('This invite link is no longer valid');
  const pro = await Professional.findById(invite.pro).lean();
  res.json({ code: invite.code, pro: proCard(pro) });
});

// SAF-02 — family can follow a live job without an account.
r.get('/track/:token', async (req, res) => {
  const job = await Job.findOne({ shareToken: req.params.token }).lean();
  if (!job) throw notFound('This tracking link is not valid');
  const pro = job.professional ? await Professional.findById(job.professional).lean() : null;
  res.json({
    ref: job.ref, category: job.categoryName, state: job.state, eta: job.eta, community: job.address?.communityName,
    timeline: job.timeline.filter((t) => t.state !== 'EVENT').map((t) => ({ state: t.state, at: t.at })),
    pro: pro ? { displayName: pro.displayName, harmoniaId: pro.harmoniaId, photoUrl: pro.photoUrl, tier: pro.tier, tierName: TIERS[pro.tier]?.name } : null,
  });
});

export default r;
