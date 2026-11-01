import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { runTutorTurn, endsWithQuestion, closingInstruction, closingTargetWords, FALLBACK_CLOSING, FALLBACK_PROMPT, FALLBACK_OPENER, OPENER_INSTRUCTION, QUIET_NUDGE, needsQuietNudge, endsWithClosedQuestion, rewriteReason, questionInARow, type TurnMessage } from "./conversation-turn";

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
    { role: "user", content: `I think part ${i} matters because of the ink` },
  ]).flat();

const run = (client: Anthropic, messages: TurnMessage[], priorProgress: number) =>
  runTutorTurn({ client, model: "test", systemPrompt: "", messages, priorProgress, maxWords: 40 });

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

  // ─── Closed questions and long turns get one rewrite ──────────────────────
  {
    // From live tests
    assert.equal(endsWithClosedQuestion("Playing Starcraft takes real skill, right? The article says some games are about skill, others luck. What do you think matters more for fun — skill or luck?"), true);
    assert.equal(endsWithClosedQuestion("For me it'd be managing resources. What about the ancient games in the article, do you think Senet or Ur took real skill?"), true);
    assert.equal(endsWithClosedQuestion("Pretty cool. Does it surprise you that people 4,500 years ago liked the same kind of games we do now?"), true);
    // Open questions and light invites pass
    assert.equal(endsWithClosedQuestion("A canoe in the open ocean — that's intense. What do you think made them brave enough to go out there?"), false);
    assert.equal(endsWithClosedQuestion("The game makes a new world every time. Pretty wild, right?"), false);
    assert.equal(endsWithClosedQuestion("Over 32 million people play every day. Would you have guessed that?"), false);
    assert.equal(endsWithClosedQuestion("That sounds terrifying, honestly."), false);
    assert.equal(endsWithClosedQuestion("Would you want to live there or not? Why?"), false);

    assert.equal(endsWithClosedQuestion("How do you think scientists or engineers figured that out?"), false);
    assert.equal(endsWithClosedQuestion("If you had to pick, a house or a boat?"), true);
    assert.equal(rewriteReason("Why do you think that is?", 30, false, "Tell me what stood out."), null);
    // Mostly directives: a question is fine now and then, never two in a row (or as the opener)
    assert.ok(rewriteReason("Neat. Why do you think that is?", 30, false, "Cool. What stood out to you?")!.kind.includes("directive was expected"));
    // Bare follow-up questions are questions, not invites
    assert.ok(questionInARow("Hmm. Why?", "What stood out to you?"));
    assert.ok(questionInARow("Ok. Is that right?", "What stood out to you?"));
    assert.equal(questionInARow("They taste with their arms. Pretty wild, right?", "What stood out to you?"), false);
    assert.equal(questionInARow("They taste with their arms. Would you have guessed that?", "What stood out?"), false);
    assert.equal(questionInARow("Why do you think so?", "Tell me what stood out."), false);
    assert.ok(questionInARow("Why do you think so?", "Was that the scariest part? Why?"));
    assert.ok(rewriteReason("Neat. Why do you think that is?", 30, false, null)!.instruction("x").includes("directive"));
    assert.equal(rewriteReason("Neat. Why do you think that is?", 30, false, "Fish hooks from shells. Wild, right?"), null);
    assert.equal(rewriteReason("Fish hooks from shells. Wild, right?", 30, false, "What stood out to you?"), null);
    assert.equal(rewriteReason("Pick the part that stood out and tell me why.", 30, false, "What stood out to you?"), null);
    assert.equal(rewriteReason("Neat. Why do you think that is?", 30, true, "What stood out to you?"), null);
    assert.ok(rewriteReason("Neat. Did you know they can do that with no tools at all?", 30, true)!.instruction("x").includes("light invite"));
    assert.ok(rewriteReason(Array(50).fill("word").join(" ") + "?", 30)?.kind.includes("ran long"));

    // The rewrite replaces the message; the score stays from the first reply
    const replies = [
      { message: "Neat. Which matters more, skill or luck?", progressDelta: 20 },
      { message: "Neat. Why do you think skill makes winning feel better?", progressDelta: 5 },
    ];
    const calls: { role: string; content: string }[][] = [];
    const client = { messages: { create: async (req: { messages: { role: string; content: string }[] }) => {
      calls.push(req.messages);
      return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(replies[calls.length - 1]) }] };
    } } } as unknown as Anthropic;
    const r = await run(client, convo(1), 0);
    assert.equal(calls.length, 2);
    assert.ok(calls[1][calls[1].length - 1].content.includes("either/or"));
    assert.equal(r.message, "Neat. Why do you think skill makes winning feel better?");
    assert.equal(r.progressDelta, 20);

    // A failed rewrite keeps the first reply; a closing turn is never rewritten
    let n = 0;
    const flaky = { messages: { create: async () => {
      if (n++ === 1) throw new Error("overloaded");
      return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(replies[0]) }] };
    } } } as unknown as Anthropic;
    assert.equal((await run(flaky, convo(1), 0)).message, replies[0].message);
    const { client: closer, calls: closeCalls } = fakeClient({ message: "Thanks, that was fun. Skill or luck, you pick next time.", progressDelta: 0 });
    await run(closer, convo(6), 60);
    assert.equal(closeCalls.length, 1);
    console.log("✅ closed questions get one rewrite");
  }

  // ─── Quiet kid: two very short answers in a row get a share turn ──────────
  {
    const q = (a: string, b: string, last = "Why do you think that is?"): TurnMessage[] => [
      { role: "assistant", content: "Octopuses have three hearts. What stood out to you?" },
      { role: "user", content: a },
      { role: "assistant", content: last },
      { role: "user", content: b },
    ];
    assert.equal(needsQuietNudge(q("yeah", "idk")), true);
    assert.equal(needsQuietNudge(q("it was cool", "i dont know")), true);
    assert.equal(needsQuietNudge(q("yeah", "I think it is because they live in deep water")), false);
    assert.equal(needsQuietNudge(q("why the Moon?", "how come?")), false);
    // Not twice in a row: the 3rd short answer gets a normal turn, the 4th the nudge again
    const more = (n: number): TurnMessage[] => Array.from({ length: n }, () => [
      { role: "assistant", content: "Wild, right?" }, { role: "user", content: "yeah" },
    ]).flat();
    assert.equal(needsQuietNudge(more(3)), false);
    assert.equal(needsQuietNudge(more(4)), true);
    assert.equal(needsQuietNudge([...q("I liked how they hide in shells", "yeah"), ...more(1)]), true);
    assert.equal(needsQuietNudge(q("yeah", "idk").slice(2)), false);

    const { client, calls } = fakeClient({ message: "They can taste with their arms. Wild, right?", progressDelta: 5 });
    await run(client, q("yeah", "idk"), 20);
    assert.equal(calls[0][calls[0].length - 1].content, QUIET_NUDGE);
    console.log("✅ quiet kid gets a share turn");
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

  // ─── A goodbye past the threshold closes now, but not below it ─────────────
  {
    const bye = { message: "That's the heart of it, 4500 years and counting. Thanks for talking games with me, this was fun!", progressDelta: 30 };
    const r = await run(fakeClient(bye).client, convo(5), 97);
    assert.equal(r.complete, true, "no goodbye with an open reply box");
    assert.equal(r.closing, "earned");
    const early = await run(fakeClient(bye).client, convo(3), 20);
    assert.equal(early.complete, false, "below the threshold the turn stays open");
    const prompt = await run(fakeClient({ message: "Thanks for that. Why do you think so?", progressDelta: 30 }).client, convo(5), 97);
    assert.equal(prompt.complete, false, "a turn ending in a question is not a goodbye");
    for (const m of ["Thanks for that, tell me more.", "Minecraft was fun to build in, so tell me how the builders did it.", "Thanks for talking it through. Say more about the engines."]) {
      const r2 = await run(fakeClient({ message: m, progressDelta: 30 }).client, convo(5), 97);
      assert.equal(r2.complete, false, `a directive is not a goodbye: ${m}`);
    }
    console.log("✅ unprompted goodbye past the threshold closes the conversation");
  }

  // ─── Next turn after the threshold closes as earned ────────────────────────
  {
    const { client, calls } = fakeClient({ message: "You figured out the dance is a map.", progressDelta: 0 });
    const r = await run(client, convo(4), 110);
    assert.equal(r.complete, true);
    assert.equal(r.closing, "earned");
    assert.equal(calls[0].at(-1)!.content, closingInstruction("earned", 40));
    console.log("✅ earned close after the threshold");
  }

  // ─── Backstop closes as forced, with the forced instruction ────────────────
  {
    const { client, calls } = fakeClient({ message: "You noticed the ink cloud trick.", progressDelta: 10 });
    const r = await run(client, convo(6), 60);
    assert.equal(r.complete, true);
    assert.equal(r.closing, "forced");
    assert.equal(calls[0].at(-1)!.content, closingInstruction("forced", 40));
    assert.ok(!closingInstruction("forced").includes("demonstrated sufficient understanding"));
    console.log("✅ forced close at the backstop");
  }

  // ─── The level's word cap reaches the closing instruction ──────────────────
  {
    const { client, calls } = fakeClient({ message: "You noticed the ink cloud trick.", progressDelta: 0 });
    await runTutorTurn({ client, model: "test", systemPrompt: "", messages: convo(6), priorProgress: 60, maxWords: 15 });
    assert.equal(calls[0].at(-1)!.content, closingInstruction("forced", 15));
    assert.ok(closingInstruction("forced", 15).includes("under 15 words"));
    assert.ok(closingInstruction("earned", 20).includes("Keep it under 20 words, so aim for about 15."));
    assert.ok(closingInstruction("earned").includes("No verdict on them"));
    assert.ok(closingInstruction("forced", 15).includes("aim for about 10"));
    assert.ok(closingInstruction("earned", 40).includes("Keep it under 40 words."), "no target at L3+");
    assert.deepEqual([15, 20, 40, 50, 10, 8].map(closingTargetWords), [10, 15, 35, 45, 8, 7]);
    assert.ok(closingInstruction("forced").includes("No stock sign-off"));
    assert.ok(!closingInstruction("forced").includes("Keep it under"));
    console.log("✅ closing carries the word cap");
  }

  // ─── A closing that asks a question is replaced ────────────────────────────
  {
    const { client } = fakeClient({ message: "Want to read another one?", progressDelta: 0 });
    const r = await run(client, convo(6), 60);
    assert.equal(r.message, FALLBACK_CLOSING);
    assert.equal(r.usedFallback, "closing_question");
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
    const opener = await run(fakeClient({ message: "", progressDelta: 0 }).client, [], 0);
    assert.equal(opener.message, FALLBACK_OPENER);
    const close = await run(fakeClient({ message: "  ", progressDelta: 0 }).client, convo(6), 60);
    assert.equal(close.message, FALLBACK_CLOSING);
    assert.equal(close.usedFallback, "empty");
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
