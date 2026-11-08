// Every level and style assembles a full tutor prompt with no unfilled {{placeholders}}.
// Run with: npx tsx src/lib/prompts/conversation-prompt.test.ts
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../../../scripts/md-require.cjs");

async function main() {
  const { comprehensionConversationPrompt, CONVERSATION_STYLES } = require("./index");
  for (const level of [1, 2, 3, 4, 5, 6]) {
    for (const style of [...CONVERSATION_STYLES, undefined, "constructor"]) {
      const p: string = comprehensionConversationPrompt("Article body.", level, "{}", true, style, 2);
      assert.ok(!p.includes("{{"), `unfilled placeholder at level ${level}, style ${style}`);
      assert.ok(!/previous articles/i.test(p), "tutor prompt must not list previous articles");
      const name = p.match(/THIS CONVERSATION'S SHAPE: (\w+)/)?.[1];
      assert.ok(name && CONVERSATION_STYLES.includes(name), `no valid style at level ${level}, style ${style}`);
      if (style && CONVERSATION_STYLES.includes(style)) assert.equal(name, style);
    }
  }
  console.log("✅ tutor prompt assembles for every level and style");
  const { pickConversationStyle } = require("./index");
  for (let i = 0; i < 200; i++) assert.notEqual(pickConversationStyle("CREATIVE"), "CREATIVE");
  console.log("✅ a new style never repeats the previous one");

  // The spring 2026 tutor: every level fills, and neither interests nor past articles appear
  const { springConversationPrompt } = require("./index");
  for (const level of [1, 2, 3, 4, 5, 6]) {
    for (const liked of [true, false, null]) {
      const p: string = springConversationPrompt("Article body.", level, liked);
      assert.ok(!p.includes("{{"), `unfilled placeholder in the spring prompt at level ${level}`);
      assert.ok(!/interests|previous articles/i.test(p), "spring prompt must not carry interests or past articles");
    }
  }
  console.log("✅ spring prompt fills at every level");
}

main().catch(e => { console.error(e); process.exit(1); });
