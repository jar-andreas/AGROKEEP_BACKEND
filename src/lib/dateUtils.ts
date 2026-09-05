// Normalizes a client-supplied date down to just its calendar date, pinned
// to UTC noon. Booking dates only ever carry day-level meaning (drop-off/
// pick-up), but a raw client string can carry an arbitrary time-of-day and
// timezone offset — stored as-is, a local midnight timestamp can serialize
// to the *previous* UTC calendar day, which would flip the lifecycle sweep's
// `$lte: now` status transitions up to ~24h early. Pinning to UTC noon after
// reading the LOCAL calendar date components (consistent with how
// schemaValidation's date refinements already compare against local
// "today") keeps that day from ever being ambiguous again.
export const normalizeToCalendarDate = (input: string | Date): Date => {
  const parsed = new Date(input);
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0),
  );
};
