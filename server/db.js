// Postgres (Neon) data access. Uses the Neon serverless driver's Pool, which
// speaks the node-postgres API over WebSockets and supports transactions.
import { Pool, types } from '@neondatabase/serverless';
import { buildFlights } from './seed.js';
import { calcTotals } from '../shared/pricing.js';
import { APP, SCHEDULE } from '../shared/config.js';
import { airport } from '../shared/airports.js';
import { addDays, todayInZone, zonedToUtc } from '../shared/time.js';
import { HttpError } from './errors.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

// Return NUMERIC columns (prices) as JS numbers instead of strings.
types.setTypeParser(1700, parseFloat);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Seats are protected by the database: seats_left has a CHECK >= 0 and is only ever
// decremented with a conditional UPDATE inside a transaction, so concurrent
// bookings can never oversell a flight.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS flights (
    id          text PRIMARY KEY,
    flight_no   text NOT NULL,
    origin      text NOT NULL,
    destination text NOT NULL,
    departs_at  timestamptz NOT NULL,
    arrives_at  timestamptz NOT NULL,
    price       numeric(10,2) NOT NULL CHECK (price >= 0),
    seats_total integer NOT NULL CHECK (seats_total > 0),
    seats_left  integer NOT NULL,
    CHECK (seats_left >= 0 AND seats_left <= seats_total),
    CHECK (arrives_at > departs_at),
    CHECK (origin <> destination)
  );
  CREATE INDEX IF NOT EXISTS flights_search_idx ON flights (origin, destination, departs_at);

  -- outbound / return_leg hold a snapshot of the flight at booking time so history
  -- survives timetable changes. return_id is NULL for one-way trips.
  CREATE TABLE IF NOT EXISTS bookings (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    outbound_id text NOT NULL REFERENCES flights(id),
    return_id   text REFERENCES flights(id),
    outbound    jsonb NOT NULL,
    return_leg  jsonb,
    passengers  jsonb NOT NULL,
    contact     jsonb NOT NULL,
    status      text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    subtotal    numeric(10,2) NOT NULL,
    tax         numeric(10,2) NOT NULL,
    total       numeric(10,2) NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (return_id IS NULL OR return_id <> outbound_id)
  );
  CREATE INDEX IF NOT EXISTS bookings_user_created_idx ON bookings (user_id, created_at DESC);
`;

// Creates tables if missing and rolls the timetable forward (existing flights, and
// their remaining seats, are left untouched).
export async function initDb() {
  await pool.query(SCHEMA);
  const today = todayInZone(APP.timezone);
  const total = SCHEDULE.maxDaysAhead + 1;
  for (let from = 0; from < total; from += 30) {
    const rows = buildFlights(addDays(today, from), Math.min(30, total - from));
    await pool.query(
      `INSERT INTO flights (id, flight_no, origin, destination, departs_at, arrives_at, price, seats_total, seats_left)
       SELECT id, flight_no, origin, destination, departs_at, arrives_at, price, seats, seats
       FROM jsonb_to_recordset($1::jsonb) AS f(id text, flight_no text, origin text, destination text,
         departs_at timestamptz, arrives_at timestamptz, price numeric, seats int)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(rows)]
    );
  }
}

// ---------- Flights ----------

// DB rows → the camelCase shape the React app uses.
const toFlight = (r) => ({
  id: r.id, flightNo: r.flight_no, origin: r.origin, destination: r.destination,
  departsAt: r.departs_at, arrivesAt: r.arrives_at, price: r.price, seatsLeft: r.seats_left,
});

// Flights leaving `from` for `to` on local calendar day `date`, with room for `passengers`.
export async function searchFlights({ from, to, date, passengers }) {
  const tz = airport(from).tz;
  const { rows } = await pool.query(
    `SELECT * FROM flights
     WHERE origin = $1 AND destination = $2 AND departs_at >= $3 AND departs_at < $4
       AND departs_at > now() AND seats_left >= $5
     ORDER BY departs_at`,
    [from, to, zonedToUtc(date, 0, tz), zonedToUtc(date, 24 * 60, tz), passengers]
  );
  return rows.map(toFlight);
}

