/**
 * Centralized date utilities for Chirag's training calendar.
 * ALL date-related logic across the application MUST use these functions.
 *
 * Convention:
 * - Week starts on MONDAY (ISO 8601)
 * - All "training dates" are in Chirag's local timezone
 * - performedAt is the canonical workout date from Hevy
 * - createdAt is when the record was created in the database
 * - These are NEVER interchangeable
 */

/**
 * Get the start of the week (Monday 00:00:00) for a given date in local timezone.
 */
export function getLocalWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday, 1=Monday, ...
  const diff = (day + 6) % 7; // Days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week (Sunday 23:59:59.999) for a given date in local timezone.
 */
export function getLocalWeekEnd(date: Date): Date {
  const start = getLocalWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Get the start of the day (00:00:00) in local timezone.
 */
export function getLocalDayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the day (23:59:59.999) in local timezone.
 */
export function getLocalDayEnd(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Get the start of the month in local timezone.
 */
export function getLocalMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of the month in local timezone.
 */
export function getLocalMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get an ISO date-only key (YYYY-MM-DD) for grouping workouts by day.
 * Uses LOCAL timezone.
 */
export function toLocalDateKey(date: Date): string {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get a week key (YYYY-MM-DD of Monday) for grouping workouts by week.
 * Uses LOCAL timezone with Monday start.
 */
export function toLocalWeekKey(date: Date): string {
  return toLocalDateKey(getLocalWeekStart(date));
}

/**
 * Check if two dates fall on the same LOCAL calendar day.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

/**
 * Check if a date falls within the current LOCAL week (Monday–Sunday).
 */
export function isCurrentWeek(date: Date): boolean {
  const now = new Date();
  const weekStart = getLocalWeekStart(now);
  const weekEnd = getLocalWeekEnd(now);
  return date >= weekStart && date <= weekEnd;
}

/**
 * Calculate the date range for a given range key.
 * Returns local timezone start and end.
 */
export function getDateRange(range: string): { start: Date; end: Date } {
  const now = new Date();
  const end = getLocalDayEnd(now);

  switch (range) {
    case 'this-week': {
      return { start: getLocalWeekStart(now), end: getLocalWeekEnd(now) };
    }
    case 'last-week': {
      const lastWeekEnd = new Date(getLocalWeekStart(now));
      lastWeekEnd.setMilliseconds(-1);
      const lastWeekStart = getLocalWeekStart(lastWeekEnd);
      return { start: lastWeekStart, end: getLocalDayEnd(lastWeekEnd) };
    }
    case '1w': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '4w':
    case '1m': {
      const start = new Date(now);
      start.setDate(start.getDate() - 28);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '8w': {
      const start = new Date(now);
      start.setDate(start.getDate() - 56);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '3m': {
      const start = new Date(now);
      start.setDate(start.getDate() - 91);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '6m': {
      const start = new Date(now);
      start.setDate(start.getDate() - 182);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '1y': {
      const start = new Date(now);
      start.setDate(start.getDate() - 365);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'all': {
      return { start: new Date(2000, 0, 1), end };
    }
    default: {
      // Assume weeks if numeric
      const weeks = parseInt(range, 10);
      if (!isNaN(weeks)) {
        const start = new Date(now);
        start.setDate(start.getDate() - weeks * 7);
        start.setHours(0, 0, 0, 0);
        return { start, end };
      }
      // Default to 3 months
      const start3m = new Date(now);
      start3m.setDate(start3m.getDate() - 91);
      start3m.setHours(0, 0, 0, 0);
      return { start: start3m, end };
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
