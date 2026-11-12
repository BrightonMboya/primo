# Primo — shop stock tracker

A small, phone-first inventory app for a clothing shop that also sells on Instagram.
Scan a tag → see the item and how many are left → **Sell**, **Send for delivery** or **Return**.

**Stack:** TanStack Start (React) · Drizzle ORM · Postgres (Supabase) · Better Auth · Supabase Storage for photos · Vercel.

## What it does

- **Items with colours × sizes.** Add a photo, price, colours and sizes, and how many of each. Every colour/size gets its own code, e.g. `PRM-0001-RED-M`.
- **QR labels.** Print 50 × 30 mm stickers (label printer or A4) with a QR code, name, size and price.
- **Scan with the phone camera.** QR codes and Code 128 barcodes. You can also type the code.
- **Sales.** Customer name and phone are required. In shop or Instagram. Cash or MoMo (with optional MoMo transaction ID). Stock goes down automatically. The database refuses to go below zero, even if two phones sell the last item at the same moment.
- **Deliveries.** Send items out with customer, phone, area and fee, paid up front or pay on delivery. When the rider is back, mark each item **Kept** or **Brought back**.
- **Returns and exchanges.** A refund puts the item back in stock and records the refund. An exchange puts it back in stock and gives a credit toward the item they take instead.
- **Low-stock alerts.** Each item has a "warn me at" number.
- **History.** Every stock change is logged with who did it, when, and for which customer.
- **Installable app (PWA).** Add to Home Screen on iPhone or Android.

## Roles

| | Sales | Admin |
|---|---|---|
| Scan, sell, send out, close deliveries, returns, exchanges | ✅ | ✅ |
| See stock counts and selling prices | ✅ | ✅ |
| Add items, edit items, correct stock, print labels | — | ✅ |
| Money totals, sales report, cost prices, stock value | — | ✅ |
| Add / switch off staff, reset passwords | — | ✅ |

Permissions are checked on the server for every action. Staff sign in with a **username and password** (Better Auth, username plugin). Public sign-up is off: only an admin can add staff.

## Run it on your computer (no accounts needed)

Needs **Node 24+**.

```bash
npm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run seed                # optional: demo items + logins owner / adjoa
npm run dev                 # http://localhost:3210
```

With `DATABASE_URL` empty, Primo uses a **built-in local Postgres (PGlite)** in `data/pglite`, and photos go to `data/uploads`. Nothing to install.

Without `npm run seed`, the first visit opens a **setup** screen where you create the owner (admin) account.

Demo logins (change them in **Staff**): admin `owner` / `primo-admin-2026`, sales `adjoa` / `primo-sales-2026`.

## Going live: Supabase + Vercel

### 1. Supabase (database)

1. Create a project in a European region (this project uses **Paris, eu-west-3**).
2. **Project Settings → Database → Connection string**:
   - **Transaction pooler** (port **6543**) → `DATABASE_URL` (used by the app on Vercel)
   - **Direct connection** or **Session pooler** (port **5432**) → `DATABASE_URL_DIRECT` (used for migrations)
   - Running the app on your own computer or a normal server (`npm run dev` / `npm start`)? Use the **Session pooler** (5432) for `DATABASE_URL` too. It keeps prepared statements, so each query is one round trip instead of two.
3. Put both in your local `.env`, then create the tables:
   ```bash
   npm run db:migrate   # also locks the tables against Supabase's public API (row level security)
   npm run seed     # optional demo data, or skip and use the setup screen
   ```

### 2. Photos (Supabase Storage)

Supabase → **Project Settings → API**: copy the **Project URL** into `SUPABASE_URL` and the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY`. The public `primo-photos` bucket is created automatically on the first upload.

Keep the service_role key secret: only the server uses it, never the phone.

### 3. Vercel (hosting)

1. Push this folder to GitHub and import it in Vercel (framework: **Other**, build command `npm run build`). Vercel sets `VERCEL=1`, so the build uses the Nitro Vercel preset automatically.
2. Set the **function region to Paris (cdg1)** so it sits next to the database: Project → Settings → Functions.
3. Add the environment variables from `.env.example`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your `https://….vercel.app` or domain), `DATABASE_URL` (pooler, 6543), `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy, open the site on the phone, then **Share → Add to Home Screen** (iPhone) or **Install app** (Android).

Note: Vercel's free Hobby plan is for non-commercial use only, so a shop needs Pro. Supabase's free plan pauses after a week with no activity.

### Changing the database later

Edit `src/server/db/schema.ts`, then `npm run db:generate` (creates a migration in `drizzle/`) and `npm run db:migrate`. The local PGlite database applies new migrations by itself on start.

## Other hosting

`npm run build && npm start` runs a plain Node server on port 3210 (VPS, Railway, Render…). Put it behind HTTPS: the camera and "Add to Home Screen" need it.

## Tests

On a **freshly seeded** database (the tests sell and return demo items):

```bash
rm -rf data/pglite data/uploads && npm run seed
npm run build && PORT=3211 npm start &
BASE=http://localhost:3211 node tests/e2e.mjs
```

32 checks: sign-in, the sales/admin boundaries, cost prices hidden from sales, selling, oversell protection, refunds, delivery close-out, alerts, report totals, photo upload and access, and cross-site request blocking.

## Project layout

```
src/server/db/schema.ts         Drizzle schema (Better Auth tables + shop tables)
src/server/db/index.ts          Postgres (Supabase) or local PGlite connection
drizzle/                        SQL migrations
src/server/auth.ts              Better Auth config (username + admin roles, DB rate limit)
src/server/staff.server.ts      create staff, roles, switch off, reset password
src/server/inventory.server.ts  items, variants, codes, stock changes (single place stock moves)
src/server/orders.server.ts     sales, deliveries, returns, exchanges, reports
src/server/storage.server.ts    photo upload (Supabase Storage or local)
src/server/app.functions.ts     the API the screens call, with validation and role checks
src/routes/                     screens (file-based routes), /api/auth/* for Better Auth
public/                         manifest, service worker, icons
server.mjs                      plain Node production server
```
