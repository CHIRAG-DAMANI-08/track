/**
 * Centralized date utilities for Chirag's training calendar.
 * ALL date-related logic across the application MUST use these functions.
 *
 * Convention:
 * - Chirag's local training timezone is Asia/Kolkata (IST, UTC+05:30)
 * - Week starts on MONDAY (ISO 8601)
 * - All training day/week calculations are evaluated in Asia/Kolkata,
 *   guaranteeing consistency whether running locally, on Vercel, or in CI.
 * - performedAt is the canonical workout date/time from Hevy
 * - createdAt is when the record was created in the database
 */

export const ATHLETE_TIMEZONE = 'Asia/Kolkata';

// Asia/Kolkata is fixed UTC+05:30 (no daylight saving time changes)
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface AthleteDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;  // 0-23
  minute: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ...
}

/**
 * Returns year, month, day, hour, minute, dayOfWeek in Chirag's local timezone (Asia/Kolkata).
 */
export function getAthleteDateParts(date: Date = new Date(), timeZone: string = ATHLETE_TIMEZONE): AthleteDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? 0,
  };
}

/**
 * Convert local date components in Asia/Kolkata to an exact UTC Date instance.
 */
export function athleteLocalToUTC(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  ms: number = 0
): Date {
  const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, ms) - IST_OFFSET_MS;
  return new Date(utcTimestamp);
}

/**
 * Format a date in Chirag's timezone (Asia/Kolkata).
 */
export function formatInAthleteTimeZone(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
  timeZone: string = ATHLETE_TIMEZONE
): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...options,
  }).format(date);
}

/**
 * Get the start of the week (Monday 00:00:00 IST) for a given date.
 */
export function getLocalWeekStart(date: Date = new Date()): Date {
  const parts = getAthleteDateParts(date);
  const diff = (parts.dayOfWeek + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - diff));
  return athleteLocalToUTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0, 0, 0, 0
  );
}

/**
 * Get the end of the week (Sunday 23:59:59.999 IST) for a given date.
 */
export function getLocalWeekEnd(date: Date = new Date()): Date {
  const start = getLocalWeekStart(date);
  return new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);
}

/**
 * Get the start of the day (00:00:00 IST).
 */
export function getLocalDayStart(date: Date = new Date()): Date {
  const parts = getAthleteDateParts(date);
  return athleteLocalToUTC(parts.year, parts.month, parts.day, 0, 0, 0, 0);
}

/**
 * Get the end of the day (23:59:59.999 IST).
 */
export function getLocalDayEnd(date: Date = new Date()): Date {
  const parts = getAthleteDateParts(date);
  return athleteLocalToUTC(parts.year, parts.month, parts.day, 23, 59, 59, 999);
}

/**
 * Get the start of the month in local timezone.
 */
export function getLocalMonthStart(date: Date = new Date()): Date {
  const parts = getAthleteDateParts(date);
  return athleteLocalToUTC(parts.year, parts.month, 1, 0, 0, 0, 0);
}

/**
 * Get the end of the month in local timezone.
 */
export function getLocalMonthEnd(date: Date = new Date()): Date {
  const parts = getAthleteDateParts(date);
  const nextMonth = new Date(Date.UTC(parts.year, parts.month, 1));
  const lastDay = new Date(nextMonth.getTime() - 1);
  return athleteLocalToUTC(
    lastDay.getUTCFullYear(),
    lastDay.getUTCMonth() + 1,
    lastDay.getUTCDate(),
    23, 59, 59, 999
  );
}

/**
 * Get an ISO date-only key (YYYY-MM-DD) for grouping workouts by day.
 * Always evaluated in Chirag's timezone (Asia/Kolkata).
 */
export function toLocalDateKey(date: Date): string {
  const parts = getAthleteDateParts(date);
  const yyyy = parts.year;
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get a week key (YYYY-MM-DD of Monday) for grouping workouts by week.
 * Always evaluated in Chirag's timezone (Asia/Kolkata).
 */
export function toLocalWeekKey(date: Date): string {
  return toLocalDateKey(getLocalWeekStart(date));
}

/**
 * Check if two dates fall on the same LOCAL calendar day in Asia/Kolkata.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

/**
 * Check if a date falls within the current LOCAL week (Monday–Sunday) in Asia/Kolkata.
 */
export function isCurrentWeek(date: Date): boolean {
  const now = new Date();
  const weekStart = getLocalWeekStart(now);
  const weekEnd = getLocalWeekEnd(now);
  return date >= weekStart && date <= weekEnd;
}

/**
 * Calculate the date range for a given range key.
 * Returns athlete local timezone start and end.
 */
export function getDateRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = getLocalWeekEnd(now);

  switch (range) {
    case 'this-week': {
      return { start: getLocalWeekStart(now), end: getLocalWeekEnd(now) };
    }
    case 'last-week': {
      const thisWeekStart = getLocalWeekStart(now);
      const lastWeekStart = new Date(thisWeekStart.getTime() - (7 * 24 * 60 * 60 * 1000));
      const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
      return { start: lastWeekStart, end: lastWeekEnd };
    }
    case '1w': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case '4w':
    case '1m': {
      const start = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case '8w': {
      const start = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case '3m': {
      const start = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case '6m': {
      const start = new Date(now.getTime() - 182 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case '1y': {
      const start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start), end };
    }
    case 'all': {
      return { start: new Date(2000, 0, 1), end };
    }
    default: {
      const weeks = parseInt(range, 10);
      if (!isNaN(weeks)) {
        const start = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
        return { start: getLocalDayStart(start), end };
      }
      const start3m = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
      return { start: getLocalDayStart(start3m), end };
    }
  }
}

/**
 * Convert range string to number of weeks.
 * Used by analytics functions that expect a week count.
 */
export function rangeToWeeks(range: string): number {
  switch (range) {
    case '1w': return 1;
    case '1m': return 4;
    case '3m': return 13;
    case '6m': return 26;
    case '1y': return 52;
    case 'all': return 520;
    default: return 13;
  }
}
