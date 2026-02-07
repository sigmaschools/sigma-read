export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and, sql } from "drizzle-orm";

// Serve pre-cached news articles to a student based on their reading level
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = student.readingLevel || 2;

  // Check if student already has articles
  const existing = await db.select({ id: schema.articles.id })
    .from(schema.articles).where(eq(schema.articles.studentId, student.id)).limit(1);
  if (existing.length > 0) return NextResponse.json({ message: "Already has articles", count: 0 });

  // Get 2 news + 1 general, or whatever's available
  const newsArticles = await db.select().from(schema.articleCache)
    .where(and(eq(schema.articleCache.readingLevel, level), eq(schema.articleCache.category, "news")))
    .orderBy(sql`RANDOM()`)
    .limit(2);

  const generalArticles = await db.select().from(schema.articleCache)
    .where(and(eq(schema.articleCache.readingLevel, level), eq(schema.articleCache.category, "general")))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  const cached = [...newsArticles, ...generalArticles];

  if (cached.length === 0) return NextResponse.json({ message: "No cached articles available", count: 0 });

  // Copy cached articles to the student's feed
  const inserted = [];
  for (const c of cached) {
    const [article] = await db.insert(schema.articles).values({
      studentId: student.id,
      title: c.title,
      topic: c.topic,
      bodyText: c.bodyText,
      readingLevel: level,
      sources: c.sources || [],
      estimatedReadTime: c.estimatedReadTime || 4,
      category: c.category || "general",
    }).returning();
    inserted.push(article);
  }

  return NextResponse.json({ message: "Served cached articles", count: inserted.length, articles: inserted });
}
