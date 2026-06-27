# Sales CRM

Web CRM for a sales team that works Meta Lead Ads leads. Salespeople call/WhatsApp leads via cloud telephony, log every outcome, and move leads through a labeled pipeline. A manager redistributes leads and views combined + per-person stats.

## Stack

- **Next.js 16** App Router · React Server Components · Server Actions · Turbopack (dev + build)
- **React 19** + **Tailwind v4**
- **Auth.js v5** credentials provider · JWT sessions (no DB round-trip per request)
- **Prisma 7** with the `pg` driver adapter
- **PostgreSQL 16** (local, Homebrew, port **5433** to avoid the system PG18)
- **googleapis** for Sheet ingestion
- **TypeScript strict**

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **1 — Foundation** | scaffold, schema, auth, seed | Done |
| **2 — Leads core** | Lead CRUD, list with filters/search/sort, manual labels, WhatsApp deep links, reassign + audit log | Done |
| **3 — Ingestion** | Meta webhook, Google Sheet sync (manual + cron), CSV import, de-dup, configurable round-robin auto-assign, manager settings UI | Done |
| **4 — Calling** | TelephonyProvider interface (Twilio + Mock), click-to-call, status webhooks, auto-dialer with Start/Pause, after-call feedback modal, recording links, auto-labels from call outcome | Done |
| 5 — Notifications | Real-time + web push | — |
| 6 — Manager dashboard | Shuffle, user mgmt, combined + split stats | — |

## Quick start

```bash
# 1. Install deps
npm install

# 2. Bring up Postgres on 5433 (Homebrew)
brew services start postgresql@16

# 3. Create the dev DB (once)
/opt/homebrew/opt/postgresql@16/bin/createdb -h /tmp -p 5433 crm_dev

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run
npm run dev          # http://localhost:3000
```

### Seed credentials (password = `password123`)

| Role | Email |
|---|---|
| MANAGER | manager@crm.local |
| SALESPERSON | sam@crm.local |
| SALESPERSON | priya@crm.local |
| SALESPERSON | rahul@crm.local |

## Phase 3 — Ingestion

Three input paths, all funnel through `ingestLead` which dedupes by phone, auto-assigns per the manager's setting, writes an `AssignmentLog`, and creates a `Notification` row.

### A) Meta Lead Ads webhook

Endpoint: `POST /api/webhooks/meta` (and `GET` for `hub.challenge` verification).

**Meta App setup:**
1. Create a Meta App with the "Webhooks" and "Business" products.
2. In **Webhooks → Page**, subscribe to the `leadgen` field.
3. Set the callback URL to `https://<your-domain>/api/webhooks/meta` and use the verify token you put in `META_VERIFY_TOKEN`.
4. Request permissions: `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`. Submit for App Review when going to prod.
5. Generate a long-lived **Page Access Token** for each page; put it in `META_PAGE_ACCESS_TOKEN`.
6. Put the App Secret in `META_APP_SECRET` — the webhook validates `X-Hub-Signature-256` against this on every POST.

**Dev:** set `META_DEV_MODE=true` to bypass signature checks and skip Graph API calls (the handler returns a stub lead). The seed `.env` already has this on for local development.

**Test locally:**
```bash
curl -X POST http://localhost:3000/api/webhooks/meta \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"id":"PAGE","changes":[{"field":"leadgen","value":{"leadgen_id":"test12345"}}]}]}'
```

### B) Google Sheet sync

