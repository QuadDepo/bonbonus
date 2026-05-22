/**
 * Bonus week calculation — determines the current ISO week number and
 * the Monday–Sunday date range for that week.
 *
 * Used to scope bonus API requests to the correct promotion period.
 */

/**
 * Returns the ISO week number and the Monday–Sunday date range for the
 * given date (defaults to now).
 *
 * ISO week algorithm:
 *   1. Normalize the date to UTC midnight.
 *   2. Find the nearest Thursday (ISO weeks are defined by their Thursday).
 *   3. Week 1 is the week containing January 4th — compute offset from Jan 1
 *      of that Thursday's year and divide by 7.
 *
 * The period range is the Monday through Sunday enclosing the input date.
 */
export const getCurrentBonusWeek = (now = new Date()) => {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  // Monday of the current week
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentDay = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (currentDay - 1));

  // Sunday = Monday + 6 days
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  const pad = (d: Date) => d.toISOString().slice(0, 10);

  return { weekNumber, periodStart: pad(monday), periodEnd: pad(sunday) };
};
