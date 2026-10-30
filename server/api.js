import express, { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth, providers } from './auth.js';
import * as db from './db.js';
import { HttpError } from './errors.js';
import { validateBookingDetails } from '../shared/validation.js';
import { validateSearch } from '../shared/trip.js';

export const api = Router();
api.use(express.json());

// Browsing is public; anything about "my bookings" needs a Better Auth session.
// Ownership always comes from the session, never from the request body.
async function requireUser(req, res, next) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new HttpError(401, 'Please sign in');
  req.user = session.user;
  next();
}

api.get('/health', async (req, res) => {
  await db.pool.query('SELECT 1');
  res.json({ ok: true });
});

// Which sign-in buttons the UI should show.
api.get('/providers', (req, res) => res.json(providers));

// ?from=LHR&to=JFK&date=2026-11-05&passengers=2 → that day's flights with enough seats.
api.get('/flights', async (req, res) => {
  const { from, to, date, passengers = '1' } = req.query;
  const errors = validateSearch({ from, to, depart: date, passengers });
  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid search', errors);
  res.json(await db.searchFlights({ from, to, date, passengers: Number(passengers) }));
});

api.get('/flights/:id', async (req, res) => {
  const flight = await db.getFlight(req.params.id);
  if (!flight) throw new HttpError(404, 'Flight not found');
  res.json(flight);
});

api.get('/bookings', requireUser, async (req, res) => {
  res.json(await db.listBookings(req.user.id));
});

api.get('/bookings/:id', requireUser, async (req, res) => {
  const booking = await db.getBooking(req.user.id, req.params.id);
  if (!booking) throw new HttpError(404, 'Booking not found');
  res.json(booking);
});

// returnId is optional: omit it (or send null) for a one-way trip.
api.post('/bookings', requireUser, async (req, res) => {
  const { outboundId, returnId = null, passengers, contact } = req.body ?? {};
  if (typeof outboundId !== 'string') throw new HttpError(400, 'outboundId is required');
  if (returnId !== null && typeof returnId !== 'string') throw new HttpError(400, 'returnId must be a flight id');
  if (returnId === outboundId) throw new HttpError(400, 'Outbound and return must be different flights');

  const fieldErrors = validateBookingDetails({ passengers, contact });
  if (Object.keys(fieldErrors).length) throw new HttpError(400, 'Invalid details', fieldErrors);

  const booking = await db.createBooking({
    userId: req.user.id, outboundId, returnId,
    passengers: passengers.map((p) => ({ firstName: p.firstName.trim(), lastName: p.lastName.trim() })),
    contact: { email: contact.email.trim(), phone: (contact.phone ?? '').trim() },
  });
  res.status(201).json(booking);
});

api.post('/bookings/:id/cancel', requireUser, async (req, res) => {
  res.json(await db.cancelBooking(req.user.id, req.params.id));
});

api.use((req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} /api${req.path}` }));

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message, details: err.details });
});
