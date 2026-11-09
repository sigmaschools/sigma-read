export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = session.role === "student"
    ? session.userId
    : parseInt(req.nextUrl.searchParams.get("studentId") || "0");

  if (!studentId) return NextResponse.json({ error: "Student ID required" }, { status: 400 });

  const articleList = await db.select().from(schema.articles)
    .where(eq(schema.articles.studentId, studentId))
    // Newest first: the stories served this morning top the feed
    .orderBy(desc(schema.articles.createdAt), desc(schema.articles.id));

  return NextResponse.json(articleList);
}
