import { Router } from 'express';
import { Category, Community, Home } from '../models/index.js';
import { ARCHETYPES, TIERS, RATING_REASON_CODES, CUSTOMER_RATING_REASON_CODES, DISPUTE_REASONS, ASSET_SERVICE_INTERVALS, VERIFICATION_CHECKS } from '../config/constants.js';
import { categoryLiveness } from '../services/catalogue.js';
import { rateCardFor } from '../services/pricing.js';
import { getConfig } from '../services/settings.js';
import { authenticate } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';

const r = Router();

r.get('/meta', async (_req, res) => {
  const pay = await getConfig('payments');
  const windows = await getConfig('windows');
  res.json({
    archetypes: ARCHETYPES, tiers: TIERS, checks: VERIFICATION_CHECKS, ratingReasons: RATING_REASON_CODES, customerRatingReasons: CUSTOMER_RATING_REASON_CODES,
    disputeReasons: DISPUTE_REASONS, assetTypes: Object.keys(ASSET_SERVICE_INTERVALS),
    tipCapPaise: pay.tipCapPaise, tipCapPct: pay.tipCapPct, windows,
  });
});

r.get('/communities', async (_req, res) => {
  res.json(await Community.find().sort({ name: 1 }).lean());
});

// Categories with their live status for the customer's home (§3.2 depth rule).
r.get('/categories', authenticate, async (req, res) => {
  const categories = await Category.find({ active: true }).sort({ sortOrder: 1 }).lean();
  const home = req.query.homeId
    ? await Home.findOne({ _id: req.query.homeId, customer: req.user._id }).lean()
    : await Home.findOne({ customer: req.user._id }).sort({ isDefault: -1, createdAt: 1 }).lean();
  const coords = home?.location?.coordinates;
  const out = await Promise.all(
    categories.map(async (c) => {
      const card = rateCardFor(c, home?.address?.city || 'Bengaluru');
      const live = coords ? await categoryLiveness(c, coords) : { live: false, eligible: 0, needed: c.minActivePros };
      return {
        code: c.code, name: c.name, description: c.description, icon: c.icon, archetype: c.archetype, archetypeName: ARCHETYPES[c.archetype].name,
        collar: c.collar, warrantyDays: c.warrantyDays, cancellation: c.cancellation, womanPreferenceOffered: c.womanPreferenceOffered,
        visitCharge: card?.visitCharge, fromPrice: card ? card.visitCharge + Math.min(...card.jobTypes.map((j) => j.labour)) : null,
        jobTypes: card?.jobTypes || [], standardDurationMin: c.standardDurationMin, ...live,
      };
    }),
  );
  res.json({ categories: out, homeId: home?._id });
});

r.get('/categories/:code', authenticate, async (req, res) => {
  const c = await Category.findOne({ code: req.params.code.toUpperCase(), active: true }).lean();
  if (!c) throw notFound('Service not found');
  res.json({ ...c, archetypeInfo: ARCHETYPES[c.archetype], rateCard: rateCardFor(c, 'Bengaluru') });
});

export default r;
