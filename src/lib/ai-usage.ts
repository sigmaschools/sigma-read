/**
 * Records token usage for every Claude call the app makes, for the admin cost view.
 * Wrap a client per call site: tracked(anthropic, "report", studentId).messages.create(...)
 * The eval and other scripts use a plain client, so nothing they do is recorded.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "./db";
import { costUsd } from "./ai-pricing";

export type AiFeature =
  | "tutor_turn" | "report" | "coaching" | "onboarding" | "definition" | "pre_reading"
  | "feed_event" | "article_generate" | "parent_chat" | "interest_resolve" | "chat_mentions"
  | "batch_adjacent" | "batch_search" | "batch_filter" | "batch_rewrite" | "batch_adapt";

type CreateResult = { model?: string; usage?: Anthropic.Usage };

async function record(feature: AiFeature, studentId: number | undefined, requestedModel: string, res: CreateResult) {
  if (!res?.usage) return;
  const model = res.model || requestedModel;
  const cost = costUsd(model, res.usage);
  try {
    await db.insert(schema.aiUsage).values({
      feature,
      model,
      studentId: studentId ?? null,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      costUsd: cost === null ? null : cost.toFixed(6),
    });
  } catch (e) {
    // Usage tracking must never break the call it measures
    console.error("ai_usage write failed:", feature, e);
  }
}

/**
 * Only messages.create is wrapped, so the type exposes only that: using .stream(), .parse()
 * or .withResponse() on a tracked client is a compile error rather than a runtime one.
 */
export type MessagesClient = { messages: Pick<Anthropic["messages"], "create"> };

/** A client whose messages.create records usage under `feature`. Non-streaming calls only. */
export function tracked(client: Anthropic, feature: AiFeature, studentId?: number): MessagesClient {
  return {
    messages: {
      create: async (body: { model: string }, options?: unknown) => {
        const res = await (client.messages.create as (b: unknown, o?: unknown) => Promise<CreateResult>)(body, options);
        await record(feature, studentId, body.model, res);
        return res;
      },
    },
  } as unknown as MessagesClient;
}
