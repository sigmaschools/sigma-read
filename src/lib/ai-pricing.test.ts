import assert from "node:assert/strict";
import { costUsd, PRICES } from "./ai-pricing";

const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);

near(costUsd("claude-opus-4-6", { input_tokens: 1_000_000, output_tokens: 0 }), 5);
near(costUsd("claude-opus-4-6", { input_tokens: 0, output_tokens: 1_000_000 }), 25);
near(costUsd("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 1000 }), 0.006);
near(costUsd("claude-sonnet-4-6", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }), 0.3 + 3.75);
assert.equal(costUsd("some-other-model", { input_tokens: 10, output_tokens: 10 }), null);
// Every listed model, checked against the published per-MTok rates
const PUBLISHED: Record<string, [number, number, number]> = {
  "claude-opus-4-6": [5, 25, 0.5],
  "claude-sonnet-4-6": [3, 15, 0.3],
  "claude-sonnet-4-5": [3, 15, 0.3],
  "claude-haiku-4-5": [1, 5, 0.1],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-sonnet-5-5": [2, 10, 0.2],
};
assert.deepEqual(Object.keys(PRICES).sort(), Object.keys(PUBLISHED).sort());
for (const [model, [input, output, cacheRead]] of Object.entries(PUBLISHED)) {
  near(costUsd(model, { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }), input + output + cacheRead);
}
console.log("✅ costUsd prices tokens by model");

near(costUsd("claude-haiku-4-5", { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 3 } }), 0.03);
console.log("✅ web searches are billed per search");
