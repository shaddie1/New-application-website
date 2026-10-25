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
- **Cloudflare R2 (photos and documents)** — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Booking photos and documents degrade
  gracefully if unset, but website jobs need it (section 5a).

---

## 5a. Website jobs

Staff publish finished jobs from **Website jobs** in admin; the site's "Our work" section and
portfolio are built from them. Publishing rebuilds `onyxhawk-web`, so a change shows on the site
within about five minutes.

1. **Photo storage.** Set the five `R2_*` variables on `onyxhawk-api`. `R2_PUBLIC_URL` must be a
   custom subdomain of `onyxhawkcleaningservice.com` connected to the bucket (R2 → bucket →
   Settings → Custom Domains), never the bucket's `r2.dev` address, which Cloudflare rate-limits
   and reserves for development. Each photo row stores its full URL, so changing host later
   means rewriting every row.
2. **Bucket CORS.** Allow `PUT` with a `Content-Type` header from
   `https://admin.onyxhawkcleaningservice.com`, since the admin page uploads straight to the bucket.
3. **Deploy hook.** Render → `onyxhawk-web` → Settings → Deploy Hook. Copy the URL into
   `WEB_DEPLOY_HOOK_URL` on `onyxhawk-api`. Without it, publishing works but the site does not
   rebuild, and admin says so.
4. **Build guard.** `REQUIRE_WEBSITE_JOBS=1` on `onyxhawk-web` (already in `render.yaml`) makes a
   build fail when it cannot fetch published jobs, so the previous site stays live. `turbo.json`
   passes the variable through and never caches the web build, because a deploy-hook rebuild
   reuses the same commit.
5. **Release order.** Ship the API and admin first and confirm the API deploy succeeded. Staff then
   enter the existing site photos as jobs (originals in `apps/web/public/photos/`). Ship the web
   change last, so its first build already has jobs to show.

---

## 5b. Primary owner

The primary owner (Shadrack Amihanda, the majority shareholder) is the only person who can change
another owner's role or email. In the app nobody, him included, can change his sign-in email or
phone, change his role or remove him. Those changes are made with the scripts below, by someone with
production database access.

Run them from a checkout of the repo with dependencies installed, using the production
`DATABASE_URL` (Render → `onyxhawk-api` → Environment). Never commit it or paste it anywhere else.

**Set the primary owner.** Once, after the deploy that adds the `isPrimaryOwner` column. The account
must already be an owner.

```bash
DATABASE_URL="<production>" pnpm --filter @onyxhawk/api set-primary-owner +254115247988
```

It refuses when someone else is already the primary owner. Running it again for the same person
changes nothing.

**Change the primary owner's sign-in email or phone.**

1. Check that the new mailbox exists and receives mail, since sign-in codes go there.
2. Preview the change. This prints the current and new values and writes nothing:

   ```bash
   DATABASE_URL="<production>" pnpm --filter @onyxhawk/api change-primary-owner-contact --email new@onyxhawkcleaningservice.com
   ```

   Use `--phone +2547XXXXXXXX` for the phone, or pass both flags.
3. Run the same command again with `--apply`. The new details, signing him out everywhere and
   voiding any unused sign-in codes are written in one transaction.
4. He signs in at `admin.onyxhawkcleaningservice.com` with the new email.

The script refuses an email or phone that another account already uses.

**His name** can still be changed through his own profile (`PATCH /profile`). His email and phone
cannot.

**Hand the role to someone else.** This is not scripted. In the Neon SQL editor run
`UPDATE "User" SET "isPrimaryOwner" = false WHERE "isPrimaryOwner";`, then run `set-primary-owner`
with the new person's phone. Until that second step, nobody can change an owner.

---

## 6. Mobile (Expo) — when ready

1. Set the production API URL in [`apps/mobile/app.json`](apps/mobile/app.json) under `extra.apiUrl`
   (`https://api.onyxhawkcleaningservice.com`) — see [apps/mobile/src/config.ts](apps/mobile/src/config.ts).
2. `eas build` then `eas submit`. Requires Apple Developer ($99/yr) + Google Play ($25 once); both stores review.

---

## Env var checklist

**API (Render)** — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV=production`, `HOST=0.0.0.0`,
`MPESA_BASE_URL`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`,
`MPESA_CALLBACK_URL`, `AT_USERNAME`, `AT_API_KEY`, `SMS_SENDER_ID`, `R2_*` (required for website
jobs), and `WEB_DEPLOY_HOOK_URL`.

**Web & Admin (Cloudflare Pages)** — `NEXT_PUBLIC_API_URL`. Web also sets `REQUIRE_WEBSITE_JOBS=1`.

---

## Post-deploy smoke test

1. `GET https://api.onyxhawkcleaningservice.com/health/ready` → `db:up`.
2. Open `https://onyxhawkcleaningservice.com/services` → live catalog loads.
3. Sign in with a real phone → SMS OTP arrives (needs Africa's Talking).
4. Book a clean → M-Pesa STK prompt on your phone (needs Daraja Go-Live).
5. `https://admin.onyxhawkcleaningservice.com` → sign in as an `ADMIN` user, see the booking.
