export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

// Save a student's favorite article for the day
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { articleId } = await req.json();
  if (!articleId) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  const [article] = await db.select({ id: schema.articles.id })
    .from(schema.articles)
    .where(and(eq(schema.articles.id, articleId), eq(schema.articles.studentId, session.userId)))
    .limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.insert(schema.articleFavorites).values({
    studentId: session.userId,
    articleId,
  });

  return NextResponse.json({ ok: true });
}
