import assert from "node:assert/strict";
import { startOfLocalDay } from "./local-day";

const iso = (d: Date) => d.toISOString();

// 22:20 UTC on 4 Nov is 4:20 pm in Chicago (CST, UTC-6): the day began at 06:00 UTC.
assert.equal(iso(startOfLocalDay("America/Chicago", new Date("2026-11-04T22:20:00Z"))), "2026-11-04T06:00:00.000Z");
// 02:00 UTC on 5 Nov is still the evening of 4 Nov in Chicago.
assert.equal(iso(startOfLocalDay("America/Chicago", new Date("2026-11-05T02:00:00Z"))), "2026-11-04T06:00:00.000Z");
// Summer time (CDT, UTC-5).
assert.equal(iso(startOfLocalDay("America/Chicago", new Date("2026-07-01T12:00:00Z"))), "2026-07-01T05:00:00.000Z");
// Clock-change day: Chicago falls back on 1 Nov 2026, midnight was still CDT.
assert.equal(iso(startOfLocalDay("America/Chicago", new Date("2026-11-01T20:00:00Z"))), "2026-11-01T05:00:00.000Z");
// Spring forward on 8 Mar 2026, midnight was still CST.
assert.equal(iso(startOfLocalDay("America/Chicago", new Date("2026-03-08T20:00:00Z"))), "2026-03-08T06:00:00.000Z");
// East of UTC.
assert.equal(iso(startOfLocalDay("Asia/Tokyo", new Date("2026-11-04T16:00:00Z"))), "2026-11-04T15:00:00.000Z");
// Missing or unknown zone keeps the UTC day.
assert.equal(iso(startOfLocalDay(null, new Date("2026-11-04T22:20:00Z"))), "2026-11-04T00:00:00.000Z");
assert.equal(iso(startOfLocalDay("Not/AZone", new Date("2026-11-04T22:20:00Z"))), "2026-11-04T00:00:00.000Z");

console.log("✅ startOfLocalDay follows the student's time zone");
