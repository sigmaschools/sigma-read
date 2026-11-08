import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { isCurrentGuideNotes, NOTES_VERSION, type GuideNotes } from "./guide-notes";

// The prompt .md files load as strings, as in Next's bundler
const require = createRequire(import.meta.url);
require("../../../scripts/md-require.cjs");
const { plain, supportsSystemMessages, sigmaClosing, sigmaOpener, OPENER_SHAPES, runSigmaTurn, asksForDebate } = require("./turn") as typeof import("./turn");
const { sigmaSystemBlocks, formatNotes, levelVoice } = require("./prompt") as typeof import("./prompt");
const { sigmaExchange } = require("./conversation") as typeof import("./conversation");
const { observerPrompt, kidAskedQuestion, MIN_EXCHANGES, MAX_EXCHANGES } = require("./observer") as typeof import("./observer");
const { tutorDesignForNewConversation } = require("./design") as typeof import("./design");

// ─── plain(): the markdown the model adds anyway comes off ─────────────────
{
  assert.equal(plain("**Two months.** I'd be *so* hungry."), "Two months. I'd be so hungry.");
  assert.equal(plain("- one\n- two"), "one\ntwo");
  assert.equal(plain("# Heading\nBody"), "Heading\nBody");
  assert.equal(plain("2 * 3 is six"), "2 * 3 is six", "a lone asterisk stays");
  console.log("✅ plain() strips markdown");
}

// ─── System messages inside the conversation: only models that accept them ──
{
  assert.ok(supportsSystemMessages("claude-opus-5-5"));
  assert.ok(supportsSystemMessages("claude-sonnet-5-5"));
  assert.ok(supportsSystemMessages("claude-fable-5-1"));
  assert.ok(!supportsSystemMessages("claude-opus-4-6"));
  assert.ok(!supportsSystemMessages("claude-sonnet-4-6"));
  console.log("✅ supportsSystemMessages");
}

// ─── The prompt holds the character, the examples, the article and the notes ─
const notes: GuideNotes = {
  worthTalkingAbout: [{ idea: "the fathers fast for two months", take: "I'd last a day" }],
  vividDetails: ["the egg sits on their feet"],
  likelyConfusions: [{ confusion: "that the mothers are with them", articleSays: "the mothers are at sea feeding" }],
  goodMoves: ["put them in charge of the huddle"],
};
{
  const [stable, article] = sigmaSystemBlocks({ articleTitle: "Penguin fathers", articleText: "Body of the article.", level: 1, notes });
  assert.ok(stable.includes("young teacher in your twenties"), "character");
  assert.ok(stable.includes("EXAMPLES OF YOU"), "examples");
  assert.ok(!stable.includes("Body of the article"), "the stable block has no article, so it caches across conversations");
  assert.ok(article.includes("Body of the article."));
  assert.ok(article.includes("7- or 8-year-old"), "level voice");
  assert.ok(article.includes("I'd last a day"), "notes");
  assert.ok(article.includes("the mothers are at sea feeding"));
  // Notes are written from the base (level 4) article; the kid's version may leave a detail out
  const skipRule = "if something in these notes isn't in the article text above, don't bring it up";
  assert.ok(article.includes(skipRule), "notes carry the skip-what-the-kid-can't-see rule");
  assert.ok(article.indexOf("Body of the article.") < article.indexOf(skipRule), "the kid's text comes before the notes the rule points at");
  const noNotes = sigmaSystemBlocks({ articleTitle: "T", articleText: "B", level: 6, notes: null })[1];
  assert.ok(!noNotes.includes(skipRule), "no notes, no rule about them");
  assert.ok(!noNotes.includes("YOUR NOTES"));
  assert.ok(noNotes.includes("14-year-old"));
  assert.equal(levelVoice(99).kid, levelVoice(6).kid);
  assert.equal(levelVoice(0).kid, levelVoice(1).kid);
  assert.ok(formatNotes(notes).startsWith("YOUR NOTES"));
  console.log("✅ sigmaSystemBlocks");
}

// ─── The opener is drawn per conversation, so one article doesn't always open the same way ─
{
  const openers = Array.from({ length: 12 }, (_, i) => sigmaOpener(notes, i / 12));
  const starts = new Set(openers.map(o => o.split("Start from this one")[1]?.split(". The way in")[0]));
  const shapes = new Set(openers.map(o => o.split("The way in this time: ")[1]));
  assert.ok(starts.size >= 2, "different conversations start from different notes");
  assert.equal(shapes.size, OPENER_SHAPES.length, "every shape gets drawn");
  assert.ok(openers.some(o => o.includes("the fathers fast for two months (your take: I'd last a day)")), "ideas come with Sigma's take");
  assert.ok(openers.some(o => o.includes("the egg sits on their feet")), "vivid details are starting points too");
  assert.ok(openers.every(o => o.includes("pick a different one of your notes that is")), "a drawn detail the kid's version leaves out gets swapped for another note, not the first");
  assert.ok(sigmaOpener(null, 0.5).includes("middle or the end of the article"), "without notes, still not the first paragraph");
  assert.ok(!sigmaOpener(null, 0.5).includes("one of your notes"), "without notes there is nothing to swap to");
  assert.ok(sigmaOpener(notes, 0.999).length > 0 && sigmaOpener(notes, 0).length > 0, "edges of the draw are safe");
  console.log("✅ sigmaOpener varies");
}

