export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { preReadingPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, parseInt(id))).limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate pre-reading prompt if not cached
  if (!article.preReadingPrompt) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 100,
        messages: [{ role: "user", content: preReadingPrompt(article.title, article.topic, article.readingLevel) }],
      });
      const prompt = response.content[0].type === "text" ? response.content[0].text.trim() : null;
      if (prompt) {
        await db.update(schema.articles).set({ preReadingPrompt: prompt }).where(eq(schema.articles.id, article.id));
        article.preReadingPrompt = prompt;
      }
    } catch (e) {
      // Non-blocking — article still serves without it
    }
  }

  return NextResponse.json(article);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const [updated] = await db.update(schema.articles).set(body).where(eq(schema.articles.id, parseInt(id))).returning();
  return NextResponse.json(updated);
}
