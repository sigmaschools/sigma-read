import assert from "node:assert/strict";

process.env.COMPASS_URL = "https://compass.invalid";
process.env.COMPASS_INTERESTS_KEY = "not-a-real-key"; // credential-check: allow

async function main() {
  const { fetchTopicMap } = await import("./compass");
  const map = { version: "W/\"abc\"", redirects: {}, topics: [{ id: "sharks", label: "Sharks", kind: "topic", minGrade: 0 }] };
  const calls: (string | undefined)[] = [];
  let answer: () => Response = () => Response.json(map);
  const realFetch = globalThis.fetch;
  const realError = console.error;
  console.error = () => {};
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls.push((init?.headers as Record<string, string>)["If-None-Match"]);
    return answer();
  }) as typeof fetch;
  try {
    assert.deepEqual(await fetchTopicMap(), map);
    assert.equal(calls[0], undefined, "the first read has no version to offer");

    answer = () => new Response(null, { status: 304 });
    assert.deepEqual(await fetchTopicMap(), map, "unchanged: the map in hand is returned");
    assert.equal(calls[1], map.version, "the version goes back exactly as Compass gave it");

    answer = () => Response.json({ version: "x", redirects: {}, topics: [] });
    assert.equal(await fetchTopicMap(), null, "an empty map is not a map");

    answer = () => new Response("no", { status: 404 });
    assert.equal(await fetchTopicMap(), null);

    answer = () => { throw new Error("unreachable"); };
    assert.equal(await fetchTopicMap(), null);
    const before = calls.length;
    assert.equal(await fetchTopicMap(), null, "after a failure Compass is left alone for a while");
    assert.equal(calls.length, before, "no call during the cool-down");
    console.log("✅ fetchTopicMap: first read, unchanged, empty, refused, unreachable and the cool-down");
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