// ─── Closing instructions never ask for a question ─────────────────────────
{
  assert.ok(sigmaClosing("earned", 1).includes("Don't ask a question"));
  assert.ok(sigmaClosing("forced", 5).includes("out of time"));
  assert.ok(!sigmaClosing("forced", 5).includes("you really got this"), "the forced closing doesn't claim they got it");
  console.log("✅ sigmaClosing");
}

// ─── The observer prompt carries the rules it needs ────────────────────────
{
  const p = observerPrompt({ articleText: "A", level: 3, messages: [{ role: "assistant", content: "Hi" }, { role: "user", content: "idk" }], previous: null, priorProgress: 0 });
  assert.ok(p.includes(`at least ${MIN_EXCHANGES} student messages`));
  assert.ok(p.includes("Kid: idk"));
  assert.ok(MAX_EXCHANGES > MIN_EXCHANGES);
  console.log("✅ observerPrompt");
}

// ─── The design switch ─────────────────────────────────────────────────────
{
  assert.equal(tutorDesignForNewConversation({}), "classic");
  assert.equal(tutorDesignForNewConversation({ TUTOR_DESIGN: "Sigma " }), "sigma");
  assert.equal(tutorDesignForNewConversation({ TUTOR_DESIGN: "on" }), "classic");
  console.log("✅ tutorDesignForNewConversation");
}

