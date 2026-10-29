export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getStudentConversation } from "@/lib/ownership";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = parseInt(id);

  const owned = await getStudentConversation(conversationId, session.userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { readingSession } = owned;

  const [article] = await db.select().from(schema.articles).where(eq(schema.articles.id, readingSession.articleId)).limit(1);

  return NextResponse.json({
    title: article.title,
    topic: article.topic,
    bodyText: article.bodyText,
  });
}
