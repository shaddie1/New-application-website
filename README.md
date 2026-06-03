# OnyxHawk

Premium cleaning service platform — mobile + customer web + admin web sharing a single Fastify/Postgres backend.

## Repo layout

```
apps/
  api/          Fastify + Prisma + PostgreSQL backend (M-Pesa Daraja integration)
  mobile/       Expo (React Native) — customer and crew (role-gated)
  admin/        Next.js admin portal (port 4100)
  web/          Next.js customer portal (port 4200)
packages/
  types/        Shared TypeScript types (booking DTOs, M-Pesa payloads, ...)
  ui-tokens/    Design tokens extracted from the mockups
docs/           Schema notes, architecture decisions
mockups/        Design source-of-truth (16 screens)
memory/         Claude project memory
```

## Quick start

```powershell
# Install deps (once)
pnpm install

# Run everything
pnpm dev

# Run a single workspace
pnpm --filter @onyxhawk/api dev
pnpm --filter @onyxhawk/mobile dev
```

## Per-app docs
- API: [`apps/api/README.md`](apps/api/README.md)
- Mobile: [`apps/mobile/README.md`](apps/mobile/README.md)
- Domain schema rationale: [`docs/schema.md`](docs/schema.md)

## Status
v0 scaffold. Domain schema is locked (`apps/api/prisma/schema.prisma`). API, mobile, admin and the
customer web portal (`apps/web`) all build; the web portal covers auth, the booking flow with M-Pesa
STK push, bookings, loyalty and profile against the shared API.
