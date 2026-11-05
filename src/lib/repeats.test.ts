import assert from "node:assert";
import { checkBudget, excerpt, findRepeats, pickWithoutRepeats, repeatsPrompt } from "./repeats";

type Client = Parameters<typeof findRepeats>[0];

function client(reply: string | Error) {
  const sent: { messages: { content: string }[] }[] = [];
  return {
    sent,
    messages: {
      create: async (body: unknown) => {
        sent.push(body as never);
        if (reply instanceof Error) throw reply;
        return { content: [{ type: "text", text: reply }], stop_reason: "end_turn" };
      },
    },
  } as never as Client & { sent: { messages: { content: string }[] }[] };
}

const cooking = { title: "How Cooking Changed Humanity Forever", excerpt: "Around one million years ago, early humans at Wonderwerk Cave in South Africa learned to control fire." };
const smoking = { id: 42, title: "The Ancient Art of Smoking Food", excerpt: "Around 780,000 years ago at a site in what is now Israel, early humans hung elephant meat over smoky fires." };
const weather = { id: 48, title: "The Restless Sky: How Weather Really Works", excerpt: "Without its blanket of air, Earth's average surface temperature would be about -18°C." };
const spacex = { id: 23, title: "SpaceX: From Near Bankruptcy to Trillion-Dollar Giant", excerpt: "On September 28, 2008, a rocket lifted off." };

(async () => {
  // Excerpts: the opening, then later sentences that carry a number or date
  const filler = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
  const body = `${filler}\n\nNo numbers here. Evidence dates back 780,000 years in Israel. Then nothing. By 3000 BCE Egyptians smoked fish.`;
  assert.equal(excerpt(body), `${filler} … Evidence dates back 780,000 years in Israel. … By 3000 BCE Egyptians smoked fish.`);
  assert.equal(excerpt("Short one."), "Short one.");
  assert.equal(excerpt(null), "");

  // Nothing read yet, or nothing to check: no model call
  const none = client('{"repeats":[42]}');
  assert.equal((await findRepeats(none, [smoking], [])).size, 0);
  // ...but with no history, two candidates are still compared with each other
  const pair = client('{"repeats":[42]}');
  assert.deepEqual([...await findRepeats(pair, [weather, smoking], [])], [42]);
  assert.equal(pair.sent.length, 1);
  assert.equal((await findRepeats(none, [], [cooking])).size, 0);
  assert.equal(none.sent.length, 0);

  // A reworded title of something already read is caught without the model
  const titleOnly = client('{"repeats":[]}');
  const read = [cooking, { title: "SpaceX: From Bankruptcy to a Trillion-Dollar Giant", excerpt: "" }];
  assert.deepEqual([...await findRepeats(titleOnly, [spacex], read)], [23]);
  assert.equal(titleOnly.sent.length, 0);

  // The model sees the openings and its ids count only for candidates it was asked about
  const model = client('{"repeats":[42, 999]}');
  const found = await findRepeats(model, [smoking, weather, spacex], read);
  assert.deepEqual([...found].sort(), [23, 42]);
  assert.equal(model.sent.length, 1);
  const prompt = model.sent[0].messages[0].content;
  assert.ok(prompt.includes("Wonderwerk Cave") && prompt.includes("elephant meat"));
  assert.ok(!prompt.includes("23. "), "title matches are not sent to the model");

  // A failed model call leaves only the title matches
  const failing = client(new Error("overloaded"));
  assert.deepEqual([...await findRepeats(failing, [smoking, spacex], read)], [23]);

  // One failure spends the serving's budget: later checks make no model call
  const budget = checkBudget();
  const flaky = client(new Error("timeout"));
  await findRepeats(flaky, [smoking], read, { budget });
  await findRepeats(flaky, [weather], read, { budget });
  assert.equal(flaky.sent.length, 1);
  assert.ok(budget.failed);
  // ...and a spent budget makes none at all
  const late = client('{"repeats":[42]}');
  assert.equal((await findRepeats(late, [smoking], read, { budget: checkBudget(0) })).size, 0);
  assert.equal(late.sent.length, 0);
  // Strict (the eval) throws instead of passing a failure off as "no repeats"
  await assert.rejects(findRepeats(client(new Error("401")), [smoking], read, { strict: true }));

  // The prompt names both kinds of repeat and the allowed new angle
  const p = repeatsPrompt([smoking], [cooking]);
  assert.ok(p.includes("same story told again") && p.includes("NOT a repeat"));

  // Picking again replaces repeats; approved picks are not checked twice
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const checked: number[][] = [];
  const picks = await pickWithoutRepeats(
    excluded => pool.filter(a => !excluded.has(a.id)).slice(0, 2),
    async (unchecked, approved) => {
      checked.push([...unchecked.map(u => u.id), ...approved.map(a => -a.id)]);
      return new Set(unchecked.filter(u => u.id === 2).map(u => u.id));
    },
  );
  assert.deepEqual(picks.map(p => p.id), [1, 3]);
  // The replacement is checked alongside the pick already approved (negative ids here)
  assert.deepEqual(checked, [[1, 2], [3, -1]]);

  // Out of rounds: the remaining repeats are dropped, never served
  const allRepeats = await pickWithoutRepeats(
    excluded => pool.filter(a => !excluded.has(a.id)).slice(0, 2),
    async unchecked => new Set(unchecked.map(u => u.id)),
    2,
  );
  assert.deepEqual(allRepeats, []);

  console.log("repeats tests passed");
})().catch(e => { console.error(e); process.exit(1); });
