// Airports served. `tz` is used to turn local departure times into UTC instants
// and to display times as passengers see them at each airport.
export const AIRPORTS = [
  { code: 'LHR', city: 'London', name: 'Heathrow', tz: 'Europe/London' },
  { code: 'MAN', city: 'Manchester', name: 'Manchester', tz: 'Europe/London' },
  { code: 'EDI', city: 'Edinburgh', name: 'Edinburgh', tz: 'Europe/London' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin', tz: 'Europe/Dublin' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', tz: 'Europe/Paris' },
  { code: 'AMS', city: 'Amsterdam', name: 'Schiphol', tz: 'Europe/Amsterdam' },
  { code: 'BCN', city: 'Barcelona', name: 'El Prat', tz: 'Europe/Madrid' },
  { code: 'DXB', city: 'Dubai', name: 'Dubai International', tz: 'Asia/Dubai' },
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi', tz: 'Asia/Kolkata' },
  { code: 'SIN', city: 'Singapore', name: 'Changi', tz: 'Asia/Singapore' },
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy', tz: 'America/New_York' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', tz: 'America/Los_Angeles' },
];

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));
export const airport = (code) => byCode.get(code);
export const airportLabel = (code) => {
  const a = airport(code);
  return a ? `${a.city} (${a.code})` : code;
};
