import assert from "node:assert/strict";
import { checkTranscript, type Msg } from "./checks";

const rules = (msgs: Msg[], level = 3, closing: number | null = null) =>
  checkTranscript(msgs, level, closing).map(v => v.rule);

// ─── Clean conversation has no violations ──────────────────────────────────
{
  const msgs: Msg[] = [
    { role: "assistant", content: "The bees dance on a wall in the dark. Tell me how the other bees know where to go." },
    { role: "user", content: "they feel the dance and follow the line" },
    { role: "assistant", content: "Yeah, the line points the way. Walk me through what a longer waggle means." },
    { role: "user", content: "the flowers are farther" },
    { role: "assistant", content: "You figured out that the dance is a map with both direction and distance." },
  ];
  assert.deepStrictEqual(rules(msgs, 3, 4), []);
  console.log("✅ clean transcript passes");
}

// ─── Each rule fires ───────────────────────────────────────────────────────
{
  assert.ok(rules([{ role: "assistant", content: "Great job! Tell me more." }]).includes("empty_praise"));
  assert.ok(rules([{ role: "assistant", content: "What happened? Why did it matter?" }]).includes("stacked_questions"));
  assert.ok(rules([{ role: "assistant", content: "Actually, the article says ten. Tell me why." }]).includes("actually_correction"));
  assert.ok(rules([{ role: "assistant", content: "The sooner we finish, the sooner you're done. Tell me one fact." }]).includes("chore_framing"));
  assert.ok(rules([{ role: "assistant", content: "That was the main idea." }]).includes("no_directive"));
  assert.ok(rules([{ role: "assistant", content: "Want to talk more?" }], 3, 0).includes("closing_question"));
  assert.ok(rules([{ role: "assistant", content: "Octopuses have three hearts and blue blood, which is really surprising to me. Tell me which fact you liked best." }], 1).includes("too_long"));
  console.log("✅ each rule fires on a violating message");
}

// ─── "actually" mid-sentence in a non-correction is allowed ────────────────
{
  assert.ok(!rules([{ role: "assistant", content: "That's a real idea scientists actually test. Tell me why it might work." }]).includes("actually_correction"));
  console.log("✅ non-correction 'actually' is allowed");
}
