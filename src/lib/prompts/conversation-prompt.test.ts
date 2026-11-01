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
      const p: string = comprehensionConversationPrompt("Article body.", level, "{}", [{ title: "T", topic: "x" }], true, style, 2);
      assert.ok(!p.includes("{{"), `unfilled placeholder at level ${level}, style ${style}`);
      const name = p.match(/THIS CONVERSATION'S SHAPE: (\w+)/)?.[1];
      assert.ok(name && CONVERSATION_STYLES.includes(name), `no valid style at level ${level}, style ${style}`);
      if (style && CONVERSATION_STYLES.includes(style)) assert.equal(name, style);
    }
  }
  console.log("✅ tutor prompt assembles for every level and style");
  const { pickConversationStyle } = require("./index");
  for (let i = 0; i < 200; i++) assert.notEqual(pickConversationStyle("CREATIVE"), "CREATIVE");
  console.log("✅ a new style never repeats the previous one");
}

main().catch(e => { console.error(e); process.exit(1); });