1. Create a **Google Cloud service account**, enable the **Google Sheets API**.
2. Download its JSON key. Paste it as a single-line value into `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. **Share** the sheet with the service-account email (Viewer access).
4. In **Manager → Ingestion settings**, paste the Spreadsheet ID and (optional) range (defaults to `Sheet1!A2:E`).
5. Columns are positional: `name, phone, email, campaign`.
6. Trigger via the **Sync now** button, or hit `GET /api/cron/sync-sheet?secret=$CRON_SECRET` from any scheduler.

### C) CSV / manual import

Manager → **Import CSV** (also visible as a button on the Leads page). Accepts pasted CSV or `.csv` upload. Header row optional — aliases like `Name / Full Name / Phone / Mobile / Email / Campaign` are recognized.

### Auto-assignment

`Manager → Ingestion settings → Auto-assignment`:
- **Round-robin** (default): cycles through active salespeople via an atomic DB cursor.
- **Leave unassigned**: every new lead lands in the unassigned bucket — manager assigns from the detail page.

Salespeople receive a `Notification` row per assignment (real-time delivery is Phase 5).

## Phase 4 — Calling

The calling stack is hidden behind `TelephonyProvider` so swapping Twilio for Exotel later is a one-file change.

### Provider modes (`TELEPHONY_PROVIDER` env)
- `mock` (default for local dev) — the provider simulates the full Twilio lifecycle (ringing → answered → completed, with random no-answer/busy outcomes ~30% of the time) using in-process timers. No external connectivity needed. Great for clicking through the UI.
- `twilio` — real calls placed through Twilio's REST API.

### Real Twilio setup

1. **Twilio Console → Account → API keys & tokens**: grab your `Account SID` and `Auth Token`.
2. **Twilio Console → Phone Numbers → buy a number** (any US/IN number works). Copy the E.164 form (e.g. `+15558675309`) into `TWILIO_FROM_NUMBER`.
3. Edit `.env`:
   ```
   TELEPHONY_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+1...
   TWILIO_DEV_MODE=false        # turn on signature validation in prod
   ```
4. **Twilio must reach your CRM webhooks**, so expose `http://localhost:3000` to the internet for dev:
   ```
   ngrok http 3000
   ```
   Twilio will hit the URLs your CRM sends in each request, so as long as you load the dialer via the ngrok URL (e.g. `https://abc123.ngrok.app/dialer`), webhook callbacks land back on the dev server.
5. **Trial account caveat:** Twilio trial accounts can only call **verified** numbers. Add the salesperson's mobile + a test lead's mobile under **Phone Numbers → Verified Caller IDs** first.
6. Update the seeded user's phone to a real, verified number (`User.phone`) — that's the number Twilio rings as the agent leg. The seed currently uses placeholders, so swap them via `prisma studio` or a SQL update.

### How a call flows

```
[Click Call] → server action → POST Twilio /Calls
       │
       │  Twilio rings AGENT's phone (User.phone)
       │
       ▼
Twilio GETs /api/webhooks/twilio/voice → returns TwiML
       │
       │  TwiML <Dial><Number>LEAD</Number></Dial>  (records)
       │
       ▼
Twilio bridges the two legs; dual-channel recording captured
       │
   ┌───┴────────────────────────────┐
   ▼                                ▼
/status (parent lifecycle)    /dial-status (lead-leg outcome)
   │                                │
   ▼                                ▼
applyCallStatusUpdate() flips Call.outcome + Lead.autoLabel
       │
       ▼
/api/webhooks/twilio/recording fires when recording is ready
       │
       ▼
Dialer page is polling /api/calls/active → detects endedAt →
opens After-call modal → submit feedback → next lead
```

### Auto-label rules

| Twilio outcome | Lead.autoLabel | Side effect |
|---|---|---|
| `completed` & dur ≥ 3s | `CONNECTED` | `lastContactedAt=now`, `nextRedialAt=null` |
| `completed` & dur < 3s | unchanged | `lastContactedAt=now` |
| `no-answer` / `busy` / `failed` / `canceled` | `NOT_PICKED` | `nextRedialAt=now+2h` |

The salesperson can override the redial time in the after-call modal (sets `nextRedialAt` + `autoLabel=REDIAL`).

### Auto-dialer queue

`getNextLeadInQueue(userId)` picks:
1. Oldest **uncontacted** assigned lead (`lastContactedAt IS NULL`), else
2. Oldest **redial-due** lead (`nextRedialAt ≤ now`).

`CallSession` records the start/pause/end of a dialing burst.

## Data model

Prisma schema covers all six phases upfront:
- `User` `Lead` `LeadLabel` `Call` `CallSession` `Notification` `AssignmentLog`
- `Setting` (key/value) + `AssignmentCursor` (round-robin state) — added in Phase 3

## Environment

See `.env.example`. The dev `.env` shipped with the repo has:
- `META_DEV_MODE=true` — DEV ONLY, skips signature verification
- `META_VERIFY_TOKEN=dev-verify-token`
- `CRON_SECRET=dev-cron-secret`
- `WHATSAPP_TEMPLATE=…` — `{name}` is replaced with the lead's first name

Set real values for `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` before going to production.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run db:migrate` | Apply new schema changes |
| `npm run db:reset` | Drop, re-apply, re-seed |
| `npm run db:seed` | Re-seed (4 users + 20 leads) |
| `npm run db:studio` | Prisma Studio at http://localhost:5555 |

## Importing from zyrax-main

Still deferred. When ready, point me at the Django user table (REST endpoint or direct Postgres read) and I'll add a one-way sync script.
