import { SCHEDULE } from './config.js';

// Sign-up / sign-in rules (Better Auth enforces the same minimum on the server).
export function validateCredentials(f = {}, { signUp = false } = {}) {
  const s = (v) => (typeof v === 'string' ? v : '');
  const e = {};
  if (signUp && !s(f.name).trim()) e.name = 'Required';
  if (!/^\S+@\S+\.\S+$/.test(s(f.email))) e.email = 'Enter a valid email';
  if (s(f.password).length < 8) e.password = 'At least 8 characters';
  return e;
}

// Passenger + contact rules, shared so the server enforces exactly what the UI checks.
// Error keys are flat: "passengers.0.firstName", "email", "phone".
const NAME = /^\p{L}[\p{L}\s'’-]{0,39}$/u;

export function validateBookingDetails({ passengers, contact } = {}) {
  const e = {};
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > SCHEDULE.maxPassengers) {
    e.passengers = `1–${SCHEDULE.maxPassengers} passengers`;
  } else {
    passengers.forEach((p, i) => {
      for (const k of ['firstName', 'lastName']) {
        const v = typeof p?.[k] === 'string' ? p[k].trim() : '';
        if (!v) e[`passengers.${i}.${k}`] = 'Required';
        else if (!NAME.test(v)) e[`passengers.${i}.${k}`] = 'Letters only';
      }
    });
  }
  const s = (v) => (typeof v === 'string' ? v : '');
  if (!/^\S+@\S+\.\S+$/.test(s(contact?.email))) e.email = 'Enter a valid email';
  if (s(contact?.phone).trim() && !/^[+\d][\d\s()-]{6,19}$/.test(s(contact.phone).trim())) e.phone = 'Enter a valid phone number';
  return e;
}
