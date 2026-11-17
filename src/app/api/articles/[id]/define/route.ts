export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { wordDefinitionPrompt } from "@/lib/prompts";
import { MODELS, requestSettings } from "@/lib/models";
import { recordLookup } from "@/lib/word-lookups";

const anthropic = new Anthropic();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { word, sentence } = await req.json();
  if (!word) return NextResponse.json({ error: "Word required" }, { status: 400 });

  // Saved for word recycling and the engagement baseline; never shown to the student
  const saved = session.role === "student"
    ? recordLookup(session.userId, parseInt((await params).id), word, sentence)
    : Promise.resolve();

  const response = await tracked(anthropic, "definition", session.role === "student" ? session.userId : undefined).messages.create({
    model: MODELS.standard, ...requestSettings(MODELS.standard, "standard"),
    max_tokens: 256,
    messages: [{ role: "user", content: wordDefinitionPrompt(word, sentence || "") }],
  });

  const definition = response.content[0].type === "text" ? response.content[0].text : "";
  await saved;
  return NextResponse.json({ word, definition });
}
