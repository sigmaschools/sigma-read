export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, sql, count, desc } from "drizzle-orm";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const tab = params.get("tab") || "queue";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const category = params.get("category") || "all";
  const offset = (page - 1) * PAGE_SIZE;

  if (tab === "queue") {
    return handleQueue({ page, category, offset, params });
  } else {
    return handleLibrary({ page, category, offset, params });
  }
}

async function handleQueue({ page, category, offset, params }: { page: number; category: string; offset: number; params: URLSearchParams }) {
  const flagged = params.get("flagged") || "all";
  const level = params.get("level") || "all";

  // Step 1: Query base articles only (baseArticleId IS NULL)
  const conditions = [sql`${schema.articleCache.baseArticleId} IS NULL`];
  if (category !== "all") conditions.push(sql`${schema.articleCache.category} = ${category}`);
  if (flagged === "active") conditions.push(sql`${schema.articleCache.flagged} = false`);
  else if (flagged === "blocked") conditions.push(sql`${schema.articleCache.flagged} = true`);
  if (level !== "all") {
    conditions.push(sql`(
      ${schema.articleCache.readingLevel} = ${parseInt(level)}
      OR EXISTS (
        SELECT 1 FROM article_cache v
        WHERE v.base_article_id = ${schema.articleCache.id}
        AND v.reading_level = ${parseInt(level)}
      )
    )`);
  }

  const where = sql.join(conditions, sql` AND `);

  const [{ total }] = await db.select({ total: count() }).from(schema.articleCache).where(where);
  const totalNum = Number(total);

  const rows = await db.select({
    id: schema.articleCache.id,
    title: schema.articleCache.title,
    topic: schema.articleCache.topic,
    category: schema.articleCache.category,
    readingLevel: schema.articleCache.readingLevel,
    generatedDate: schema.articleCache.generatedDate,
    sourceUrl: schema.articleCache.sourceUrl,
    flagged: schema.articleCache.flagged,
    createdAt: schema.articleCache.createdAt,
  }).from(schema.articleCache)
    .where(where)
    .orderBy(desc(schema.articleCache.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Step 2: Get all adaptations for this page of base articles
  const baseIds = rows.map(r => r.id);
  let adaptations: { id: number; baseArticleId: number | null; readingLevel: number }[] = [];
  if (baseIds.length > 0) {
    adaptations = await db.select({
      id: schema.articleCache.id,
      baseArticleId: schema.articleCache.baseArticleId,
      readingLevel: schema.articleCache.readingLevel,
    }).from(schema.articleCache)
      .where(sql`${schema.articleCache.baseArticleId} = ANY(ARRAY[${sql.join(baseIds.map(id => sql`${id}`), sql`, `)}]::int[])`);
  }

  // Step 3: Merge into grouped rows
  const grouped = rows.map(base => {
    const variants = adaptations.filter(a => a.baseArticleId === base.id);
    const levels = [
      { id: base.id, level: base.readingLevel },
      ...variants.map(v => ({ id: v.id, level: v.readingLevel }))
    ].sort((a, b) => a.level - b.level);
    return { ...base, levels };
  });

  return NextResponse.json({
    rows: grouped,
    total: totalNum,
    page,
    pageCount: Math.ceil(totalNum / PAGE_SIZE),
  });
}

async function handleLibrary({ page, category, offset, params }: { page: number; category: string; offset: number; params: URLSearchParams }) {
  const read = params.get("read") || "all";
  const studentId = params.get("student") || "all";

  const conditions = [];
  if (category !== "all") conditions.push(sql`${schema.articles.category} = ${category}`);
  if (read === "true") conditions.push(sql`${schema.articles.read} = true`);
  else if (read === "false") conditions.push(sql`${schema.articles.read} = false`);
  if (studentId !== "all") conditions.push(sql`${schema.articles.studentId} = ${parseInt(studentId)}`);

  const where = conditions.length > 0 ? sql.join(conditions, sql` AND `) : sql`true`;

  const [{ total }] = await db.select({ total: count() }).from(schema.articles).where(where);
  const totalNum = Number(total);

  const rows = await db.select({
    id: schema.articles.id,
    title: schema.articles.title,
    topic: schema.articles.topic,
    category: schema.articles.category,
    readingLevel: schema.articles.readingLevel,
    read: schema.articles.read,
    liked: schema.articles.liked,
    studentId: schema.articles.studentId,
    studentName: schema.students.name,
    createdAt: schema.articles.createdAt,
  }).from(schema.articles)
    .leftJoin(schema.students, eq(schema.articles.studentId, schema.students.id))
    .where(where)
    .orderBy(desc(schema.articles.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const result: Record<string, unknown> = {
    rows,
    total: totalNum,
    page,
    pageCount: Math.ceil(totalNum / PAGE_SIZE),
  };

  // Include student list on page 1 for filter dropdown
  if (page === 1) {
    const students = await db.select({
      id: schema.students.id,
      name: schema.students.name,
    }).from(schema.students).orderBy(schema.students.name);
    result.students = students;
  }

  return NextResponse.json(result);
}
