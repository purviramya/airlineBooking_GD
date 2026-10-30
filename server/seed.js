// Timetable → concrete flights. Every route is a pair of airports with the daily
// departures in each direction (local departure time at the origin airport).
// initDb() calls buildFlights() on every start, so the schedule keeps rolling forward.
import { addDays, timeToMinutes, zonedToUtc } from '../shared/time.js';
import { airport } from '../shared/airports.js';

// [a, b, base fare £, seats, minutes a→b, minutes b→a, [[flightNo, dep at a]…], [[flightNo, dep at b]…]]
const ROUTES = [
  ['LHR', 'JFK', 420, 250, 490, 460, [['SW101', '09:30'], ['SW103', '17:45']], [['SW102', '18:30'], ['SW104', '10:15']]],
  ['LHR', 'DXB', 380, 280, 420, 450, [['SW201', '21:10'], ['SW203', '11:00']], [['SW202', '03:10'], ['SW204', '14:20']]],
  ['LHR', 'CDG', 95, 150, 80, 80, [['SW301', '07:20'], ['SW303', '12:40'], ['SW305', '18:05']], [['SW302', '09:00'], ['SW304', '14:30'], ['SW306', '19:50']]],
  ['LHR', 'DEL', 450, 300, 530, 580, [['SW401', '20:30']], [['SW402', '02:40']]],
  ['LHR', 'AMS', 85, 150, 75, 75, [['SW501', '08:10'], ['SW503', '16:30']], [['SW502', '10:15'], ['SW504', '18:40']]],
  ['LHR', 'BCN', 120, 180, 125, 130, [['SW601', '07:45'], ['SW603', '15:20']], [['SW602', '10:30'], ['SW604', '18:15']]],
  ['LHR', 'SIN', 640, 300, 780, 840, [['SW701', '21:45']], [['SW702', '23:30']]],
  ['LHR', 'LAX', 520, 280, 670, 630, [['SW801', '11:30']], [['SW802', '13:15']]],
  ['MAN', 'DUB', 70, 120, 65, 65, [['SW901', '07:00'], ['SW903', '17:30']], [['SW902', '08:40'], ['SW904', '19:00']]],
  ['EDI', 'LHR', 75, 150, 85, 85, [['SW951', '07:30'], ['SW953', '17:10']], [['SW952', '09:45'], ['SW954', '19:40']]],
  ['MAN', 'JFK', 400, 250, 480, 450, [['SW961', '10:20']], [['SW962', '21:00']]],
];

// Fridays and Sundays cost 15% more.
const dayFactor = (date) => ([5, 0].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ? 1.15 : 1);

// Flights departing (local time at origin) on `days` consecutive dates from `startDate`.
export function buildFlights(startDate, days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    for (const [a, b, fare, seats, minAB, minBA, outbound, inbound] of ROUTES) {
      const legs = [
        ...outbound.map(([no, t]) => [no, a, b, t, minAB]),
        ...inbound.map(([no, t]) => [no, b, a, t, minBA]),
      ];
      for (const [no, from, to, time, minutes] of legs) {
        const departs = zonedToUtc(date, timeToMinutes(time), airport(from).tz);
        out.push({
          id: `${no}-${date}`, flight_no: no, origin: from, destination: to,
          departs_at: departs.toISOString(),
          arrives_at: new Date(departs.getTime() + minutes * 60_000).toISOString(),
          price: Math.round(fare * dayFactor(date)), seats,
        });
      }
    }
  }
  return out;
}
