// Single source of truth for wording, locale and booking rules.
// Imported by both the browser and the server.
export const APP = {
  name: 'SkyWay',
  emoji: '✈️',
  locale: 'en-GB',
  currency: 'GBP',
  timezone: 'Europe/London', // used for "today"; flight times are shown in each airport's own timezone
};

export const SCHEDULE = {
  maxDaysAhead: 90, // flights are generated and bookable this far ahead
  maxPassengers: 6,
};

export const TAX_RATE = 0; // fares are shown tax-inclusive
