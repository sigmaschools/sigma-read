export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tab = req.nextUrl.searchParams.get("tab") || "queue";
  const numId = parseInt(id);

  if (tab === "library") {
    const [article] = await db.select({
      title: schema.articles.title,
      topic: schema.articles.topic,
      readingLevel: schema.articles.readingLevel,
      bodyText: schema.articles.bodyText,
      sources: schema.articles.sources,
    }).from(schema.articles).where(eq(schema.articles.id, numId)).limit(1);
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(article);
  }

  // Default: queue (articleCache)
  const [article] = await db.select({
    title: schema.articleCache.title,
    topic: schema.articleCache.topic,
    readingLevel: schema.articleCache.readingLevel,
    bodyText: schema.articleCache.bodyText,
    sources: schema.articleCache.sources,
  }).from(schema.articleCache).where(eq(schema.articleCache.id, numId)).limit(1);
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(article);
}
