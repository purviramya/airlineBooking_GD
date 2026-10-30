# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node ≥ 22 is required (installed via nvm; in a fresh shell run `source ~/.nvm/nvm.sh` if `node` is not found).

```bash
npm run dev        # single process on :3000 – Express API + Vite middleware (HMR); restarts on server/ or shared/ changes
npm run build      # vite build → dist/
npm start          # NODE_ENV=production: Express serves dist/ + /api
npm run db:reset   # DROP all tables incl. users/sessions, recreate schema, regenerate timetable
```

There is no test suite or linter configured. Verify API changes with curl against the running dev server (see README "Testing the API"); bookings endpoints need a Better Auth session cookie (sign up with curl and `-c jar`, see README).

`DATABASE_URL` (Neon **pooled** connection string) must be set, via `.env` or the real environment; the server exits on startup without it. `.env` is gitignored and holds a live credential – never print or commit it.

## Architecture

Deployed as **one artifact / one process**: `server/index.js` mounts `/api` and then either Vite in middleware mode (dev) or static `dist/` with an SPA fallback to `index.html` (prod). There is no separate frontend server and no proxy; the client calls `/api/...` on the same origin. Keep it that way. In dev, Vite's HMR socket is attached to the same `http.Server` (`hmr: { server }`); without that Vite opens port 24678 and a second dev server dies with "WebSocket server error: Port is already in use".

**Three code roots:**
- `src/` – React 18 SPA (react-router v6). All server calls go through `src/services/api.js`; components never call `fetch` directly.
- `server/` – Express 5 (async handlers may `throw`; errors are caught by the router's error middleware in `server/api.js` and returned as `{ error, details }`). Throw `HttpError(status, message, details)` from `server/errors.js` for client errors.
- `shared/` – plain ESM imported by **both** browser and server (`config.js`, `airports.js` codes + timezones, `trip.js` search rules, `time.js`, `pricing.js`, `validation.js`). Change business rules here so UI and server agree; no Node- or browser-only APIs.

**Data (Neon Postgres via `@neondatabase/serverless` `Pool`):** everything lives in `server/db.js` – schema (`CREATE TABLE IF NOT EXISTS`, run by `initDb()` on every startup), timetable generation, and all queries. `server/seed.js` holds the route table; `buildFlights()` expands it into one `flights` row per departure (`id = <flightNo>-<local date>`), and `initDb()` inserts the next 90 days with `ON CONFLICT DO NOTHING`, so seats already sold are kept. No migrations: changing a column needs an `ALTER` or `npm run db:reset`. NUMERIC is parsed to JS numbers via `types.setTypeParser(1700, …)`; rows are mapped to camelCase in `toFlight`/`toBooking`.

**Booking integrity (seats, not time slots):** `createBooking` runs in one transaction: `SELECT … FOR UPDATE` the outbound (and optional return) flights ordered by id, validate (return is the reverse route and departs after the outbound lands, nothing has departed), then `UPDATE flights SET seats_left = seats_left - n WHERE id = ANY($1) AND seats_left >= n` and require `rowCount === ids.length`, else 409. `cancelBooking` gives seats back in the same transaction. Bookings snapshot each leg (`outbound`, `return_leg` jsonb) so history survives timetable changes; `return_id` is NULL for one-way. The return date is optional end-to-end: URL param `return` → second flight list → `returnId` (null for one-way).

**Auth (Better Auth):** `server/auth.js` is the only config. Email+password is always on; Google and Facebook (built-in providers) and Instagram (`genericOAuth` plugin, no built-in provider) activate when their env vars exist, and `/api/providers` tells the UI which buttons are enabled (`AuthPage` always renders all three; unconfigured ones are disabled, not hidden). Every method hits the same handler mounted in `server/index.js` (`/api/auth/{*any}`, **before** `express.json()`) and the same tables. `migrateAuth()` creates Better Auth's `user/session/account/verification` tables and must run before `initDb()` because `bookings.user_id` references `"user"`. `requireUser` in `server/api.js` derives ownership from the session; never read a user id from the request. Browser side: `src/services/auth-client.js` (`authClient.useSession()`, `signIn.social`), `RequireAuth`, `AuthPage`.

**Client state split:** saved contact details are in `localStorage` (keys prefixed `skyway:`, via `src/services/storage.js`). Flights, bookings and sessions are server-side.

Flight times are UTC instants shown in each airport's timezone (`airport(code).tz`; helpers in `AppContext.jsx`). `APP.timezone` is only used for "today". Currency/locale come from `shared/config.js` via `money()`.

## Gotchas

- Better Auth rejects non-GET requests without an `Origin` matching `BETTER_AUTH_URL`; add `-H "Origin: http://localhost:3000"` to curl. `BETTER_AUTH_URL` must equal the origin users actually visit, or OAuth callbacks/cookies fail.
- Instagram returns no email; the stored one is a `@users.invalid` placeholder, and only Business/Creator accounts can log in.
- `.env` is loaded in code by `server/env.js` (`process.loadEnvFile`), which must be the first import in each entry point (`server/index.js`, `server/db-reset.js`). Do **not** switch to `node --env-file`: combined with `--watch-path` it makes Node watch the whole project, and Vite's writes to `node_modules/.vite` cause an endless restart loop.
- `.env` must stay as `NAME=value` lines (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PORT`, optional `GOOGLE_/FACEBOOK_/INSTAGRAM_CLIENT_ID|SECRET`). Pasting only the bare Neon URL yields "DATABASE_URL is not set". Check names without leaking values: `awk -F= '/^[A-Z_]+=/{print $1}' .env`.
- On startup Better Auth logs "Database schema mismatch / Missing tables" on a fresh database; it is emitted just before `migrateAuth()` creates them and is harmless.
- Port 3000 busy? `kill $(lsof -tiTCP:3000 -sTCP:LISTEN)`.
- In Express 5, wildcard routes need named params (`'/{*path}'`), not `'*'`.
