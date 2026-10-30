# SkyWay – airline booking (React + Vite + Express + Neon Postgres + Better Auth)

One Node.js process serves both the React app and the `/api` endpoints, so there is
a single thing to run and deploy.

## Run

```bash
npm install
cp .env.example .env     # paste your Neon connection string into DATABASE_URL and set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run dev              # http://localhost:3000 – API + React with hot reload
npm run db:reset         # drop all tables and re-seed (destroys all bookings and users)
```

Tables are created on first start, and the flight timetable (11 route pairs, ~38 flights a day, 90 days ahead) is generated and topped up on every start. Existing flights and their remaining seats are never overwritten.

## Deploy to Render (recommended)
`render.yaml` defines the whole service. Push the repo to GitHub, then Render → **New → Blueprint** → select the repo.
Render asks for `DATABASE_URL` (your Neon pooled URL) and generates `BETTER_AUTH_SECRET` itself; the public URL
(`RENDER_EXTERNAL_URL`) is picked up automatically for Better Auth. Health check: `/api/health`.
After the first deploy, add `https://<service>.onrender.com/api/auth/callback/<google|facebook|instagram>` as a redirect URI
in each provider's console and set that provider's client ID/secret in Render → Environment.
The free plan sleeps when idle (first request after a pause takes ~30–60 s); use the Starter plan to avoid that.

## Deploy elsewhere (single artifact)

```bash
npm ci
npm run build            # builds the React app into dist/
npm start                # NODE_ENV=production, serves dist/ + /api on $PORT
```

Or build the included `Dockerfile`. Set these on the host:

| Variable       | Required | Purpose                                                      |
|----------------|----------|--------------------------------------------------------------|
| `DATABASE_URL` | yes      | Neon **pooled** connection string (host contains `-pooler`)  |
| `PORT`         | no       | HTTP port, default `3000` (most hosts inject this)           |
| `BETTER_AUTH_SECRET` | yes | Signs sessions/cookies: `openssl rand -base64 32`            |
| `BETTER_AUTH_URL`    | yes | Public origin, e.g. `https://myapp.onrender.com` (OAuth callbacks are built from it) |
| `GOOGLE_CLIENT_ID` / `_SECRET`     | no | Enables "Continue with Google" (Gmail)  |
| `FACEBOOK_CLIENT_ID` / `_SECRET`   | no | Enables "Continue with Facebook"        |
| `INSTAGRAM_CLIENT_ID` / `_SECRET`  | no | Enables "Continue with Instagram"       |

`GET /api/health` returns `{ "ok": true }` once the database is reachable (use it as the health check).
The server is stateless, so several instances can share one database.

## How it works
- **Dev:** Express mounts Vite as middleware (hot reload, no second server); `node --watch` restarts on `server/` or `shared/` changes.
- **Prod:** Express serves `dist/` and falls back to `index.html` for client-side routes.
- **No overselling:** `flights.seats_left` has `CHECK (seats_left >= 0)` and is only decremented by a conditional `UPDATE … WHERE seats_left >= n` inside a transaction that locks the flight rows in id order; the loser of a race gets a 409.
- **Optional return date:** leave it empty for one-way. It can be set in the search form or added/removed later from the "Your trip" panel (it lives in the URL: `/search?from=LHR&to=JFK&depart=…&return=…&passengers=2`). A return booking holds seats on both flights in one transaction, and the server checks the return flight is the reverse route and leaves after the outbound lands.
- **Trust:** fares come from DB rows, never the client; `shared/` holds the rules both sides use. Flight times are stored as UTC and shown in each airport's own timezone (`shared/airports.js`).
- **Auth (Better Auth):** email + password always; Google, Facebook and Instagram when their env vars are set. All three use the same
  `/api/auth/*` handler and the same `user`/`session`/`account` tables in Neon. Browsing is public; bookings need a session cookie.
- **Browser storage:** saved contact details live in `localStorage`.

## Social sign-in setup
Replace the origin in production.
- Google (Gmail accounts): console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web application); add authorised redirect URI `http://localhost:3000/api/auth/callback/google`. Configure the OAuth consent screen first; in "Testing" mode only listed test users can sign in.
- Facebook/Instagram: register an app at developers.facebook.com and add the redirect URIs:
- Facebook: `http://localhost:3000/api/auth/callback/facebook` (Facebook Login product)
- Instagram: `http://localhost:3000/api/auth/callback/instagram` ("Instagram API with Instagram Login" product).
  Meta only supports Business/Creator Instagram accounts, and Instagram returns no email (a placeholder
  `instagram-<id>@users.invalid` is stored). Until the Meta app is approved only listed testers can sign in.

## Testing the API
Bookings belong to the signed-in user, so `/api/bookings` returns 401 without a session. Sign up with curl and keep the cookie (`Origin` is required by Better Auth's CSRF check):

```bash
O=http://localhost:3000
curl -c jar -H "Origin: $O" -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com","password":"password123"}' $O/api/auth/sign-up/email
curl "$O/api/flights?from=LHR&to=JFK&date=$(date -v+14d +%F)&passengers=2"      # macOS; use date -d '+14 days' on Linux
curl -b jar -H 'Content-Type: application/json' -d '{"outboundId":"SW101-<date>","returnId":null,"passengers":[{"firstName":"Ann","lastName":"Lee"}],"contact":{"email":"test@example.com"}}' $O/api/bookings
curl -b jar $O/api/bookings
```

## API
| Method | Path | Notes |
|--------|------|-------|
| GET    | `/api/health` | DB reachability |
| GET    | `/api/providers` | Which sign-in methods are enabled |
| ANY    | `/api/auth/*` | Better Auth (sign-up/in/out, session, OAuth callbacks) |
| GET    | `/api/flights?from=&to=&date=&passengers=` | That day's flights with enough seats; 400 with `details` if invalid |
| GET    | `/api/flights/:id` | 404 if unknown |
| GET    | `/api/bookings`, `/api/bookings/:id` | Signed-in user's own bookings; 401 otherwise, 404 if not yours |
| POST   | `/api/bookings` | `{ outboundId, returnId?, passengers:[{firstName,lastName}], contact:{email,phone?} }` → 201, 400 (invalid / bad return), 409 (sold out / departed) |
| POST   | `/api/bookings/:id/cancel` | Confirmed trips whose first flight has not left; seats are released |

## Structure
```
server/   index.js (entry) · api.js (routes) · auth.js (Better Auth) · db.js (schema + queries) · seed.js (timetable) · env.js · errors.js · db-reset.js
shared/   config.js · airports.js · trip.js (search rules) · time.js · pricing.js · validation.js   (browser + server)
src/      React app (Home = search, Search = results + booking, Bookings = my trips); services/api.js is the only place that calls fetch
```

## Next steps
- Auth extras: email verification / password reset (needs an email sender), roles/admin.
- Migrations: schema uses `CREATE TABLE IF NOT EXISTS`; adopt a migration tool once the schema changes.
