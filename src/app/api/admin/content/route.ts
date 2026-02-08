export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const level = req.nextUrl.searchParams.get("level");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  let query = db.select({
    id: schema.articleCache.id,
    title: schema.articleCache.title,
    topic: schema.articleCache.topic,
    readingLevel: schema.articleCache.readingLevel,
    category: schema.articleCache.category,
    estimatedReadTime: schema.articleCache.estimatedReadTime,
    generatedDate: schema.articleCache.generatedDate,
    headlineSource: schema.articleCache.headlineSource,
    baseArticleId: schema.articleCache.baseArticleId,
    createdAt: schema.articleCache.createdAt,
  }).from(schema.articleCache)
    .orderBy(desc(schema.articleCache.createdAt))
    .limit(limit)
    .$dynamic();

  if (level) {
    query = query.where(eq(schema.articleCache.readingLevel, parseInt(level)));
  }

  const articles = await query;

  // Distribution stats
  const all = await db.select({
    level: schema.articleCache.readingLevel,
    category: schema.articleCache.category,
  }).from(schema.articleCache);

  const byLevel: Record<number, number> = {};
  const byCategory: Record<string, number> = {};
  all.forEach(a => {
    if (a.level) byLevel[a.level] = (byLevel[a.level] || 0) + 1;
    if (a.category) byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  });

  return NextResponse.json({ articles, distribution: { byLevel, byCategory }, total: all.length });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(schema.articleCache).where(eq(schema.articleCache.id, id));
  return NextResponse.json({ ok: true });
}
