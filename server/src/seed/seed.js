/* eslint-disable no-await-in-loop */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import {
  User, Professional, Category, Community, Job, Home, Asset, HomeRecord, Rating, Invite, LedgerTxn, nextSeq,
} from '../models/index.js';
import { S } from '../config/constants.js';
import { rupees } from '../lib/money.js';
import { issueHarmoniaId } from '../services/identity.js';
import { holdInEscrow, settleOnline, settleCash, payTip } from '../services/payments.js';
import { normalisePrice } from '../services/pricing.js';
import { recomputePro, recomputeCustomer, computeTier } from '../services/score.js';
import { raiseDispute } from '../services/jobs.js';

// Deterministic randomness so every seed produces the same pilot.
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);
const jitter = ([lng, lat], km) => [lng + between(-km, km) / 108, lat + between(-km, km) / 111];
const daysAgo = (d, h = 11) => new Date(Date.now() - d * 86400000 + (h - 12) * 3600000);

const CENTER = [77.6474, 12.9116]; // HSR Layout, Bengaluru

async function seedRef(date) {
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `HJ-${d}-${String(await nextSeq(`job:20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`)).padStart(4, '0')}`;
}

const CATEGORIES = [
  {
    code: 'ELEC', name: 'Electrical repair', icon: 'zap', archetype: 'A', minTier: 2, warrantyDays: 30, sortOrder: 1, standardDurationMin: 45,
    description: 'Switches, sockets, fans, lights, MCB trips and wiring faults.',
    card: { visit: 99, jobs: [['SWITCH', 'Switch or socket repair', 149, 120, 30], ['FAN', 'Ceiling fan repair or install', 199, 250, 45], ['MCB', 'MCB or fuse keeps tripping', 249, 350, 45], ['LIGHT', 'Light fitting install', 149, 0, 30], ['FAULT', 'Wiring fault diagnosis', 299, 400, 60]] },
  },
  {
    code: 'PLMB', name: 'Plumbing', icon: 'droplet', archetype: 'A', minTier: 2, warrantyDays: 30, sortOrder: 2, standardDurationMin: 45,
    description: 'Leaks, blockages, taps, flush tanks and geyser fitting.',
    card: { visit: 99, jobs: [['TAP', 'Tap leak or replacement', 149, 250, 30], ['BLOCK', 'Drain or sink blockage', 299, 0, 45], ['FLUSH', 'Flush tank repair', 249, 300, 45], ['PIPE', 'Pipe leak repair', 349, 200, 60], ['GEYSER', 'Geyser installation', 449, 150, 60]] },
  },
  {
    code: 'ACRP', name: 'AC service & repair', icon: 'wind', archetype: 'A', minTier: 2, warrantyDays: 30, sortOrder: 3, standardDurationMin: 60,
    description: 'AC not cooling, servicing, gas top-up and installation.',
    card: { visit: 149, jobs: [['NOCOOL', 'AC not cooling — diagnose & fix', 349, 800, 60], ['SERVICE', 'Split AC wet service', 549, 0, 60], ['GAS', 'Gas top-up', 1499, 0, 60], ['INSTALL', 'AC installation', 1299, 500, 120]] },
  },
  {
    code: 'CARP', name: 'Carpentry', icon: 'hammer', archetype: 'A', minTier: 2, warrantyDays: 30, sortOrder: 4, standardDurationMin: 60,
    description: 'Hinges, locks, door alignment, furniture assembly.',
    card: { visit: 99, jobs: [['HINGE', 'Hinge, handle or lock repair', 199, 150, 30], ['DOOR', 'Door alignment', 299, 0, 45], ['ASSEMBLY', 'Furniture assembly', 449, 0, 90]] },
  },
  {
    code: 'DCLN', name: 'Deep cleaning', icon: 'sparkles', archetype: 'B', minTier: 2, warrantyDays: 7, sortOrder: 5, standardDurationMin: 240, minActivePros: 2,
    description: 'Scheduled kitchen, bathroom and full-home deep cleaning.',
    card: { visit: 0, jobs: [['KITCHEN', 'Kitchen deep clean', 1499, 0, 180], ['BATH', 'Bathroom deep clean', 699, 0, 90], ['HOME2', 'Full home — 2 BHK', 3999, 0, 360]] },
  },
  {
    code: 'TUTR', name: 'Home tutoring', icon: 'book-open', archetype: 'B', collar: 'white', minTier: 2, vulnerableAccess: true, warrantyDays: 0, sortOrder: 6, standardDurationMin: 60, minActivePros: 2,
    description: 'Maths and science tutoring at home, grades 5–10. Background-verified tutors only.',
    card: { visit: 0, jobs: [['MATH', 'Maths — 1 hour session', 500, 0, 60], ['SCI', 'Science — 1 hour session', 500, 0, 60]] },
  },
  {
    code: 'ITSP', name: 'IT support', icon: 'laptop', archetype: 'D', collar: 'white', minTier: 1, warrantyDays: 7, sortOrder: 7, standardDurationMin: 60, minActivePros: 2,
    description: 'Wi-Fi, printers, laptops and home network set-up by appointment.',
    card: { visit: 0, jobs: [['WIFI', 'Wi-Fi & router set-up', 399, 0, 45], ['LAPTOP', 'Laptop troubleshooting', 499, 0, 60], ['PRINTER', 'Printer set-up', 299, 0, 30]] },
  },
];

