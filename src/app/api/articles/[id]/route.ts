export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { MODELS } from "@/lib/models";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { preReadingPrompt } from "@/lib/prompts";

const anthropic = new Anthropic();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [article] = await db.select().from(schema.articles)
    .where(and(eq(schema.articles.id, parseInt(id)), eq(schema.articles.studentId, session.userId)))
    .limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate pre-reading prompt if not cached
  if (!article.preReadingPrompt) {
    try {
      const response = await tracked(anthropic, "pre_reading", session.userId).messages.create({
        model: MODELS.light,
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
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Students may only record like/dislike feedback on their own articles
  if (typeof body?.liked !== "boolean") return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const [updated] = await db.update(schema.articles)
    .set({ liked: body.liked })
    .where(and(eq(schema.articles.id, parseInt(id)), eq(schema.articles.studentId, session.userId)))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
