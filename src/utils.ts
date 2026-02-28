export function isoNow(): string {
  return new Date().toISOString();
}

export function buildId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function normalize(text: unknown): string {
  return String(text ?? '').trim().toLowerCase();
}

export function parseNumber(input: unknown, fallback: number): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

export function parseBoolean(input: unknown, fallback = false): boolean {
  const normalized = normalize(input);
  if (!normalized) {
    return fallback;
  }
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

export function isValidEmail(email: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email ?? '').trim());
}

export function getHourInTimeZone(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false
  }).format(date);

  const parsed = Number(formatted);
  if (!Number.isFinite(parsed)) {
    return date.getHours();
  }
  return parsed % 24;
}

export function isWithinQuietHours(
  date: Date,
  timeZone: string,
  quietStart: number,
  quietEnd: number
): boolean {
  if (quietStart === quietEnd) {
    return false;
  }

  const hour = getHourInTimeZone(date, timeZone);
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  return hour >= quietStart || hour < quietEnd;
}

export function isSameDayUTC(aIso: string, b: Date): boolean {
  const a = new Date(aIso);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 3)}...`;
}