export async function getFlight(id) {
  const { rows } = await pool.query('SELECT * FROM flights WHERE id = $1', [id]);
  return rows[0] ? toFlight(rows[0]) : null;
}

// ---------- Bookings ----------

const toBooking = (r) => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  outbound: r.outbound,
  return: r.return_leg,
  passengers: r.passengers,
  contact: r.contact,
  totals: { subtotal: r.subtotal, tax: r.tax, total: r.total },
  createdAt: r.created_at,
});

const snapshot = (f) => ({
  flightNo: f.flight_no, origin: f.origin, destination: f.destination,
  departsAt: f.departs_at, arrivesAt: f.arrives_at, price: f.price,
});

// Booking reference like "K7QX2M" (no look-alike characters).
const newRef = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

export async function listBookings(userId) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map(toBooking);
}

export async function getBooking(userId, id) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE user_id = $1 AND id = $2', [userId, id]);
  return rows[0] ? toBooking(rows[0]) : null;
}

// Prices come from the locked DB rows, never from the client. Flights are locked in id
// order (no deadlocks) and seats are taken with a conditional UPDATE, so a lost race
// is a clean 409.
export async function createBooking({ userId, outboundId, returnId, passengers, contact }) {
  const ids = returnId ? [outboundId, returnId] : [outboundId];
  const seats = passengers.length;
  const id = newRef();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM flights WHERE id = ANY($1) ORDER BY id FOR UPDATE', [ids]);
    const out = rows.find((f) => f.id === outboundId);
    const ret = returnId ? rows.find((f) => f.id === returnId) : null;
    if (!out || (returnId && !ret)) throw new HttpError(404, 'Flight not found');
    if (ret && (ret.origin !== out.destination || ret.destination !== out.origin)) {
      throw new HttpError(400, 'The return flight must fly the reverse route');
    }
    if (ret && ret.departs_at <= out.arrives_at) {
      throw new HttpError(400, 'The return flight must leave after the outbound flight lands');
    }
    if (rows.some((f) => f.departs_at <= new Date())) throw new HttpError(409, 'That flight has already departed');

    const taken = await client.query(
      'UPDATE flights SET seats_left = seats_left - $2 WHERE id = ANY($1) AND seats_left >= $2', [ids, seats]);
    if (taken.rowCount !== ids.length) throw new HttpError(409, 'Sorry, not enough seats are left on that flight.');

    const totals = calcTotals({ legPrices: ret ? [out.price, ret.price] : [out.price], passengers: seats });
    await client.query(
      `INSERT INTO bookings (id, user_id, outbound_id, return_id, outbound, return_leg, passengers, contact, subtotal, tax, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, userId, out.id, ret?.id ?? null, snapshot(out), ret ? snapshot(ret) : null,
        JSON.stringify(passengers), JSON.stringify(contact), totals.subtotal, totals.tax, totals.total]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getBooking(userId, id);
}

// Only confirmed trips whose first flight has not left yet; seats go back on both flights.
export async function cancelBooking(userId, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE bookings b SET status = 'cancelled'
       WHERE b.user_id = $1 AND b.id = $2 AND b.status = 'confirmed'
         AND EXISTS (SELECT 1 FROM flights f WHERE f.id = b.outbound_id AND f.departs_at > now())
       RETURNING outbound_id, return_id, jsonb_array_length(passengers) AS seats`,
      [userId, id]
    );
    if (rows.length) {
      const { outbound_id, return_id, seats } = rows[0];
      await client.query('UPDATE flights SET seats_left = seats_left + $2 WHERE id = ANY($1)',
        [return_id ? [outbound_id, return_id] : [outbound_id], seats]);
    }
    await client.query('COMMIT');
    if (rows.length) return getBooking(userId, id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const existing = await getBooking(userId, id);
  if (!existing) throw new HttpError(404, 'Booking not found');
  throw new HttpError(409, existing.status === 'cancelled' ? 'Already cancelled' : 'Past trips cannot be cancelled');
}
