// The student's device zone: days are its calendar days
process.env.TZ = "America/Chicago";
import assert from "node:assert";
import { orderFeed } from "./feed-order";

let nextId = 1;
const at = (iso: string, category: string | null = null, title = iso) => ({ id: nextId++, title, category, createdAt: iso });

{
  // Today's articles come before older unread ones, oldest first within the day; older days newest day first
  const old1 = at("2026-11-05T11:00:00Z", null, "old1");
  const old2 = at("2026-11-07T11:00:00Z", null, "old2");
  const today1 = at("2026-11-09T11:20:00Z", null, "today1");
  const today2 = at("2026-11-09T11:21:00Z", null, "today2");
  const ordered = orderFeed([old1, old2, today1, today2]);
  assert.deepStrictEqual(ordered.map(a => a.title), ["today1", "today2", "old2", "old1"]);
  console.log("✅ today's articles come first, oldest first within the day");
}

{
  // A tutorial article stays on top even when it is the oldest row
  const tutorial = at("2026-10-01T11:00:00Z", "tutorial", "welcome");
  const rows = [tutorial, ...Array.from({ length: 6 }, (_, i) => at(`2026-11-09T1${i}:00:00Z`, null, `today${i}`))];
  const ordered = orderFeed(rows);
  assert.strictEqual(ordered[0].title, "welcome");
  assert.strictEqual(ordered.slice(0, 5).filter(a => a.category === "tutorial").length, 1);
  console.log("✅ tutorial article is first, inside the visible five");
}

{
  // First visit: starter articles (older) are not hidden by a same-day top-up (newer)
  const starters = ["s1", "s2"].map((t, i) => at(`2026-11-09T14:0${i}:00Z`, null, t));
  const topUp = ["t1", "t2", "t3"].map((t, i) => at(`2026-11-09T14:1${i}:00Z`, null, t));
  const ordered = orderFeed([...starters, ...topUp]);
  assert.deepStrictEqual(ordered.map(a => a.title), ["s1", "s2", "t1", "t2", "t3"]);
  console.log("✅ starter articles stay ahead of a same-day top-up");
}

{
  // Yesterday's unread story comes before last week's, still oldest first within its day
  const lastWeek = at("2026-11-02T11:00:00Z", null, "lastWeek");
  const yesterday1 = at("2026-11-08T11:20:00Z", null, "yesterday1");
  const yesterday2 = at("2026-11-08T11:21:00Z", null, "yesterday2");
  const today = at("2026-11-09T11:20:00Z", null, "today");
  const ordered = orderFeed([lastWeek, yesterday2, yesterday1, today]);
  assert.deepStrictEqual(ordered.map(a => a.title), ["today", "yesterday1", "yesterday2", "lastWeek"]);
  console.log("✅ days newest first, oldest first within a day");
}

{
  // An unparseable createdAt sorts as the oldest instead of breaking the sort
  const broken = at("not a date", null, "broken");
  const ok = at("2026-11-09T11:20:00Z", null, "ok");
  assert.deepStrictEqual(orderFeed([broken, ok]).map(a => a.title), ["ok", "broken"]);
  console.log("✅ invalid dates don't break the order");
}

{
  // The order doesn't depend on the input order
  const rows = [at("2026-11-09T11:21:00Z", null, "today2"), at("2026-11-05T11:00:00Z", null, "old"), at("2026-11-09T11:20:00Z", null, "today1")];
  assert.deepStrictEqual(orderFeed(rows).map(a => a.title), ["today1", "today2", "old"]);
  assert.deepStrictEqual(orderFeed([...rows].reverse()).map(a => a.title), ["today1", "today2", "old"]);
  console.log("✅ sorted by served time, whatever the input order");
}

{
  // Days are cut at the device's local midnight, not UTC's: 05:59Z on Nov 9 is still Nov 8 in Chicago
  const lateNov8 = at("2026-11-09T05:59:00Z", null, "lateNov8");
  const earlyNov9 = at("2026-11-09T06:01:00Z", null, "earlyNov9");
  assert.deepStrictEqual(orderFeed([lateNov8, earlyNov9]).map(a => a.title), ["earlyNov9", "lateNov8"]);
  console.log("✅ days follow the device's time zone");
}

{
  assert.deepStrictEqual(orderFeed([]), []);
  console.log("✅ empty feed is safe");
}
