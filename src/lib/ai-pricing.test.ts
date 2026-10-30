import assert from "node:assert/strict";
import { costUsd } from "./ai-pricing";

const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} != ${b}`);

near(costUsd("claude-opus-4-6", { input_tokens: 1_000_000, output_tokens: 0 }), 5);
near(costUsd("claude-opus-4-6", { input_tokens: 0, output_tokens: 1_000_000 }), 25);
near(costUsd("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 1000 }), 0.006);
near(costUsd("claude-sonnet-4-6", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }), 0.3 + 3.75);
assert.equal(costUsd("some-other-model", { input_tokens: 10, output_tokens: 10 }), null);
console.log("✅ costUsd prices tokens by model");
