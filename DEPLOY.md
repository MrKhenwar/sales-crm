# Deploying the CRM to production

Target stack: **Vercel** (Next.js app + cron) + **Neon** (Postgres). Both have generous free tiers; a sales team of <10 stays free.

Estimated time: **15-30 minutes** first time.

## Step 0 — Prereqs

- A **GitHub** account: https://github.com/signup (free)
- A **Neon** account: https://neon.tech (free, sign in with GitHub)
- A **Vercel** account: https://vercel.com/signup (free, sign in with GitHub)

## Step 1 — Push to GitHub

I've already initialized the git repo. On GitHub:

1. Go to https://github.com/new
2. Name the repo `sales-crm` (or anything you like). Keep it **private**.
3. Leave "Initialize this repository" boxes UNCHECKED.
4. Click **Create repository**.
5. Copy the URL shown (e.g., `git@github.com:YOUR_USERNAME/sales-crm.git`).

Back in your terminal:

```bash
cd ~/Desktop/Work/CRM
git remote add origin git@github.com:YOUR_USERNAME/sales-crm.git
git branch -M main
git push -u origin main
```

If `git push` asks about authentication, follow https://docs.github.com/en/authentication/connecting-to-github-with-ssh (5 min, one time).

## Step 2 — Create the Neon database

1. Sign in to https://console.neon.tech
2. Click **Create a project**. Name it `sales-crm`. Region: pick whatever's closest to your team (e.g. `Asia/Singapore` for India).
3. After ~10 seconds, you'll see the **Connection string** panel:
   - **Pooled connection** → switch this on (the toggle near the top)
   - Copy the string. It looks like:
     ```
     postgresql://neondb_owner:PASSWORD@ep-xxxx.singapore-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
     ```
4. Hold onto that string — you'll paste it as `DATABASE_URL` on Vercel.

## Step 3 — Deploy on Vercel

1. Sign in to https://vercel.com/new
2. Click **Import** next to your `sales-crm` repo.
3. **Framework Preset** auto-detects "Next.js" — leave as-is.
4. Expand **Environment Variables** and paste these values (use the ones I generated for you when running `openssl rand`; or generate fresh ones with `openssl rand -hex 32`):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | (Neon pooled string from Step 2) |
   | `AUTH_SECRET` | (long hex string) |
   | `NEXTAUTH_SECRET` | (same long hex string as AUTH_SECRET) |
   | `NEXTAUTH_URL` | (leave blank for now — fill after first deploy) |
   | `CRON_SECRET` | (long hex string, different from above) |
   | `INITIAL_MANAGER_EMAIL` | your real email |
   | `INITIAL_MANAGER_PASSWORD` | a strong password you'll change |
   | `INITIAL_MANAGER_NAME` | your full name |
   | `INITIAL_MANAGER_PHONE` | +91... |
   | `INITIAL_SALESPERSON_EMAIL` | another email |
   | `INITIAL_SALESPERSON_PASSWORD` | a strong password |
   | `INITIAL_SALESPERSON_NAME` | their name |
   | `INITIAL_SALESPERSON_PHONE` | +91... |
   | `TELEPHONY_PROVIDER` | `direct` |
   | `WHATSAPP_TEMPLATE` | `Hi {name}, this is from our sales team — is now a good time to chat?` |

5. Click **Deploy**. It takes 2-3 min.
6. When it shows "Congratulations!", you'll see a URL like `https://sales-crm-abc.vercel.app`. **Copy that.**
7. **Settings → Environment Variables** → edit `NEXTAUTH_URL`, paste your Vercel URL (no trailing slash) → **Save**.
8. **Deployments** → latest → click `…` → **Redeploy** (so the new `NEXTAUTH_URL` takes effect).

## Step 4 — Migrate the production DB

Once Vercel shows "Ready":

```bash
cd ~/Desktop/Work/CRM

# Use the production DB just for this command.
# (Paste the full Neon connection string between quotes.)
DATABASE_URL="postgresql://neondb_owner:...@ep-xxx.aws.neon.tech/neondb?sslmode=require" \
  npx prisma migrate deploy
```

You should see "All migrations have been successfully applied." That creates every table in your Neon DB.

## Step 5 — Seed the first users

Set the initial-user env vars locally (matching what you put on Vercel), then run the seed against the production DB:

```bash
DATABASE_URL="postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require" \
  INITIAL_MANAGER_EMAIL="you@yourcompany.com" \
  INITIAL_MANAGER_PASSWORD="YourPassword123!" \
  INITIAL_MANAGER_NAME="Your Name" \
  INITIAL_SALESPERSON_EMAIL="sales@yourcompany.com" \
  INITIAL_SALESPERSON_PASSWORD="OtherPassword123!" \
  INITIAL_SALESPERSON_NAME="Sales Person" \
  npm run db:seed
```

It'll print the credentials it created.

## Step 6 — Sign in

Open your Vercel URL → sign in with the manager credentials → confirm the dashboard loads. Then sign out, sign in as the salesperson, confirm that role works too.

## Step 7 — Point the Android app at production

On the salesperson's phone:

1. Open the **Sales Call Sync** app
2. **Sync** tab → change Server URL from `http://192.168.1.69:3000` to your Vercel URL (e.g., `https://sales-crm-abc.vercel.app`)
3. Generate a new API token at `https://your-app.vercel.app/profile` and paste it
4. **Save** → **Test connection** (should say "Connection OK")

## Step 8 — Adding more salespeople

Until the user-management UI ships, add salespeople via SQL on Neon's web console (or any psql client):

```sql
-- generate a bcrypt hash first via Node:  node -e 'console.log(require("bcryptjs").hashSync("Their@Password", 10))'

INSERT INTO "User" (id, name, email, "passwordHash", role, phone, active)
VALUES (
  'sp_' || gen_random_uuid()::text,
  'Their Name',
  'their.email@yourcompany.com',
  '$2b$10$PASTE_THE_BCRYPT_HASH_HERE',
  'SALESPERSON',
  '+91...',
  true
);
```

## What happens after deploy

- **Vercel Cron** fires `/api/cron/sla-check` every minute and `/api/cron/sync-sheet` every 5 minutes — replaces the in-process scheduler that runs locally.
- **Auto SSL** for `*.vercel.app` (or your custom domain).
- **Push to main → auto-redeploy** — anything you change locally, commit and push, Vercel rebuilds.
- **Database backups** — Neon snapshots automatically; restore from a point-in-time on the free tier.

## Common gotchas

- **"Database connection error" on Vercel** — make sure you used Neon's **Pooled** connection string, not the direct one. Vercel's serverless functions need pooling.
- **"NEXTAUTH_URL not configured"** — re-check you set it AND redeployed after.
- **Cron jobs not firing** — Vercel cron is only on the **Hobby (free)** plan once a day. To run every minute you need the **Pro plan ($20/mo)** OR use an external scheduler (e.g., GitHub Actions hitting your URL with the `CRON_SECRET`). For internal sales tools, the simpler workaround is to hit `/api/cron/sla-check?secret=...` from cron-job.org (free) every minute.
- **Phone can't reach the server** — production URLs are HTTPS, so the Android app's `usesCleartextTraffic` won't matter; the WebView will load `https://...` fine.

## Future: custom domain

In Vercel: **Project → Settings → Domains → Add**. Vercel walks you through DNS records. Then update `NEXTAUTH_URL` env var to the new domain and redeploy.
