/**
 * The student page's side of a tutor turn. The chat route answers with JSON, or, for the
 * redesigned tutor, with server-sent events that carry the reply as it is written followed by
 * one "done" event with everything the JSON would have held. Either way the caller gets the same
 * object; streamed text arrives through onDelta first.
 */

export interface TurnData {
  message?: string;
  complete?: boolean;
  progressScore?: number;
  coachingFeedback?: string | null;
  compassReport?: object | null;
  existingMessages?: { role: string; content: string; type?: string }[];
  error?: string;
}

export async function chatTurn(conversationId: string, message: string, onDelta?: (text: string) => void): Promise<TurnData> {
  const res = await fetch(`/api/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.headers.get("content-type")?.includes("text/event-stream") || !res.body) return res.json();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: TurnData | null = null;
  for (;;) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk.split("\n").find(l => l.startsWith("data: "))?.slice(6);
      if (!data) continue;
      const event = JSON.parse(data) as { type: string; text?: string; error?: string } & TurnData;
      if (event.type === "delta" && event.text) onDelta?.(event.text);
      else if (event.type === "done") done = event;
      else if (event.type === "error") throw new Error(event.error || "The tutor didn't answer");
    }
  }
  if (!done) throw new Error("The reply was cut off");
  return done;
}
