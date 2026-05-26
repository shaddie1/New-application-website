# OnyxHawk

Premium cleaning service platform — mobile + customer web + admin web sharing a single Fastify/Postgres backend.

## Repo layout

```
apps/
  api/          Fastify + Prisma + PostgreSQL backend (M-Pesa Daraja integration)
  mobile/       Expo (React Native) — customer and crew (role-gated)
  admin/        (planned) Next.js admin portal
  web/          (planned) Next.js customer website
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
v0 scaffold. Domain schema is locked (`apps/api/prisma/schema.prisma`). Customer booking flow next.
