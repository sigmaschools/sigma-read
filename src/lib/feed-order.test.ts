import assert from "node:assert";
import { orderFeed } from "./feed-order";

const dayStart = new Date("2026-11-09T06:00:00Z"); // local midnight in the student's zone
const at = (iso: string, category: string | null = null, title = iso) => ({ title, category, createdAt: iso });

{
  // Today's articles come before older unread ones, each group oldest first
  const old1 = at("2026-11-05T11:00:00Z", null, "old1");
  const old2 = at("2026-11-07T11:00:00Z", null, "old2");
  const today1 = at("2026-11-09T11:20:00Z", null, "today1");
  const today2 = at("2026-11-09T11:21:00Z", null, "today2");
  const ordered = orderFeed([old1, old2, today1, today2], dayStart);
  assert.deepStrictEqual(ordered.map(a => a.title), ["today1", "today2", "old1", "old2"]);
  console.log("✅ today's articles come first, oldest first within the day");
}

{
  // A tutorial article stays on top even when it is the oldest row
  const tutorial = at("2026-10-01T11:00:00Z", "tutorial", "welcome");
  const rows = [tutorial, ...Array.from({ length: 6 }, (_, i) => at(`2026-11-09T1${i}:00:00Z`, null, `today${i}`))];
  const ordered = orderFeed(rows, dayStart);
  assert.strictEqual(ordered[0].title, "welcome");
  assert.strictEqual(ordered.slice(0, 5).filter(a => a.category === "tutorial").length, 1);
  console.log("✅ tutorial article is first, inside the visible five");
}

{
  // First visit: starter articles (older) are not hidden by a same-day top-up (newer)
  const starters = ["s1", "s2"].map((t, i) => at(`2026-11-09T14:0${i}:00Z`, null, t));
  const topUp = ["t1", "t2", "t3"].map((t, i) => at(`2026-11-09T14:1${i}:00Z`, null, t));
  const ordered = orderFeed([...starters, ...topUp], dayStart);
  assert.deepStrictEqual(ordered.map(a => a.title), ["s1", "s2", "t1", "t2", "t3"]);
  console.log("✅ starter articles stay ahead of a same-day top-up");
}

{
  assert.deepStrictEqual(orderFeed([], dayStart), []);
  console.log("✅ empty feed is safe");
}
