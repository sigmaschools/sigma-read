import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { wordDefinitionPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { word, sentence } = await req.json();
  if (!word) return NextResponse.json({ error: "Word required" }, { status: 400 });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: wordDefinitionPrompt(word, sentence || "") }],
  });

  const definition = response.content[0].type === "text" ? response.content[0].text : "";
  return NextResponse.json({ word, definition });
}
