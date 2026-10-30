import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { runTutorTurn, closingInstruction, FALLBACK_CLOSING, OPENER_INSTRUCTION, type TurnMessage } from "./conversation-turn";

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

  // ─── Deltas are clamped ────────────────────────────────────────────────────
  {
    const { client } = fakeClient({ message: "Tell me more.", progressDelta: 90 });
    const r = await run(client, convo(1), 0);
    assert.equal(r.progressDelta, 40);
    console.log("✅ progressDelta clamped to 40");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