// ─── A fake model: what the turn sends and what comes back ─────────────────
type Req = { messages: { role: string; content: string }[]; system: { text: string }[] };
function fakeClient(replies: string[], seen: Req[] = []) {
  return {
    seen,
    messages: {
      create: async (body: unknown) => {
        seen.push(body as Req);
        const text = replies.shift() ?? "";
        return { content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  } as unknown as { seen: Req[]; messages: { create: (b: unknown) => Promise<unknown> } };
}
const blocks = sigmaSystemBlocks({ articleTitle: "T", articleText: "B", level: 3, notes: null });

(async () => {
  // Opener: the instruction goes in as the first user message (the kid hasn't spoken)
  {
    const c = fakeClient(["I keep coming back to the ink. Pick the part you'd try."]);
    const r = await runSigmaTurn({ client: c as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [], level: 3, closing: null, guideNotes: notes, openerPick: 0.2 });
    assert.equal(r.message, "I keep coming back to the ink. Pick the part you'd try.");
    assert.equal(c.seen[0].messages[0].role, "user");
    assert.equal(c.seen[0].messages[0].content, sigmaOpener(notes, 0.2), "the opener note carries the drawn start and shape");
    assert.equal(c.seen[0].system.length, 2);
    assert.equal(r.calls, 1);
    assert.equal(r.fixed, null);
    console.log("✅ opener turn");
  }
  // A steer rides in as a system message on a model that supports them, a bracketed user message otherwise
  {
    const c = fakeClient(["Fish makes sense. Say you're the father on day 40."]);
    await runSigmaTurn({ client: c as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "Opener." }, { role: "user", content: "fish" }], level: 1, closing: null, steer: "they've got the main idea" });
    const last = c.seen[0].messages[c.seen[0].messages.length - 1];
    assert.equal(last.role, "system");
    assert.ok(last.content.includes("they've got the main idea"));
    const c2 = fakeClient(["Reply."]);
    await runSigmaTurn({ client: c2 as never, model: "claude-opus-4-6", systemBlocks: blocks, messages: [{ role: "assistant", content: "Opener." }, { role: "user", content: "fish" }], level: 1, closing: null, steer: "steer" });
    const last2 = c2.seen[0].messages[c2.seen[0].messages.length - 1];
    assert.equal(last2.role, "user");
    assert.ok(last2.content.startsWith("fish\n\n[Note to self: steer]"), "merged into the kid's turn, bracketed");
    console.log("✅ steer delivery");
  }
  // A menu gets one rewrite; a closing that asks a question gets one rewrite, then the fallback
  {
    const c = fakeClient(["Pick one: the ink, the hearts, or the arms, and tell me why.", "Pick the part you'd want for yourself and tell me why."]);
    const r = await runSigmaTurn({ client: c as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "the ink" }], level: 3, closing: null });
    assert.equal(r.fixed, "menu");
    assert.equal(r.calls, 2);
    assert.ok(!r.message.includes("the hearts"));
    const c2 = fakeClient(["Bye for now. What will you read next?", "Still a question?"]);
    const r2 = await runSigmaTurn({ client: c2 as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "ok" }], level: 3, closing: "earned" });
    assert.equal(r2.fixed, "closing_question");
    assert.ok(!r2.message.endsWith("?"));
    console.log("✅ rewrites and fallbacks");
  }
  // A debate move gets one rewrite; a rewrite that still debates is dropped for the original
  {
    const c = fakeClient(["Bugs hold up the floor. Make the case for who really runs the animal kingdom.", "Bugs hold up the floor. Pick the one you'd least want to lose."]);
    const r = await runSigmaTurn({ client: c as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "bugs i guess" }], level: 4, closing: null });
    assert.equal(r.fixed, "debate");
    assert.equal(r.calls, 2);
    assert.ok(!asksForDebate(r.message));
    const c2 = fakeClient(["Convince me the fluffy kind is better.", "Defend that, then."]);
    const r2 = await runSigmaTurn({ client: c2 as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "cracker" }], level: 3, closing: null });
    assert.equal(r2.fixed, "debate");
    assert.equal(r2.message, "Convince me the fluffy kind is better.", "a rewrite that still debates is not taken");
    for (const line of ["I'd take the cracker, honestly. Which one are you grabbing for lunch?", "The waves push back against the wall all night.", "Say you're the penguin. How do you defend the egg?", "Scientists couldn't prove it for years.", "Nobody could prove it.", "How do they defend that nest from gulls?", "The dads argue with each other over the best spot."]) assert.ok(!asksForDebate(line), line);
    for (const line of ["Make the case for the octopus.", "Defend that, then.", "Prove it to me.", "Argue the other side for a second."]) assert.ok(asksForDebate(line), line);
    // An eval of an older character turns the guard off and gets the message as written
    const c3 = fakeClient(["Make the case for who really runs the animal kingdom."]);
    const r3 = await runSigmaTurn({ client: c3 as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "bugs" }], level: 4, closing: null, debateGuard: false });
    assert.equal(r3.fixed, null);
    assert.equal(r3.calls, 1);
    console.log("✅ debate move gets a rewrite");
  }
  // Empty reply → fallback
  {
    const c = fakeClient([""]);
    const r = await runSigmaTurn({ client: c as never, model: "claude-opus-5-5", systemBlocks: blocks, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "ok" }], level: 3, closing: null });
    assert.equal(r.fixed, "empty");
    assert.ok(r.message.length > 0);
    console.log("✅ empty reply fallback");
  }
  // sigmaExchange: the observer's done flag closes one exchange later; the backstop closes on its own
  {
    const observerReply = JSON.stringify({ progressDelta: 25, shown: "got the gist", steer: "", askedQuestion: false, done: true });
    const tutor = fakeClient(["Reply one.", "Goodbye line."]);
    const observer = fakeClient([observerReply, observerReply]);
    const history = [{ role: "assistant", content: "Opener." }, { role: "user", content: "a" }, { role: "assistant", content: "r" }, { role: "user", content: "b" }, { role: "assistant", content: "r" }, { role: "user", content: "c" }, { role: "assistant", content: "r" }, { role: "user", content: "d" }];
    const first = await sigmaExchange({ tutorClient: tutor as never, observerClient: observer as never, articleTitle: "T", articleText: "B", level: 3, messages: history, priorProgress: 50, previousNotes: null, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(first.complete, false, "the turn the observer flags on still replies normally");
    assert.equal(first.progressScore, 75);
    assert.equal(first.notes?.done, true);
    const second = await sigmaExchange({ tutorClient: tutor as never, observerClient: observer as never, articleTitle: "T", articleText: "B", level: 3, messages: [...history, { role: "assistant", content: "Reply one." }, { role: "user", content: "e" }], priorProgress: 75, previousNotes: first.notes, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(second.complete, true);
    assert.equal(second.closing, "earned");
    assert.equal(second.progressDelta, 0, "the closing turn scores nothing");
    assert.equal(observer.seen.length, 1, "no observer call on the closing turn");

    const never = JSON.stringify({ progressDelta: 5, shown: "", steer: "", askedQuestion: false, done: false });
    const tutor2 = fakeClient(["Forced goodbye."]);
    const observer2 = fakeClient([never]);
    const long = Array.from({ length: MAX_EXCHANGES }, (_, i) => [{ role: "assistant", content: "r" }, { role: "user", content: `m${i}` }]).flat();
    const forced = await sigmaExchange({ tutorClient: tutor2 as never, observerClient: observer2 as never, articleTitle: "T", articleText: "B", level: 3, messages: long, priorProgress: 10, previousNotes: null, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(forced.closing, "forced");
    assert.equal(forced.complete, true);
    console.log("✅ sigmaExchange closing rules");
  }
  // An observer failure scores nothing (the previous delta was already counted) but keeps the notes
  {
    const prev = { progressDelta: 30, shown: "knows the gist", steer: "push on the why", askedQuestion: false, done: false };
    const tutor = fakeClient(["Reply."]);
    const failing = { messages: { create: async () => { throw new Error("overloaded"); } } };
    const r = await sigmaExchange({ tutorClient: tutor as never, observerClient: failing as never, articleTitle: "T", articleText: "B", level: 3, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "a" }, { role: "assistant", content: "r" }, { role: "user", content: "b" }], priorProgress: 30, previousNotes: prev, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(r.progressDelta, 0, "nothing is added when the observer fails");
    assert.equal(r.progressScore, 30);
    assert.equal(r.notes?.steer, "push on the why", "the running notes survive for the next turn");
    assert.equal(r.notes?.progressDelta, 0, "and don't carry a delta that could be counted again");
    console.log("✅ observer failure scores nothing");
  }
  // An earned close waits a turn when the kid's latest message is a question
  {
    assert.ok(kidAskedQuestion("why is the blood blue?"));
    assert.ok(kidAskedQuestion("how do they know"));
    assert.ok(kidAskedQuestion("wait do the dads eat"));
    assert.ok(!kidAskedQuestion("idk"));
    assert.ok(!kidAskedQuestion("the ink one, its like a smoke bomb"));
    const doneNotes = { progressDelta: 10, shown: "", steer: "", askedQuestion: false, done: true };
    const later = JSON.stringify({ progressDelta: 5, shown: "", steer: "", askedQuestion: true, done: false });
    const tutor = fakeClient(["Answering the question.", "Goodbye."]);
    const observer = fakeClient([later]);
    const history = [{ role: "assistant", content: "O" }, { role: "user", content: "a" }, { role: "assistant", content: "r" }, { role: "user", content: "b" }, { role: "assistant", content: "r" }, { role: "user", content: "c" }, { role: "assistant", content: "r" }, { role: "user", content: "d" }, { role: "assistant", content: "r" }, { role: "user", content: "wait, what did the dads eat?" }];
    const r = await sigmaExchange({ tutorClient: tutor as never, observerClient: observer as never, articleTitle: "T", articleText: "B", level: 3, messages: history, priorProgress: 90, previousNotes: doneNotes, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(r.complete, false, "no goodbye on a question");
    assert.equal(r.closing, null);
    assert.equal(r.notes?.done, true, "the close is only put off, not forgotten");
    assert.equal(r.progressDelta, 5, "the deferred turn is still scored");
    const next = await sigmaExchange({ tutorClient: tutor as never, observerClient: observer as never, articleTitle: "T", articleText: "B", level: 3, messages: [...history, { role: "assistant", content: "Answering the question." }, { role: "user", content: "oh ok" }], priorProgress: 95, previousNotes: r.notes, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(next.closing, "earned");
    assert.equal(next.complete, true);
    console.log("✅ earned close waits for the kid's question");
  }
  // The observer's done flag is ignored before MIN_EXCHANGES, and when the kid asked a question
  {
    const early = JSON.stringify({ progressDelta: 40, shown: "", steer: "", askedQuestion: false, done: true });
    const tutor = fakeClient(["Reply."]);
    const observer = fakeClient([early]);
    const r = await sigmaExchange({ tutorClient: tutor as never, observerClient: observer as never, articleTitle: "T", articleText: "B", level: 3, messages: [{ role: "assistant", content: "O" }, { role: "user", content: "a" }], priorProgress: 0, previousNotes: null, tutorModel: "claude-opus-5-5", tutorSettings: {}, observerModel: "claude-sonnet-5-5", observerSettings: {} });
    assert.equal(r.notes?.done, false, "one exchange is too early to be done");
    console.log("✅ observer done guard");
  }
})().catch(e => { console.error(e); process.exit(1); });

// Notes from an older prompt are left out until the catch-up cron rewrites them
{
  assert.equal(isCurrentGuideNotes(notes), false, "notes without a version are from before 8 Nov 2026");
  assert.equal(isCurrentGuideNotes({ ...notes, version: NOTES_VERSION }), true);
  assert.equal(isCurrentGuideNotes({ ...notes, version: NOTES_VERSION - 1 }), false);
  assert.equal(isCurrentGuideNotes(null), false);
  console.log("✅ old prep notes are treated as missing");
}
