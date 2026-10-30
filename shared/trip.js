// Search rules shared by UI and server. The return date is optional: an empty
// value means one-way.
import { APP, SCHEDULE } from './config.js';
import { airport } from './airports.js';
import { addDays, isDateString, todayInZone } from './time.js';

export function validateSearch({ from, to, depart, returnDate, passengers }) {
  const e = {};
  const today = todayInZone(APP.timezone);
  const last = addDays(today, SCHEDULE.maxDaysAhead);

  if (!airport(from)) e.from = 'Choose where you are flying from';
  if (!airport(to)) e.to = 'Choose where you are flying to';
  else if (from === to) e.to = 'Choose a different destination';

  if (!isDateString(depart)) e.depart = 'Choose a departure date';
  else if (depart < today) e.depart = 'That date has passed';
  else if (depart > last) e.depart = `Flights open ${SCHEDULE.maxDaysAhead} days ahead`;

  if (returnDate) {
    if (!isDateString(returnDate)) e.returnDate = 'Invalid return date';
    else if (isDateString(depart) && returnDate < depart) e.returnDate = 'Return cannot be before departure';
    else if (returnDate > last) e.returnDate = `Flights open ${SCHEDULE.maxDaysAhead} days ahead`;
  }

  const n = Number(passengers);
  if (!Number.isInteger(n) || n < 1 || n > SCHEDULE.maxPassengers) e.passengers = `1–${SCHEDULE.maxPassengers} passengers`;
  return e;
}
