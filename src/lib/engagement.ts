// Weekly engagement numbers: the baseline every reading change is measured against.
//
// A change to what students read or how Sigma talks is kept only if these hold
// (docs/session-analytics.md, "Engagement baseline"). Everything here is computed
// from rows the app already keeps, so any past week can be read back, except
// word lookups, which are saved only from migration 0025 on (the first saved lookup marks the start).

import { dailyGoalOf } from "./daily-goal";

// Days and weeks are counted in one zone, since the student's own zone is not stored.
// Weeks start on Monday.
export const REPORT_ZONE = "America/Chicago";

// The boundary doc's target zone for comprehension scores
export const TARGET_ZONE = { min: 60, max: 75 } as const;

export interface EngagementInput {
  // Each finished piece: the reading session's completion, its article's thumbs, its report
  sessions: { studentId: number; completedAt: Date; liked: boolean | null; score: number | null; selfAssessment: string | null }[];
  favorites: { studentId: number; createdAt: Date }[];
  lookups: { studentId: number; createdAt: Date }[];
  // The day's goal in pieces, by student; a student missing here uses the default
  goals: Map<number, number | null>;
  // When lookups were first saved; weeks before it show no lookup rate rather than zero
  lookupsSince?: Date | null;
}

export interface EngagementWeek {
  week: string; // the Monday, YYYY-MM-DD
  students: number; // students who finished at least one piece
  pieces: number; // pieces finished (a discussion completed)
  piecesPerStudent: number | null;
  daysRead: number; // student-days with at least one piece
  goalDays: number; // student-days that reached the day's goal
  goalRate: number | null; // goalDays / daysRead
  liked: number;
  disliked: number;
  likeRate: number | null; // liked / (liked + disliked)
  favorites: number;
  favoriteRate: number | null; // favorites / goalDays (the pick is offered on goal days)
  selfAssessment: Record<"really_well" | "pretty_well" | "not_sure" | "lost", number>;
  scored: number;
  scoreP25: number | null;
  scoreMedian: number | null;
  scoreP75: number | null;
  inTargetZone: number | null; // share of scores in the target zone
  lookups: number;
  lookupsPerPiece: number | null; // null before lookups were saved
}

export function localDate(at: Date, zone: string = REPORT_ZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function weeklyEngagement(input: EngagementInput, zone: string = REPORT_ZONE): EngagementWeek[] {
  type Acc = {
    students: Set<number>;
    perDay: Map<string, number>; // "student|date" → pieces
    pieces: number; liked: number; disliked: number; favorites: number; lookups: number;
    scores: number[];
    self: EngagementWeek["selfAssessment"];
  };
  const weeks = new Map<string, Acc>();
  const acc = (week: string): Acc => {
    let a = weeks.get(week);
    if (!a) {
      a = { students: new Set(), perDay: new Map(), pieces: 0, liked: 0, disliked: 0, favorites: 0, lookups: 0, scores: [],
        self: { really_well: 0, pretty_well: 0, not_sure: 0, lost: 0 } };
      weeks.set(week, a);
    }
    return a;
  };

  for (const s of input.sessions) {
    const date = localDate(s.completedAt, zone);
    const a = acc(weekOf(date));
    a.students.add(s.studentId);
    a.pieces++;
    const key = `${s.studentId}|${date}`;
    a.perDay.set(key, (a.perDay.get(key) ?? 0) + 1);
    if (s.liked === true) a.liked++;
    if (s.liked === false) a.disliked++;
    if (typeof s.score === "number") a.scores.push(s.score);
    if (s.selfAssessment && s.selfAssessment in a.self) a.self[s.selfAssessment as keyof Acc["self"]]++;
  }
  for (const f of input.favorites) acc(weekOf(localDate(f.createdAt, zone))).favorites++;
  for (const l of input.lookups) acc(weekOf(localDate(l.createdAt, zone))).lookups++;

  const lookupWeek = input.lookupsSince ? weekOf(localDate(input.lookupsSince, zone)) : null;
  return [...weeks.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([week, a]) => {
    let goalDays = 0;
    for (const [key, n] of a.perDay) {
      const studentId = Number(key.split("|")[0]);
      if (n >= dailyGoalOf({ dailyGoalArticles: input.goals.get(studentId) ?? null })) goalDays++;
    }
    const scores = [...a.scores].sort((x, y) => x - y);
    const inZone = scores.filter(v => v >= TARGET_ZONE.min && v <= TARGET_ZONE.max).length;
    return {
      week,
      students: a.students.size,
      pieces: a.pieces,
      piecesPerStudent: ratio(a.pieces, a.students.size),
      daysRead: a.perDay.size,
      goalDays,
      goalRate: ratio(goalDays, a.perDay.size),
      liked: a.liked,
      disliked: a.disliked,
      likeRate: ratio(a.liked, a.liked + a.disliked),
      favorites: a.favorites,
      favoriteRate: ratio(a.favorites, goalDays),
      selfAssessment: a.self,
      scored: scores.length,
      scoreP25: quantile(scores, 0.25),
      scoreMedian: quantile(scores, 0.5),
      scoreP75: quantile(scores, 0.75),
      inTargetZone: ratio(inZone, scores.length),
      lookups: a.lookups,
      lookupsPerPiece: lookupWeek !== null && week >= lookupWeek ? ratio(a.lookups, a.pieces) : null,
    };
  });
}
