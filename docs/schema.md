# OnyxHawk — Domain Schema

Companion notes to [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Explains *why* each cluster of tables exists and which design screens depend on them.

## Modules at a glance

| Module | Tables | Screens it powers |
|---|---|---|
| Identity & access | `User`, `OtpCode`, `RefreshToken` | 01 Sign in, 02 Create account, 13 Profile |
| Addresses | `Address` | 06 Date & address, 13 Profile (Saved addresses) |
| Catalog | `ServiceLine`, `CleanType`, `AddOn` | 04 Service catalog, 05 Scope, 08 Book a clean |
| Bookings | `Booking`, `BookingAddOn`, `BookingCrew`, `BookingPhoto` | 03 Home, 05–11 |
| Quotes | `QuoteRequest`, `QuoteRequestPhoto` | 12 Quote request |
| Payments | `PaymentMethod`, `Payment`, `MpesaTransaction`, `CustomerCredit`, `PromoCode` | 07 Confirmation, 15 Payment, 16 M-Pesa STK |
| Loyalty | `HawkPointsLedger`, `PointsRule` | 03 Home (tier hint), 07 (earn preview), 11 (per-room pts), 14 Hawk Points |
| Notifications | `NotificationPreference`, `Notification` | 03 Home (bell), 13 Profile |

## Key design decisions

### Money is always stored as integer KES cents
Daraja's STK Push API only accepts whole KES, so we convert at the API boundary. Storing in cents (instead of decimal) avoids floating-point drift in the ledger and matches what M-Pesa receipts return.

### Booking pricing is snapshotted at booking time
`Booking.basePriceCents`, `addOnsTotalCents`, `travelFeeCents`, `discountCents`, `totalCents` — and `BookingAddOn.priceCentsAtBooking` — all freeze the price the customer agreed to. If catalog prices change later, the historical receipt on screen 15 stays correct.

### Bookings have a series parent for recurrence
Screen 10 shows "Recurring" badges (office janitorial). Rather than expand the whole future series eagerly, we materialize the next N occurrences and link each child instance back to a `seriesParentId`. Cancelling an instance vs. cancelling the series is the same model, just different scopes.

### Booking references are human-readable
Screen 07 shows `OH-2406-371`. The format is `OH-{YYMM}-{seq within month}`. Generated server-side inside the booking-confirm transaction so two simultaneous confirmations can't collide.

### M-Pesa STK Push has its own lifecycle table
`Payment` is the generic payment record (used by cards too). `MpesaTransaction` holds the Daraja-specific fields — `MerchantRequestID`, `CheckoutRequestID`, `ResultCode`, the raw callback payload. The STK overlay (screen 16) reads `Payment.status` (`REQUESTED` → `AWAITING_USER` → `SUCCEEDED`/`FAILED`/`TIMED_OUT`).

The 60-second timeout shown in the UI is a UI concern, not a DB one — we mark it `TIMED_OUT` only if the Daraja callback never arrives.

### Hawk Points is an append-only ledger
The "Recent points" list on screen 14 is exactly this table, ordered by `createdAt DESC`. We never UPDATE or DELETE — corrections are new `ADJUSTMENT` rows. `balanceAfter` is denormalized so the home/profile chip can read one row instead of summing.

`PointsRule` lives in the DB so marketing can change the `10 pts / KSh 100` ratio, the weekend multiplier, or the referral bonus without a deploy.

### Per-room photo points
Screen 11 says: *"Slide to compare. Add missing rooms to earn full points."* That means: photo documentation is a separate points payout (`reason = PHOTO_DOCUMENTATION`), credited per fully-documented room (both BEFORE and AFTER present). The completion job for a booking iterates rooms and writes ledger rows accordingly.

### CustomerCredit is separate from PromoCode
Screen 15 shows a `First-clean credit -800`. That's a per-user balance, not a code — earned automatically on first booking or via refunds/goodwill. `PromoCode` is the code field at the bottom of the same screen — global, multi-redemption, expirable.

### Quote requests are a parallel funnel, not a booking variant
Hospital and Post-construction often show "On quote" on the catalog. A `QuoteRequest` has its own status machine (`PENDING` → `SITE_VISIT_SCHEDULED` → `QUOTED` → `WON`/`LOST`). When `WON`, we create a real `Booking` and store its id in `convertedBookingId` for traceability.

## Things deferred (deliberately not in the schema yet)

- **Multi-tenancy.** Single OnyxHawk instance for now; no `tenant_id` columns.
- **Audit log.** Useful for the admin web; revisit when that surface starts.
- **Geo-routing / crew availability optimizer.** Crew assignment is a foreign-key today; routing optimization can layer on later without schema changes.
- **Internationalization of catalog text.** All `name`/`description` fields are single-language. If we expand beyond KE, add a `ServiceLineTranslation` table — don't widen existing rows.
- **Webhooks for the admin web.** Cards (Stripe?) and B2B invoicing — out of scope until we confirm we want card on launch.

## Decisions logged (2026-05-25)

### Launch payments: M-Pesa only
No card processing at launch. `PaymentMethod` holds only `mpesaPhone`; `PaymentProvider` enum is `MPESA_STK | WALLET_CREDIT`. The Visa card visible on screen 15 will be hidden in the UI for v1. Card support can extend `PaymentMethod` in place later — don't introduce a parallel `Card` table.

### Crew uses the same RN app
Crew members are `User` rows with `role = CREW` or `CREW_LEAD`. The mobile app switches into a crew view based on role. There is no separate `Crew` table. `BookingCrew.userId` is the assignment FK; `BookingPhoto.takenByUserId` is the photographer FK. The `CrewRole` enum is now scoped only to `BookingCrew.role` (LEAD vs MEMBER on a specific booking — a person who's normally `CREW` can still be LEAD on a given job).

### Tier thresholds (proposed defaults)

Tier is derived from **lifetime earned points** (`User.lifetimeEarnedPoints`), not current balance — otherwise redeeming points would demote the user. The points-to-KSh ratio implied by the mockups is `10 pts / KSh 100`, i.e. 1 pt ≈ KSh 1, which lets us reason about tiers in spending terms.

| Tier | Lifetime points | Implied lifetime spend | Notes |
|---|---|---|---|
| Bronze | 0 | KSh 0 | Default on signup |
| Silver | 500 | ~KSh 5,000 | First few cleans |
| Gold | 1,000 | ~KSh 10,000 | Regular customer (screen 14 shows 1,240 pts is Gold ✓) |
| Platinum | 2,000 | ~KSh 20,000 | Loyalty target (screen 14 shows "760 pts to Platinum" from 1,240 ✓) |

These match the numbers visible in the design. Thresholds live as constants in the API (see `apps/api/src/loyalty/tiers.ts` once scaffolded) rather than a DB table — they change rarely, and a deploy is acceptable.

Tier perks (to be defined later, but the schema doesn't gate this):
- Silver: priority slot pick
- Gold: 5% off recurring contracts
- Platinum: free travel fee + member-only rates

## Still-open questions (not blocking)

- **Cancellation policy**: should the schema track `cancellationFeeCents` separately (vs just `totalCents` rollback)? Affects how refunds are issued. Can defer until the cancellation UX is finalised.
- **Crew-side UI**: schema is ready, but we'll need crew-only screens (jobs assigned today, upload before/after, mark room done). Not in the current mockup pack — likely a follow-up design pass.
