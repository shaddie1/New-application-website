---
name: tech-stack
description: Agreed stack for OnyxHawk — Expo + NativeWind mobile, Fastify + Prisma + Postgres backend, Next.js for future admin/customer web, Cloudflare R2 storage, Daraja for M-Pesa
metadata:
  type: project
---

Stack decided 2026-05-25 for the OnyxHawk cleaning service platform ([[project-overview]]):

- **Mobile (first surface):** Expo (React Native) + TypeScript + NativeWind
- **Backend:** Node + TypeScript + Fastify + Prisma + PostgreSQL
- **Storage:** Cloudflare R2 (S3-compatible) for booking before/after photos and quote-request photos
- **Auth:** Phone + OTP (Africa's Talking or Twilio Verify), JWT + refresh-token table
- **Payments:** Direct Daraja integration in the backend (STK Push + C2B callback). User has both sandbox and production Daraja credentials.
- **Future web surfaces:** Next.js 15 App Router (admin first, then customer web)
- **Repo layout:** pnpm + Turborepo monorepo — `apps/mobile`, `apps/api`, future `apps/admin`, `apps/web`, shared `packages/types`, `packages/ui-tokens`

**Why:** User has 3 surfaces planned (mobile + customer web + admin web) and wants to share types/logic across them. React/TS lets all three surfaces share a `packages/types` workspace. Expo gives fastest iteration on mobile and good Android coverage (Kenyan market). Mobile is being built first.

**How to apply:** Place new backend code under `apps/api/`. Mobile code under `apps/mobile/`. Shared TypeScript types (booking DTOs, M-Pesa payloads, etc.) under `packages/types`. Don't put domain logic in `apps/mobile` — it should be reusable when the web surfaces land. Schema currently lives at `apps/api/prisma/schema.prisma` with rationale in `docs/schema.md`.
