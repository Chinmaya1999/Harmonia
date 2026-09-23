# Harmonia — verified professional network (MERN)

Web implementation of the Harmonia PRD v2.0 Phase 1 MVP: MongoDB · Express · React (Vite) · Node, with Socket.IO for live dispatch.

## Run it

Requires Node 20+ and MongoDB 7 running locally.

```bash
npm run install:all
cp server/.env.example server/.env
npm run seed            # wipes the `harmonia` database and loads the HSR Layout pilot
npm run dev:server      # API + sockets on http://localhost:5050
npm run dev:client      # app on http://localhost:5173
```

In development the sign-in OTP is shown on screen. Demo accounts:

| Phone | Who |
|---|---|
| 9000000001 | Ananya — customer, Palm Grove Residency |
| 9000000002 | Rahul — customer with an open dispute |
| 9100000001 | Ravi — electrician |
| 9100000002 / 9100000003 | Venkatesh — plumber / Naveen — AC technician |
| 9000000000 | Aisha — operations |
| 9000000009 | Dev — second ops reviewer (appeals must be heard by a different person) |

Try it: sign in as Ananya in one browser and Ravi (or another electrician) in a private window, set Ravi to **Available**, then book *Electrical repair → Now*. The offer arrives live with a chime.

## What is built, mapped to the PRD

| Area | PRD | Where |
|---|---|---|
| Harmonia ID, graded tiers 0–5, DigiLocker-style verification (no Aadhaar stored), duplicate detection on hashed PAN/UPI | §4.1–4.2 | `server/src/services/identity.js`, `routes/pro.js`, ops Verification |
| Skill Passport with provenance markers, public profile with QR, WhatsApp preview page, print-to-PDF | §4.3 | `/p/:harmoniaId`, `/share/p/:id` |
| Two-sided, multi-dimension, blind ratings; reason codes; one public response; dispute-excluded ratings | §4.4 | `services/jobs.js` `rate()` |
| Harmonia Score (6 weighted components, recency-weighted, cold-start prior, visible formula, appealable review flag) | §3.5, REP-08 | `services/score.js`, Pro → Passport |
| Five archetypes, category rules, rate cards, depth rule (category live only with enough eligible pros) | §3.1–3.2 | `models/Catalogue.js`, `services/catalogue.js` |
| MatchScore on travel time, configurable per city/category, bounded TipBoost, decaying new-pro allowance, fatigue | §5.2 | `services/matching.js`, ops Matching & rules |
| Dispatch waves 0–4, race-safe idempotent accept, every decision logged with features | §5.3 | `services/dispatch.js`, ops job audit |
| Named booking, scheduled slots, My Harmonia Team with first refusal, "who and why" when unavailable | §3.3, §5.5 | customer Book / Team |
| Job state machine with append-only timeline, arrival OTP, before/after photos (SHA-256 tamper-evident), formal scope revision, not-feasible visit charge | §6.1 | `services/jobMachine.js`, `services/jobs.js` |
| Escrow via payment-aggregator adapter, double-entry immutable idempotent ledger, same-day payout, cash with commission netting, welfare fee as state-configurable module, TDS | §6.3, §8.1 | `services/payments.js`, `services/ledger.js`, ops Ledger |
| Zero-commission tips (after rating only, capped), priority tip, no surge | §3.7 | |
| Harmonia Assurance: warranty, first refusal to original pro, free replacement paid from provision, rework attribution | §6.4 | `raiseWarrantyClaim()` |
| Disputes: escrow hold, auto-assembled evidence file, symmetric decisions, appeal to a different reviewer | §6.5 | ops Disputes |
| Safety: SOS, share live status, masked calling, phone/UPI redaction in chat, woman-pro preference, precautionary suspension | §6.6 | |
| Home Record: multiple homes, asset register, auto-written service history, reminders, JSON export | §6.7 | customer My Homes |
| Customer-book migration: invites, pre-attached team, fee holiday (capped, time-bound), activation stats | §3.8 | Pro → Bring your customers |
| Pilot scorecard with GO / MODIFY / STOP gates and daily 10-minute review | §12.10–12.12 | ops Scorecard |
| Community activation and payback | §2.5 | ops Communities |
| Pro app in English, Hindi, Kannada | §7.1 | `client/src/lib/i18n.js` |

## Integrations stubbed for the sandbox

These run in sandbox mode and are the only places to swap in real providers:
- **Payment aggregator** — `PA.collect/payout/refund` in `server/src/services/payments.js`
- **PAN, DigiLocker, penny drop** — `routes/pro.js` verification handlers
- **Travel time** — `estimateTravelMin()` in `server/src/lib/geo.js` (use a Maps distance-matrix API)
- **OTP delivery, masked calling** — `routes/auth.js`, `POST /jobs/:id/call`

Tax settings (TDS 0.1%, GST 0) and the Karnataka welfare fee are configurable placeholders pending the CA opinion in §8.5.

## Out of scope for Phase 1 (per §9.2)
Bidding marketplace (archetype C), retainers (E), memberships, contractor/company entities, regulated white-collar categories, credit, ONDC.

## Design

Clean, photo-led UI with a motion layer: scroll reveals, page transitions, 3D tilt cards with glare, a mouse-parallax 3D hero stage, Ken Burns photo headers, a marquee and animated counters. All motion is switched off for people who set "reduce motion" in their operating system. Tokens live at the top of `client/src/styles.css`; motion components are in `client/src/components/motion.jsx`.

Photos in `client/public/img` are from Unsplash (Unsplash License, free to use) and are bundled locally. The mapping from categories to photos is in `client/src/lib/media.js`. The names on the landing-page showcase cards (Ravi, Mahesh) are fictional demo profiles from the seed data, not the people in the photos.