const PROS = [
  // name, gender, cats (level), years, languages, status
  ['Ravi Kumar', 'male', { ELEC: 5 }, 16, ['kn', 'hi', 'en'], 'available', '9100000001'],
  ['Manjunath Gowda', 'male', { ELEC: 4 }, 11, ['kn', 'en'], 'available'],
  ['Syed Imran', 'male', { ELEC: 4, CARP: 3 }, 9, ['hi', 'kn', 'en'], 'available'],
  ['Prakash Naidu', 'male', { ELEC: 3 }, 6, ['te', 'kn'], 'offline'],
  ['Deepa Shetty', 'female', { ELEC: 4 }, 8, ['kn', 'en'], 'available'],
  ['Arun Kumar', 'male', { ELEC: 3 }, 5, ['ta', 'kn'], 'available'],
  ['Venkatesh R', 'male', { PLMB: 5 }, 18, ['kn', 'te'], 'available', '9100000002'],
  ['Mohammed Rafiq', 'male', { PLMB: 4 }, 12, ['hi', 'kn'], 'available'],
  ['Suresh Babu', 'male', { PLMB: 4, CARP: 3 }, 10, ['kn', 'en'], 'offline'],
  ['Kiran Patil', 'male', { PLMB: 3 }, 7, ['mr', 'hi', 'kn'], 'available'],
  ['Joseph D’Souza', 'male', { PLMB: 4 }, 14, ['en', 'kn'], 'available'],
  ['Ramesh Yadav', 'male', { PLMB: 3 }, 5, ['hi'], 'available'],
  ['Naveen Reddy', 'male', { ACRP: 5 }, 13, ['te', 'kn', 'en'], 'available', '9100000003'],
  ['Farhan Ali', 'male', { ACRP: 4 }, 9, ['hi', 'en'], 'available'],
  ['Santosh M', 'male', { ACRP: 4, ELEC: 3 }, 8, ['kn'], 'available'],
  ['Girish Hegde', 'male', { ACRP: 3 }, 6, ['kn', 'en'], 'offline'],
  ['Balaji S', 'male', { ACRP: 4 }, 10, ['ta', 'en'], 'available'],
  ['Mahesh Achari', 'male', { CARP: 5 }, 20, ['kn'], 'available'],
  ['Lakshmi Devi', 'female', { DCLN: 4 }, 7, ['kn', 'te'], 'available'],
  ['Shabana Begum', 'female', { DCLN: 4 }, 6, ['hi', 'kn'], 'available'],
  ['Meena Kumari', 'female', { DCLN: 3 }, 5, ['ta', 'kn'], 'offline'],
  ['Priya Raghavan', 'female', { TUTR: 4 }, 9, ['en', 'ta', 'hi'], 'available'],
  ['Vikram Joshi', 'male', { TUTR: 4, ITSP: 3 }, 7, ['en', 'hi', 'mr'], 'available'],
  ['Nisha Thomas', 'female', { ITSP: 4 }, 6, ['en', 'ml'], 'available'],
  // Newcomers still in verification — they populate the ops queue.
  ['Harish B', 'male', { ELEC: 3 }, 5, ['kn'], 'offline', null, 'partial'],
  ['Kavya N', 'female', { DCLN: 3 }, 4, ['kn', 'en'], 'offline', null, 'new'],
];

