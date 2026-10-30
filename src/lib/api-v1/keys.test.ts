import assert from "node:assert/strict";
import { generateApiKey, hashApiKey, bearerKey, cleanScopes, pageParams, encodeCursor, decodeCursor, sinceParam, pageOf } from "./keys";

{
  const a = generateApiKey(), b = generateApiKey();
  assert.notEqual(a.key, b.key);
  assert.ok(a.key.startsWith("sr_live_") && a.key.length > 36);
  assert.equal(a.hash, hashApiKey(a.key));
  assert.equal(a.prefix, a.key.slice(0, 12));
  assert.ok(!a.hash.includes(a.key));
  console.log("✅ keys are random, prefixed and hashed");
}

{
  const { key } = generateApiKey();
  assert.equal(bearerKey(`Bearer ${key}`), key);
  assert.equal(bearerKey(`bearer ${key}  `), key);
  assert.equal(bearerKey(null), null);
  assert.equal(bearerKey("Bearer someotherkey"), null);
  assert.equal(bearerKey(`Basic ${key}`), null);
  console.log("✅ bearerKey parses only our keys");
}

{
  assert.deepEqual(cleanScopes(["reports:read", "admin", "students:read", "reports:read"]), ["students:read", "reports:read"]);
  assert.deepEqual(cleanScopes("students:read"), []);
  console.log("✅ cleanScopes keeps known scopes only");
}

{
  assert.deepEqual(pageParams(new URLSearchParams("")), { limit: 50, after: null });
  assert.deepEqual(pageParams(new URLSearchParams(`limit=10&cursor=${encodeCursor(42)}`)), { limit: 10, after: 42 });
  assert.ok("error" in pageParams(new URLSearchParams("limit=0")));
  assert.ok("error" in pageParams(new URLSearchParams("limit=101")));
  assert.ok("error" in pageParams(new URLSearchParams("cursor=garbage")));
  assert.equal(decodeCursor(encodeCursor(7)), 7);
  console.log("✅ pageParams validates limit and cursor");
}

{
  assert.equal(sinceParam(null), null);
  assert.ok(sinceParam("2026-10-01") instanceof Date);
  assert.ok(sinceParam("2026-10-01T12:00:00Z") instanceof Date);
  assert.ok(typeof sinceParam("yesterday") === "object" && "error" in (sinceParam("yesterday") as object));
  assert.ok("error" in (sinceParam("2026-13-45") as object));
  console.log("✅ sinceParam accepts ISO dates only");
}

{
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(pageOf(rows, 2), { data: [{ id: 1 }, { id: 2 }], nextCursor: encodeCursor(2) });
  assert.deepEqual(pageOf(rows, 3), { data: rows, nextCursor: null });
  assert.deepEqual(pageOf([], 3), { data: [], nextCursor: null });
  console.log("✅ pageOf returns a next cursor only when more rows exist");
}
