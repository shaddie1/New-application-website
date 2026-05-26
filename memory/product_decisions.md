---
name: product-decisions
description: Locked product decisions for OnyxHawk v1 — M-Pesa only at launch, crew shares the customer RN app via roles, loyalty tier thresholds
metadata:
  type: project
---

Decisions locked 2026-05-25 during schema design ([[project-overview]], [[tech-stack]]):

### 1. Payments — M-Pesa only at launch
No card processing on v1. `PaymentMethod` stores only `mpesaPhone`. `PaymentProvider` enum is `MPESA_STK | WALLET_CREDIT`. The Visa card visible on mockup screen 15 will be hidden in the UI for v1. Future card support extends `PaymentMethod` in place (no parallel Card table).

**Why:** Faster to ship; Daraja sandbox + prod are already in hand; KE market reality.

**How to apply:** Don't add card-related fields/PSP integration unless explicitly asked. The payment flow on screen 15 will only show the M-Pesa STK option for now.

### 2. Crew uses the same RN app
No separate crew app. Crew members are `User` rows with `role = CREW` or `CREW_LEAD`. The mobile app switches into a crew view based on role. `BookingCrew.userId` is the assignment FK; the `Crew` table was removed.

**Why:** Halves the mobile codebase. Crew flows (jobs today, upload photos, mark room done) are simple enough to coexist with customer flows behind a role gate.

**How to apply:** Build customer flows first. Crew-only screens are a follow-up pass; reuse the customer app shell. Any code that says "crew" should check `user.role`, not a separate table.

### 3. Loyalty tier thresholds (proposed defaults)
Tier derives from `User.lifetimeEarnedPoints` (NOT current balance — redemption must not demote). Ratio is 10 pts per KSh 100 (confirmed in mockups).

| Tier | Lifetime points |
|---|---|
| Bronze | 0 |
| Silver | 500 |
| Gold | 1,000 |
| Platinum | 2,000 |

Verified against mockup screen 14: user with 1,240 pts shown as Gold ✓; "760 pts to Platinum" → Platinum at 2,000 ✓.

Thresholds live as constants in the API (planned `apps/api/src/loyalty/tiers.ts`), not a DB table. Rare changes are acceptable as a deploy.

**Why:** Numbers chosen to match the visible design and produce reasonable progression (one premium clean → Silver; regular customer → Gold; repeat customer → Platinum).

**How to apply:** When implementing the tier badge / progress bar (home and Hawk Points screens), read from `lifetimeEarnedPoints` against these thresholds. Tier perks (priority slot, recurring discount, free travel fee) are a later product decision.
