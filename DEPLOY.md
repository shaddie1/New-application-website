# Deploying OnyxHawk

This guide takes the stack live on a free/low-cost setup:

| Piece | Host | Free tier | URL |
|---|---|---|---|
| **Database** (Postgres) | **Neon** | yes (auto-suspends when idle) | — |
| **API** (Fastify) | **Render** | yes (spins down ~15m idle) | `api.onyxhawkcleaningservice.com` |
| **Web portal** (Next.js) | **Cloudflare Pages** | yes (commercial OK) | `onyxhawkcleaningservice.com` |
| **Admin portal** (Next.js) | **Cloudflare Pages** | yes | `admin.onyxhawkcleaningservice.com` |
| **Mobile** (Expo) | App Store / Play | — | — |

Your domain `onyxhawkcleaningservice.com` is already on Cloudflare, so DNS for all of the above is one place.

> **Free-tier reality check**
> - Neon and Render free tiers **idle-suspend**, so the first request after a quiet period is slow (cold start). Fine for launch/demo; move the API to Render **Starter (~$7/mo)** and Neon paid before real traffic.
> - Vercel's free tier is **non-commercial only**, which is why we use Cloudflare Pages for the sites.

---

## 1. Database — Neon

1. Create a project at https://neon.tech → it gives you a connection string.
2. Use the **pooled** connection string and append `?sslmode=require`, e.g.
   `postgresql://USER:PASS@ep-xxx-pooler.eu-central-1.aws.neon.tech/onyxhawk?sslmode=require`
3. That string is your `DATABASE_URL` for the API (step 2).

Schema + seed are applied automatically by the API deploy (migrations run in `preDeployCommand`; seed once, see step 2).

---

## 2. API — Render

The repo includes [`render.yaml`](render.yaml) (a Render Blueprint).

1. Render dashboard → **New → Blueprint** → connect this GitHub repo. It reads `render.yaml`.
2. Fill the secret env vars (marked `sync:false`) in the dashboard:
   - `DATABASE_URL` — the Neon pooled string from step 1
   - `JWT_SECRET` — 32+ random chars (`openssl rand -base64 48`)
   - `CORS_ORIGIN` — `https://onyxhawkcleaningservice.com,https://admin.onyxhawkcleaningservice.com`
   - M-Pesa + Africa's Talking + R2 — see step 5 (can start empty; payments/SMS/photos just won't work yet)
3. Deploy. Build runs `prisma migrate deploy` automatically (creates all tables from
   [`apps/api/prisma/migrations/`](apps/api/prisma/migrations/)).
4. **Seed the catalog once** (Render dashboard → Shell, or locally pointed at Neon):
   ```bash
   DATABASE_URL="<neon-url>" pnpm --filter @onyxhawk/api db:seed
   ```
5. Custom domain: Render → Settings → Custom Domain → `api.onyxhawkcleaningservice.com`
   (add the CNAME it shows you in Cloudflare DNS).
6. Verify: `https://api.onyxhawkcleaningservice.com/health/ready` → `{"ok":true,"db":"up"}`.

---

## 3. Web & Admin — Cloudflare Pages

Two Pages projects from the same repo (different root directories).

For **web**:
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → this repo.
2. Settings:
   - **Production branch:** `main`
   - **Root directory:** `apps/web`
   - **Framework preset:** Next.js
   - **Build command:** `npx @cloudflare/next-on-pages@1`
   - **Build output directory:** `.vercel/output/static`
   - **Environment variable:** `NEXT_PUBLIC_API_URL=https://api.onyxhawkcleaningservice.com`
   - Add compatibility flag **`nodejs_compat`** (Settings → Functions → Compatibility flags).
3. Custom domain: `onyxhawkcleaningservice.com` (Cloudflare adds the DNS automatically).

For **admin**: repeat with **Root directory:** `apps/admin` and custom domain `admin.onyxhawkcleaningservice.com`.

> **Monorepo note:** the App Router needs the `@cloudflare/next-on-pages` adapter (above). Because this
> is a pnpm workspace, the very first Pages build may need the build command tweaked (install from the
> repo root). If the build errors, share the log — the guaranteed-works fallback is to deploy the two
> Next apps as Node services on Render too (`next build` / `next start`), at a small monthly cost.

---

## 4. DNS (Cloudflare)

In the `onyxhawkcleaningservice.com` zone:
| Record | Name | Target | Set by |
|---|---|---|---|
| Pages | `@` / `www` | web Pages project | Cloudflare Pages (auto) |
| Pages | `admin` | admin Pages project | Cloudflare Pages (auto) |
| CNAME | `api` | Render's `*.onrender.com` host | you (from Render) |

Keep everything proxied (orange cloud) for Cloudflare TLS + CDN.

---

## 5. Third-party credentials (the paid/approval bits)

- **Africa's Talking (SMS OTP)** — **required for login in production.** Without `AT_USERNAME` +
  `AT_API_KEY`, the API throws on OTP send ([apps/api/src/auth/sms.ts](apps/api/src/auth/sms.ts)).
  Also register the alphanumeric sender ID `ONYXHAWK` (approval takes lead time in Kenya).
- **M-Pesa Daraja (production)** — set `MPESA_BASE_URL=https://api.safaricom.co.ke` and the production
  `MPESA_CONSUMER_KEY/SECRET/SHORTCODE/PASSKEY`. `MPESA_CALLBACK_URL` must be
  `https://api.onyxhawkcleaningservice.com/webhooks/mpesa/stk`. Complete Safaricom's **Go-Live** approval.
- **Cloudflare R2 (before/after photos)** — optional; set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Photos degrade gracefully if unset.

---

## 6. Mobile (Expo) — when ready

1. Set the production API URL in [`apps/mobile/app.json`](apps/mobile/app.json) under `extra.apiUrl`
   (`https://api.onyxhawkcleaningservice.com`) — see [apps/mobile/src/config.ts](apps/mobile/src/config.ts).
2. `eas build` then `eas submit`. Requires Apple Developer ($99/yr) + Google Play ($25 once); both stores review.

---

## Env var checklist

**API (Render)** — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`, `HOST=0.0.0.0`,
`MPESA_BASE_URL`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`,
`MPESA_CALLBACK_URL`, `AT_USERNAME`, `AT_API_KEY`, `SMS_SENDER_ID`, and (optional) `R2_*`.

**Web & Admin (Cloudflare Pages)** — `NEXT_PUBLIC_API_URL`.

---

## Post-deploy smoke test

1. `GET https://api.onyxhawkcleaningservice.com/health/ready` → `db:up`.
2. Open `https://onyxhawkcleaningservice.com/services` → live catalog loads.
3. Sign in with a real phone → SMS OTP arrives (needs Africa's Talking).
4. Book a clean → M-Pesa STK prompt on your phone (needs Daraja Go-Live).
5. `https://admin.onyxhawkcleaningservice.com` → sign in as an `ADMIN` user, see the booking.
