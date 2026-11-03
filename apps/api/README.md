# @onyxhawk/api

Fastify + Prisma + PostgreSQL backend.

## Setup

```powershell
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, MPESA_* values

pnpm install
pnpm prisma:generate
pnpm prisma:migrate    # first run will create the DB schema
pnpm db:seed           # populate service catalog + points rules
pnpm dev
```

API listens on `http://localhost:4000` by default.

## Endpoints (so far)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness — process is up |
| GET | `/health/ready` | Readiness — DB reachable |
| POST | `/webhooks/mpesa/stk` | Daraja STK callback (ACK fast, process async) |

## Layout

```
src/
  index.ts          Process entrypoint + graceful shutdown
  server.ts         Fastify factory (plugins + routes)
  env.ts            Zod-validated env (fails fast on misconfig)
  db.ts             Prisma client singleton
  routes/           HTTP handlers
  email/            Branded transactional emails (layout, templates, Resend service)
  loyalty/tiers.ts  Hawk Points tier thresholds
prisma/
  schema.prisma     Domain schema (see ../../docs/schema.md)
  seed.ts           Catalog + points-rule seed (idempotent)
```

## Emails

Every email goes through `src/email/service.ts`. Only production sends, through
Resend; anywhere else each email is written to `email-previews/sent/` and the
log line gives its path.

To check the templates in a browser before deploying:

```powershell
pnpm preview-emails    # writes email-previews/index.html
```
