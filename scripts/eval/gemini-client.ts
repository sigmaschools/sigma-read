/**
 * A minimal stand-in for the Anthropic client's messages.create that calls Google's Gemini API
 * instead, so the eval scripts can run a Gemini model through Sigma Read's own tutor code
 * (src/lib/conversation-turn.ts) unchanged. Eval only: the app itself calls Anthropic models.
 *
 * Translates: system prompt → systemInstruction; user/assistant turns → user/model contents
 * (consecutive same-role turns merged); max_tokens → maxOutputTokens (plus room for thinking,
 * which Gemini counts as output); output_config.format json_schema → responseJsonSchema.
 * Returns an Anthropic-shaped message with one text block, a stop_reason and usage, where
 * input_tokens excludes cached tokens and output_tokens includes thinking tokens.
 *
 * Needs GEMINI_API_KEY.
 */

type Role = "user" | "assistant";
type TextBlock = { type: "text"; text: string };
type Body = {
  max_tokens?: number;
  system?: string | TextBlock[];
  messages: { role: Role; content: string | TextBlock[] }[];
  output_config?: { format?: { type: string; schema?: object } };
};

export type GeminiThinking = "low" | "medium" | "high";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini's thinking tokens count toward maxOutputTokens, so leave this much on top of the reply budget */
const THINKING_ROOM = 8000;

const text = (c: string | TextBlock[]) => typeof c === "string" ? c : c.filter(b => b.type === "text").map(b => b.text).join("\n");

export async function geminiCreate(model: string, thinking: GeminiThinking, body: Body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of body.messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push({ text: text(m.content) });
    else contents.push({ role, parts: [{ text: text(m.content) }] });
  }
  const schema = body.output_config?.format?.type === "json_schema" ? body.output_config.format.schema : undefined;
  const request = {
    ...(body.system ? { systemInstruction: { parts: [{ text: text(body.system) }] } } : {}),
    contents,
    generationConfig: {
      maxOutputTokens: (body.max_tokens ?? 1024) + THINKING_ROOM,
      thinkingConfig: { thinkingLevel: thinking },
      ...(schema ? { responseMimeType: "application/json", responseJsonSchema: schema } : {}),
    },
  };

  // Retry rate limits and server errors, as the Anthropic SDK does
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
    };
    const c = data.candidates?.[0];
    const reply = (c?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? "").join("");
    const u = data.usageMetadata ?? {};
    const cached = u.cachedContentTokenCount ?? 0;
    return {
      content: [{ type: "text" as const, text: reply }],
      stop_reason: c?.finishReason === "MAX_TOKENS" ? "max_tokens" : c?.finishReason === "SAFETY" ? "refusal" : "end_turn",
      usage: {
        input_tokens: (u.promptTokenCount ?? 0) - cached,
        output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: 0,
      },
    };
  }
}