const CUSTOMER_NAMES = ['Ananya Rao', 'Rahul Menon', 'Fatima Sheikh', 'Arjun Mehta', 'Sneha Iyer', 'Karthik Subramanian', 'Pooja Agarwal', 'Vivek Nair', 'Divya Krishnan', 'Rohit Sharma', 'Meera Pillai', 'Aditya Kulkarni', 'Nandini Rao', 'Siddharth Jain', 'Kavitha Reddy', 'Amit Verma', 'Lavanya S', 'Nikhil Bhat', 'Ishita Ghosh', 'Harsha Vardhan', 'Revathi M', 'Manish Gupta', 'Shruti Desai', 'Varun Hegde', 'Anjali Nair', 'Sameer Khan', 'Deepika Shenoy', 'Gautam Rao', 'Priyanka Das', 'Ashwin Kumar', 'Bhavana K', 'Tarun Malhotra', 'Swathi Prasad', 'Rakesh Iyengar', 'Neha Kapoor', 'Srinivas Murthy', 'Aparna Joshi', 'Kunal Shah', 'Radhika Menon', 'Yash Agarwal'];

const PRO_TEXT = ['Very neat work, explained the problem clearly.', 'Arrived on time and fixed it in one visit.', 'Polite and cleaned up after the job.', 'Fair price, no surprises.', 'Good work, will call again.', 'Knew exactly what was wrong. Quick.', 'Professional and careful with the furniture.'];

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log('[seed] dropping database', mongoose.connection.name);
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));

  // ----------------------------------------------------------- Communities
  const communities = await Community.insertMany([
    { name: 'Palm Grove Residency', locality: 'HSR Layout Sector 2', city: 'Bengaluru', state: 'Karnataka', households: 420, buildingAgeYears: 9, location: { type: 'Point', coordinates: [77.6446, 12.9121] }, stage: 'contracted', rwaContact: { name: 'Mr. Srinivasan', role: 'Secretary' }, activationCostPaise: rupees(38000), contracts: [{ kind: 'loi', valuePaise: rupees(180000), signedAt: daysAgo(40), note: 'Common-area electrical & plumbing AMC — LOI' }] },
    { name: 'Lakeview Enclave', locality: 'HSR Layout Sector 3', city: 'Bengaluru', state: 'Karnataka', households: 360, buildingAgeYears: 12, location: { type: 'Point', coordinates: [77.6512, 12.9081] }, stage: 'live', rwaContact: { name: 'Mrs. Kamath', role: 'President' }, activationCostPaise: rupees(41000) },
    { name: 'Silver Oak Apartments', locality: 'HSR Layout Sector 1', city: 'Bengaluru', state: 'Karnataka', households: 310, buildingAgeYears: 7, location: { type: 'Point', coordinates: [77.6398, 12.9165] }, stage: 'signed', rwaContact: { name: 'Mr. D’Costa', role: 'Treasurer' }, activationCostPaise: rupees(35000) },
    { name: 'Mylapore Heritage Towers', locality: 'Mylapore', city: 'Chennai', state: 'Tamil Nadu', households: 280, buildingAgeYears: 14, location: { type: 'Point', coordinates: [80.2676, 13.0339] }, stage: 'prospect' },
  ]);
  const [palm, lake, silver] = communities;

  // ------------------------------------------------------------ Categories
  const cats = await Category.insertMany(CATEGORIES.map((c) => ({
    code: c.code, name: c.name, description: c.description, icon: c.icon, archetype: c.archetype, collar: c.collar || 'blue', minTier: c.minTier,
    vulnerableAccess: !!c.vulnerableAccess, warrantyDays: c.warrantyDays, sortOrder: c.sortOrder, standardDurationMin: c.standardDurationMin,
    minActivePros: c.minActivePros ?? 3, cancellation: { freeBeforeState: 'EN_ROUTE', feePaise: c.archetype === 'A' ? rupees(99) : rupees(149) },
    rateCards: [{ city: 'Bengaluru', visitCharge: rupees(c.card.visit), jobTypes: c.card.jobs.map(([code, name, labour, parts, dur]) => ({ code, name, labour: rupees(labour), standardParts: rupees(parts), durationMin: dur })) }],
  })));
  const catBy = Object.fromEntries(cats.map((c) => [c.code, c]));

  // ----------------------------------------------------------------- Admin
  await User.create([
    { phone: '9000000000', name: 'Aisha (Ops Lead)', role: 'admin' },
    { phone: '9000000009', name: 'Dev (Ops Reviewer)', role: 'admin' },
  ]);

  // ------------------------------------------------------------------ Pros
  const weekly = [1, 2, 3, 4, 5, 6].map((day) => ({ day, from: '08:30', to: '20:00' }));
  const pros = [];
  let phoneN = 9100000010;
  for (const [name, gender, skills, years, languages, status, phone, stage] of PROS) {
    const user = await User.create({ phone: phone || String(phoneN++), name, role: 'professional', gender, language: languages[0] === 'hi' ? 'hi' : languages[0] === 'kn' ? 'kn' : 'en', community: palm._id });
    const loc = jitter(CENTER, 2.6);
    const verified = (at) => ({ status: 'verified', verifiedAt: at, reference: 'seed' });
    const joined = daysAgo(between(95, 130));
    const full = !stage;
    const pro = new Professional({
      user: user._id, harmoniaId: await issueHarmoniaId('Bengaluru'), displayName: name, gender, languages, community: palm._id,
      bio: `${years} years in ${Object.keys(skills).map((k) => catBy[k].name.toLowerCase()).join(' and ')}. Works across HSR Layout.`,
      baseLocation: { type: 'Point', coordinates: loc }, location: { type: 'Point', coordinates: loc },
      status: full ? status : 'offline', weeklySchedule: weekly, radiusKm: 6,
      restrictions: gender === 'female' ? { earliest: '08:00', latest: '19:00' } : {},
      checks: {
        otp: verified(joined), selfie: full || stage === 'partial' ? verified(joined) : { status: 'submitted', submittedAt: daysAgo(1), documentUrl: null },
        pan: full || stage === 'partial' ? { ...verified(joined), reference: 'PAN••••' } : { status: 'not_started' },
        digilocker: full || stage === 'partial' ? verified(joined) : { status: 'not_started' },
        address: full || stage === 'partial' ? verified(joined) : { status: 'not_started' },
        bank: full || stage === 'partial' ? verified(joined) : { status: 'not_started' },
        police: full ? { ...verified(joined), reference: `BGV-${1000 + pros.length}`, expiresAt: new Date(joined.getTime() + 730 * 86400000) } : stage === 'partial' ? { status: 'submitted', submittedAt: daysAgo(2), note: 'Sent to empanelled agency' } : { status: 'not_started' },
        references: full ? verified(joined) : stage === 'partial' ? { status: 'submitted', submittedAt: daysAgo(2), note: 'Two references provided' } : { status: 'not_started' },
      },
      skills: Object.entries(skills).map(([category, level]) => ({
        category, level, yearsExperience: years, provenance: full ? (level >= 4 ? 'platform_assessed' : 'document_verified') : 'self_declared',
        status: full ? 'verified' : 'pending', verifiedAt: full ? joined : undefined,
        certificates: level >= 4 ? [{ name: `${catBy[category].name} — NSQF Level 4`, issuer: pick(['ITI', 'NCVET', 'NSDC']), issuedOn: daysAgo(365 * between(2, 8)) }] : [],
      })),
      selfDeclaredHistory: { years, approxJobs: Math.round(years * 180), note: 'Self-declared before joining Harmonia' },
      stats: { accepted: 0 },
      createdAt: joined,
    });
    pro.tier = computeTier(pro);
    await pro.save();
    pros.push(pro);
  }
  const activePros = pros.filter((p) => p.tier >= 2);
  const prosFor = (code) => activePros.filter((p) => p.skills.some((s) => s.category === code && s.status === 'verified'));

  // ------------------------------------------------------------- Customers
  const homesByCustomer = new Map();
  const customers = [];
  for (let i = 0; i < CUSTOMER_NAMES.length; i += 1) {
    const community = i < 3 ? [palm, lake, palm][i] : pick([palm, palm, lake, lake, silver]);
    const user = await User.create({
      phone: i < 3 ? `900000000${i + 1}` : String(9200000000 + i), name: CUSTOMER_NAMES[i], role: 'customer', community: community._id,
      gender: ['Ananya Rao', 'Fatima Sheikh', 'Sneha Iyer', 'Pooja Agarwal', 'Divya Krishnan', 'Meera Pillai', 'Nandini Rao', 'Kavitha Reddy'].includes(CUSTOMER_NAMES[i]) ? 'female' : 'undisclosed',
      consents: [{ purpose: 'service_delivery', grantedAt: daysAgo(100) }, { purpose: 'home_record', grantedAt: daysAgo(100) }],
    });
    const home = await Home.create({
      customer: user._id, label: 'Home', kind: 'own', type: 'apartment', bhk: pick([2, 2, 3, 3, 4]), ageYears: community.buildingAgeYears, ownership: pick(['owner', 'owner', 'tenant']),
      community: community._id, address: { line: `${pick(['A', 'B', 'C', 'D'])}-${Math.floor(between(1, 15))}0${Math.floor(between(1, 6))}, ${community.name}`, block: `Tower ${pick(['A', 'B', 'C', 'D'])}`, pincode: '560102', city: 'Bengaluru' },
      location: { type: 'Point', coordinates: jitter(community.location.coordinates, 0.2) }, isDefault: true,
    });
    homesByCustomer.set(String(user._id), home);
    customers.push(user);
  }
  // Ananya also looks after her parents' flat (HOM-08).
  const ananya = customers[0];
  await Home.create({ customer: ananya._id, label: "Parents' flat", kind: 'parents', type: 'apartment', bhk: 2, ageYears: 12, community: lake._id, address: { line: 'B-204, Lakeview Enclave', block: 'Tower B', pincode: '560102', city: 'Bengaluru' }, location: lake.location });
  const ananyaHome = homesByCustomer.get(String(ananya._id));
  const assets = await Asset.insertMany([
    { home: ananyaHome._id, type: 'air_conditioner', label: 'Bedroom AC', make: 'Daikin', model: 'FTKF50', room: 'Master bedroom', installedAt: daysAgo(900), lastServiceAt: daysAgo(200), warrantyExpiresAt: daysAgo(-180) },
    { home: ananyaHome._id, type: 'geyser', label: 'Bathroom geyser', make: 'Racold', model: 'Eterno 2', room: 'Bathroom 1', installedAt: daysAgo(1100), lastServiceAt: daysAgo(380) },
    { home: ananyaHome._id, type: 'water_purifier', label: 'Kitchen RO', make: 'Kent', model: 'Grand Plus', room: 'Kitchen', installedAt: daysAgo(600), lastServiceAt: daysAgo(95) },
    { home: ananyaHome._id, type: 'washing_machine', make: 'LG', model: 'FHM1207', room: 'Utility', installedAt: daysAgo(700), warrantyExpiresAt: daysAgo(-20) },
  ]);
  for (const c of customers.slice(3, 20)) {
    const h = homesByCustomer.get(String(c._id));
    await Asset.insertMany([{ home: h._id, type: 'air_conditioner', make: pick(['LG', 'Voltas', 'Daikin', 'Blue Star']), installedAt: daysAgo(between(200, 1500)) }, { home: h._id, type: 'geyser', make: pick(['Racold', 'AO Smith', 'Bajaj']), installedAt: daysAgo(between(200, 1500)) }, ...(rnd() > 0.4 ? [{ home: h._id, type: 'water_purifier', make: pick(['Kent', 'Aquaguard']), installedAt: daysAgo(between(100, 900)) }] : [])]);
  }

  // --------------------------------------------- Invites (§3.8 migration)
  for (const pro of activePros.filter((_, i) => i % 3 === 0)) {
    const invitees = customers.slice(20).filter(() => rnd() > 0.82).filter((c) => !c.invitedBy?.pro).slice(0, 3);
    const invite = await Invite.create({ code: `seed${pro.harmoniaId.slice(-4)}`, pro: pro._id, channel: 'whatsapp', label: 'My regular customers', opens: invitees.length + Math.floor(between(1, 5)), activated: invitees.map((c) => ({ customer: c._id, at: daysAgo(80) })), createdAt: daysAgo(85) });
    for (const c of invitees) {
      c.invitedBy = { pro: pro._id, invite: invite._id, at: daysAgo(80) };
      c.preferredPros.push({ pro: pro._id, category: pro.skills[0].category, source: 'invite', addedAt: daysAgo(80) });
      await c.save();
    }
  }

  // ---------------------------------------------------- Historic jobs
  console.log('[seed] generating historic jobs through the ledger…');
  const weights = { ELEC: 30, PLMB: 30, ACRP: 18, CARP: 8, DCLN: 7, TUTR: 3, ITSP: 4 };
  const pool = Object.entries(weights).flatMap(([k, w]) => Array(w).fill(k));
  let made = 0;
  const loyal = new Map(); // customer → pro per category, to model repeat behaviour

  for (let d = 100; d >= 1; d -= 1) {
    const perDay = d > 70 ? 1 : d > 35 ? 2 : 3;
    for (let n = 0; n < perDay; n += 1) {
      const customer = rnd() < 0.35 ? customers[Math.floor(rnd() * 3)] : pick(customers);
      const code = pick(pool);
      const category = catBy[code];
      const candidates = prosFor(code);
      if (!candidates.length) continue;
      const key = `${customer._id}:${code}`;
      const pro = customer.invitedBy?.pro && candidates.some((p) => String(p._id) === String(customer.invitedBy.pro)) && rnd() < 0.8
        ? candidates.find((p) => String(p._id) === String(customer.invitedBy.pro))
        : loyal.get(key) && rnd() < 0.7 ? loyal.get(key) : (rnd() < 0.3 ? candidates[0] : pick(candidates));
      loyal.set(key, pro);
      const home = homesByCustomer.get(String(customer._id));
      const card = category.rateCards[0];
      const jt = pick(card.jobTypes);
      const partsUsed = jt.standardParts && rnd() > 0.35 ? [{ name: `${jt.name.split(' ')[0]} spare part`, qty: 1, unitPrice: Math.round(jt.standardParts * between(0.6, 1.1) / 100) * 100 }] : [];
      const price = normalisePrice({ visit: card.visitCharge, labour: jt.labour, parts: partsUsed });
      const created = daysAgo(d, between(8, 21));
      const mode = rnd() < 0.2 ? 'cash' : 'online';
      const priorityTip = category.archetype === 'A' && rnd() < 0.08 ? rupees(pick([50, 100])) : 0;
      const assignSec = Math.round(between(15, 140));
      const feeHoliday = String(customer.invitedBy?.pro) === String(pro._id) && d <= 90;

      let job = await Job.create({
        ref: await seedRef(created),
        customer: customer._id, home: home._id, community: home.community, professional: pro._id,
        asset: customer === ananya && code === 'ACRP' ? assets[0]._id : undefined,
        category: code, categoryName: category.name, archetype: category.archetype, city: 'Bengaluru', stateCode: 'KA',
        jobType: { code: jt.code, name: jt.name, labour: jt.labour, standardParts: jt.standardParts, durationMin: jt.durationMin },
        route: category.archetype === 'A' ? (rnd() < 0.25 ? 'named' : 'instant') : 'scheduled', scheduledAt: category.archetype === 'A' ? undefined : created,
        description: jt.name, location: home.location, address: { line: home.address.line, block: home.address.block, communityName: communities.find((c) => c._id.equals(home.community))?.name },
        priceBand: { visit: card.visitCharge, min: card.visitCharge + jt.labour, max: card.visitCharge + jt.labour + jt.standardParts },
        quote: { status: 'approved', price, submittedAt: created, decidedAt: created }, priorityTip, paymentMode: mode, feeHoliday,
        state: S.PAID, assignedAt: new Date(created.getTime() + assignSec * 1000), eta: new Date(created.getTime() + 35 * 60000),
        arrivedAt: new Date(created.getTime() + 32 * 60000), startedAt: new Date(created.getTime() + 38 * 60000), completedAt: new Date(created.getTime() + (38 + jt.durationMin) * 60000),
        confirmedAt: new Date(created.getTime() + (50 + jt.durationMin) * 60000), paidAt: new Date(created.getTime() + (50 + jt.durationMin) * 60000),
        dispatch: { mode: 'waves', wave: 1, assignmentSec: assignSec, startedAt: created },
        timeline: [S.CREATED, S.DISPATCHING, S.ASSIGNED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.WORK_COMPLETE, S.CUSTOMER_CONFIRMED, S.PAID].map((st, i) => ({ state: st, at: new Date(created.getTime() + i * 12 * 60000), actor: 'seed' })),
        warranty: { expiresAt: new Date(created.getTime() + category.warrantyDays * 86400000) },
        ratings: { windowClosesAt: new Date(created.getTime() + 3 * 86400000) },
      });
      if (mode === 'online') {
        job = await holdInEscrow(job, price.total + priorityTip, 'quote');
        job = await settleOnline(job);
      } else {
        job = await settleCash(job);
      }

      // Ratings on both sides; most jobs good, a few poor.
      const good = rnd() > 0.1;
      const base = good ? (pro.skills[0].level >= 4 ? 5 : 4) : 2;
      const sc = () => Math.max(1, Math.min(5, base + (rnd() < 0.25 ? -1 : 0)));
      const scores = { quality: sc(), punctuality: sc(), conduct: sc(), cleanliness: sc(), priceFairness: sc() };
      const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 5);
      if (rnd() < 0.85) {
        await Rating.create({ job: job._id, direction: 'customer_to_pro', rater: customer._id, pro: pro._id, customer: customer._id, category: code, scores, overall, reasonCode: overall < 3 ? pick(['late_arrival', 'poor_workmanship', 'overcharged']) : undefined, text: overall >= 4 && rnd() < 0.5 ? pick(PRO_TEXT) : undefined, visible: true, createdAt: job.paidAt });
        await Rating.create({ job: job._id, direction: 'pro_to_customer', rater: pro.user, pro: pro._id, customer: customer._id, category: code, scores: { respect: 5, clarity: pick([4, 5]), paymentPromptness: 5 }, overall: 5, visible: true, createdAt: job.paidAt });
        await Job.collection.updateOne({ _id: job._id }, { $set: { state: S.CLOSED, closedAt: job.paidAt, 'ratings.customerRated': true, 'ratings.proRated': true, 'ratings.revealed': true }, $push: { timeline: { state: S.CLOSED, at: job.paidAt, actor: 'system' } } });
        if (overall >= 4 && rnd() < 0.3 && mode === 'online') {
          const amount = rupees(pick([30, 50, 50, 100]));
          await payTip(job, amount, 1);
          await Job.collection.updateOne({ _id: job._id }, { $push: { tips: { amount, at: job.paidAt, txn: 'seed' } } });
        }
        if (overall >= 4 && !customer.preferredPros.some((p) => String(p.pro) === String(pro._id) && p.category === code) && rnd() < 0.45) {
          customer.preferredPros.push({ pro: pro._id, category: code, source: 'job', addedAt: job.paidAt });
          await customer.save();
        }
      }

      await HomeRecord.create({
        home: home._id, job: job._id, asset: job.asset, date: job.paidAt, professional: pro._id, professionalName: pro.displayName, harmoniaId: pro.harmoniaId,
        category: code, categoryName: category.name, workDone: jt.name, parts: price.parts, cost: job.pricing.gross, warrantyExpiresAt: job.warranty.expiresAt,
      });

      // Occasional workmanship failure → warranty rework by the same pro.
      if (!good && rnd() < 0.5 && category.warrantyDays) {
        const rw = created.getTime() + 6 * 86400000;
        await Job.create({
          ref: await seedRef(new Date(rw)),
          customer: customer._id, home: home._id, community: home.community, professional: pro._id, category: code, categoryName: category.name, archetype: category.archetype,
          jobType: job.jobType, route: 'warranty', requestedPro: pro._id, description: `Warranty claim on ${job.ref}: problem returned`, location: home.location, address: job.address,
          priceBand: { min: 0, max: 0, visit: card.visitCharge }, state: S.CLOSED, paidAt: new Date(rw), closedAt: new Date(rw),
          warranty: { parentJob: job._id, originalPro: pro._id, reason: 'Problem returned' }, reworkAttributedTo: pro._id,
          quote: { status: 'approved', price: normalisePrice({}) }, pricing: { gross: 0, netToPro: 0, platformFee: 0 }, payment: { status: 'released' },
          timeline: [{ state: S.CREATED, at: new Date(rw), actor: 'seed' }, { state: S.CLOSED, at: new Date(rw), actor: 'seed' }],
        });
      }

      // Back-date everything this job wrote.
      await Job.collection.updateOne({ _id: job._id }, { $set: { createdAt: created, updatedAt: job.paidAt } });
      await Rating.collection.updateMany({ job: job._id }, { $set: { createdAt: job.paidAt } });
      await LedgerTxn.collection.updateMany({ job: job._id }, { $set: { createdAt: job.paidAt } });
      made += 1;
    }
  }

  // Stats the ledger cannot derive: offers, arrivals.
  for (const pro of pros) {
    const done = await Job.countDocuments({ professional: pro._id, route: { $ne: 'warranty' } });
    const first = await Job.findOne({ professional: pro._id }).sort({ paidAt: 1 }).select('paidAt').lean();
    await Professional.collection.updateOne({ _id: pro._id }, { $set: {
      'stats.offers': Math.round(done * 1.6), 'stats.accepted': done, 'stats.declined': Math.round(done * 0.5),
      'stats.arrivals': done, 'stats.onTimeArrivals': Math.round(done * between(0.82, 0.98)),
      'stats.cancelledAfterAccept': done > 10 && rnd() < 0.3 ? 1 : 0, 'stats.firstJobAt': first?.paidAt,
    } });
    await recomputePro(pro._id);
  }
  for (const c of customers) await recomputeCustomer(c._id);

  // ------------------------------------------------ An open dispute for ops
  const rahul = customers[1];
  const rh = homesByCustomer.get(String(rahul._id));
  const plumber = prosFor('PLMB')[1];
  const card = catBy.PLMB.rateCards[0];
  const jt = card.jobTypes.find((j) => j.code === 'PIPE');
  const price = normalisePrice({ visit: card.visitCharge, labour: jt.labour + rupees(250), parts: [{ name: 'CPVC pipe + elbow', qty: 2, unitPrice: rupees(180) }] });
  let dj = await Job.create({
    ref: `HJ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-9001`, customer: rahul._id, home: rh._id, community: rh.community, professional: plumber._id,
    category: 'PLMB', categoryName: 'Plumbing', archetype: 'A', jobType: { code: jt.code, name: jt.name, labour: jt.labour, standardParts: jt.standardParts, durationMin: jt.durationMin },
    route: 'instant', description: 'Leak under kitchen sink', location: rh.location, address: { line: rh.address.line, block: rh.address.block, communityName: 'Lakeview Enclave' },
    priceBand: { visit: card.visitCharge, min: card.visitCharge + jt.labour, max: card.visitCharge + jt.labour + jt.standardParts },
    quote: { status: 'approved', price: normalisePrice({ visit: card.visitCharge, labour: jt.labour, parts: [] }), submittedAt: daysAgo(1), decidedAt: daysAgo(1) },
    scopeRevisions: [{ price, reason: 'Second joint also cracked — needs extra pipe and elbow', status: 'approved', proposedAt: daysAgo(1), decidedAt: daysAgo(1) }],
    state: S.WORK_COMPLETE, paymentMode: 'online', assignedAt: daysAgo(1), arrivedAt: daysAgo(1), startedAt: daysAgo(1), completedAt: daysAgo(0.9), confirmDueAt: daysAgo(-0.1),
    dispatch: { mode: 'waves', wave: 1, assignmentSec: 48, startedAt: daysAgo(1) },
    timeline: [S.CREATED, S.DISPATCHING, S.ASSIGNED, S.EN_ROUTE, S.ARRIVED, S.IN_PROGRESS, S.SCOPE_REVISED, S.IN_PROGRESS, S.WORK_COMPLETE].map((st, i) => ({ state: st, at: new Date(daysAgo(1).getTime() + i * 10 * 60000), actor: 'seed' })),
  });
  dj = await holdInEscrow(dj, price.total, 'quote');
  await raiseDispute(dj._id, rahul, { reason: 'price_disagreement', description: 'I approved one extra joint, but the final price includes ₹250 more labour than we discussed on the phone. The leak is fixed.' });

  const count = await Job.countDocuments();
  console.log(`[seed] ${made} historic jobs, ${count} total jobs, ${pros.length} professionals, ${customers.length} customers`);
  console.log(`
  Demo sign-in (OTP is shown on screen in development):
    Customer      9000000001  Ananya Rao — Palm Grove Residency
    Customer      9000000002  Rahul Menon — has an open dispute
    Professional  9100000001  Ravi Kumar — electrician
    Professional  9100000002  Venkatesh R — plumber
    Professional  9100000003  Naveen Reddy — AC technician
    Ops           9000000000  Aisha (Ops Lead)
    Ops reviewer  9000000009  Dev (for dispute appeals)
  `);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
