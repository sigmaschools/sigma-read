import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { runTutorTurn, endsWithQuestion, closingInstruction, FALLBACK_CLOSING, FALLBACK_PROMPT, OPENER_INSTRUCTION, type TurnMessage } from "./conversation-turn";

/** Fake client that returns a fixed reply and records the messages it was sent */
function fakeClient(reply: { message: string; progressDelta: number }) {
  const calls: { role: string; content: string }[][] = [];
  const client = {
    messages: {
      create: async (req: { messages: { role: string; content: string }[] }) => {
        calls.push(req.messages);
        return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const convo = (studentTurns: number): TurnMessage[] =>
  Array.from({ length: studentTurns }, (_, i) => [
    { role: "assistant", content: `Tell me about part ${i}.` },
    { role: "user", content: `answer ${i}` },
  ]).flat();

const run = (client: Anthropic, messages: TurnMessage[], priorProgress: number) =>
  runTutorTurn({ client, model: "test", systemPrompt: "", messages, priorProgress });

async function main() {
  // ─── Opener uses the opener instruction and never completes ────────────────
  {
    const { client, calls } = fakeClient({ message: "Octopuses have three hearts. Tell me what surprised you.", progressDelta: 0 });
    const r = await run(client, [], 0);
    assert.equal(calls[0][0].content, OPENER_INSTRUCTION);
    assert.equal(r.complete, false);
    assert.equal(r.closing, null);
    console.log("✅ opener uses the opener instruction");
  }

  // ─── Crossing 100 mid-conversation defers completion one exchange ──────────
  {
    const { client, calls } = fakeClient({ message: "Walk me through why that matters.", progressDelta: 40 });
    const r = await run(client, convo(3), 70);
    assert.equal(r.progressScore, 110);
    assert.equal(r.complete, false, "student still gets to answer the tutor's directive");
    assert.equal(calls[0].length, 6, "no closing instruction injected");
    console.log("✅ crossing the threshold defers completion");
  }

  // ─── Next turn after the threshold closes as earned ────────────────────────
  {
    const { client, calls } = fakeClient({ message: "You figured out the dance is a map.", progressDelta: 0 });
    const r = await run(client, convo(4), 110);
    assert.equal(r.complete, true);
    assert.equal(r.closing, "earned");
    assert.equal(calls[0].at(-1)!.content, closingInstruction("earned"));
    console.log("✅ earned close after the threshold");
  }

  // ─── Backstop closes as forced, with the forced instruction ────────────────
  {
    const { client, calls } = fakeClient({ message: "You noticed the ink cloud trick.", progressDelta: 10 });
    const r = await run(client, convo(6), 60);
    assert.equal(r.complete, true);
    assert.equal(r.closing, "forced");
    assert.equal(calls[0].at(-1)!.content, closingInstruction("forced"));
    assert.ok(!closingInstruction("forced").includes("demonstrated sufficient understanding"));
    console.log("✅ forced close at the backstop");
  }

  // ─── A closing that asks a question is replaced ────────────────────────────
  {
    const { client } = fakeClient({ message: "Want to read another one?", progressDelta: 0 });
    const r = await run(client, convo(6), 60);
    assert.equal(r.message, FALLBACK_CLOSING);
    console.log("✅ closing question replaced with the fallback");
  }

  // ─── A rejected schema falls back to a plain-text request ──────────────────
  {
    const sent: Record<string, unknown>[] = [];
    const client = {
      messages: {
        create: async (req: Record<string, unknown>) => {
          sent.push(req);
          if (req.output_config) throw new Anthropic.BadRequestError(400, { error: { message: "unsupported" } }, "unsupported", new Headers());
          return { stop_reason: "end_turn", content: [{ type: "text", text: '{"message": "Tell me about the ink.", "progressDelta": 20}' }] };
        },
      },
    } as unknown as Anthropic;
    const r = await run(client, convo(1), 0);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].output_config, undefined);
    assert.equal(r.message, "Tell me about the ink.");
    assert.equal(r.progressDelta, 20);
    console.log("✅ rejected schema retries as plain text");
  }

  // ─── High progress before 3 exchanges doesn't close ────────────────────────
  {
    const { client, calls } = fakeClient({ message: "Tell me why that matters.", progressDelta: 30 });
    const r = await run(client, convo(2), 110);
    assert.equal(r.complete, false);
    assert.equal(calls[0].length, 4, "no closing instruction before 3 exchanges");
    console.log("✅ no close before 3 exchanges");
  }

  // ─── Earned wins over forced at the backstop ───────────────────────────────
  {
    const { client } = fakeClient({ message: "You explained the waggle dance.", progressDelta: 0 });
    const r = await run(client, convo(6), 120);
    assert.equal(r.closing, "earned", "a student who already earned it isn't marked forced");
    console.log("✅ earned close wins at the backstop");
  }

  // ─── Empty messages never reach the student ────────────────────────────────
  {
    const mid = await run(fakeClient({ message: "", progressDelta: 20 }).client, convo(1), 0);
    assert.equal(mid.message, FALLBACK_PROMPT);
    assert.equal(mid.progressDelta, 20);
    const close = await run(fakeClient({ message: "  ", progressDelta: 0 }).client, convo(6), 60);
    assert.equal(close.message, FALLBACK_CLOSING);
    console.log("✅ empty messages are replaced");
  }

  // ─── Question detection ignores trailing quotes and emoji ──────────────────
  {
    assert.ok(endsWithQuestion("Want to try another?\""));
    assert.ok(endsWithQuestion("Ready for more? 🚀"));
    assert.ok(endsWithQuestion("(Any questions?)"));
    assert.ok(!endsWithQuestion("You figured out the dance is a map."));
    console.log("✅ endsWithQuestion handles trailing punctuation");
  }

  // ─── The closing turn adds no progress ─────────────────────────────────────
  {
    const r = await run(fakeClient({ message: "You noticed the ink trick.", progressDelta: 30 }).client, convo(6), 60);
    assert.equal(r.progressDelta, 0);
    assert.equal(r.progressScore, 60);
    console.log("✅ closing turn adds no progress");
  }

  // ─── Deltas are clamped ────────────────────────────────────────────────────
  {
    const { client } = fakeClient({ message: "Tell me more.", progressDelta: 90 });
    const r = await run(client, convo(1), 0);
    assert.equal(r.progressDelta, 40);
    console.log("✅ progressDelta clamped to 40");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
