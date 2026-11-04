import assert from "node:assert";
import { findDuplicate, titleOverlap, SAME_TITLE } from "./dedup";

// Same subject, reworded titles
assert.ok(titleOverlap("Tesla: The Car Company That Changed Everything", "How Tesla Changed the Car Company Business") >= SAME_TITLE);
assert.ok(titleOverlap("The Amazing Octopus", "Octopuses Are Amazing") >= SAME_TITLE);
// Same broad subject, different angle: left to the model check
assert.ok(titleOverlap("How Octopuses Change Color", "The Octopus Brain in Every Arm") < SAME_TITLE);
// Unrelated
assert.equal(titleOverlap("Black Holes Bend Light", "Honeybees Dance Directions"), 0);
assert.equal(titleOverlap("", "Anything"), 0);

function client(reply: string | Error) {
  const sent: unknown[] = [];
  return {
    sent,
    messages: {
      create: async (body: unknown) => {
        sent.push(body);
        if (reply instanceof Error) throw reply;
        return { content: [{ type: "text", text: reply }], stop_reason: "end_turn" };
      },
    },
  } as never as { sent: unknown[]; messages: { create: (b: unknown) => Promise<unknown> } };
}

(async () => {
  const existing = [{ id: 7, title: "Tesla's Electric Cars" }, { id: 9, title: "Volcanoes Under the Sea" }];

  // Nothing to compare with: no model call
  const none = client('{"duplicate_of": 7}');
  assert.equal(await findDuplicate(none as never, { title: "Tesla, Inc.", text: "" }, []), null);
  assert.equal(none.sent.length, 0);

  // A close title is caught without a model call
  const close = client('{"duplicate_of": null}');
  assert.equal(await findDuplicate(close as never, { title: "Tesla Electric Cars", text: "" }, existing), 7);
  assert.equal(close.sent.length, 0);

  // The model names a duplicate
  assert.equal(await findDuplicate(client('{"duplicate_of": 7}') as never, { title: "Tesla, Inc.", text: "Tesla is an American company" }, existing), 7);
  // The model says none
  assert.equal(await findDuplicate(client('{"duplicate_of": null}') as never, { title: "Octopus", text: "" }, existing), null);
  // An id that isn't in the list is ignored
  assert.equal(await findDuplicate(client('{"duplicate_of": 42}') as never, { title: "Octopus", text: "" }, existing), null);
  // A failed call never blocks writing
  assert.equal(await findDuplicate(client(new Error("down")) as never, { title: "Octopus", text: "" }, existing), null);

  console.log("dedup tests passed");
})().catch(e => { console.error(e); process.exit(1); });
