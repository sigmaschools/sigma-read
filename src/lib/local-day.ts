// The start of "today" for a student, in the student's own time zone.
//
// The server runs in UTC, so `setHours(0, 0, 0, 0)` on the server starts the day at
// midnight UTC: 6 or 7 pm the evening before in US Central. Reading done that evening
// then counted toward the next day's goal and cap. The student page sends the device's
// IANA time zone; an unknown or missing zone keeps the old UTC boundary.

function validZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// Milliseconds the zone is ahead of UTC at the given instant.
function zoneOffset(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

export function startOfLocalDay(tz: string | null | undefined, now: Date = new Date()): Date {
  const zone = validZone(tz);
  if (!zone) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const local = new Date(now.getTime() + zoneOffset(now, zone));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Correct with the offset at midnight itself, which differs from now's on a clock-change day.
  let start = midnightAsUtc - zoneOffset(new Date(midnightAsUtc), zone);
  start = midnightAsUtc - zoneOffset(new Date(start), zone);
  return new Date(start);
}

// The zone a request names, from `?tz=` or the `X-Time-Zone` header.
export function requestZone(req: Request): string | null {
  const url = new URL(req.url);
  return validZone(url.searchParams.get("tz") || req.headers.get("x-time-zone"));
}
