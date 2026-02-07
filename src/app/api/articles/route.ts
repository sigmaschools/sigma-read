import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = session.role === "student"
    ? session.userId
    : parseInt(req.nextUrl.searchParams.get("studentId") || "0");

  if (!studentId) return NextResponse.json({ error: "Student ID required" }, { status: 400 });

  const articleList = await db.select().from(schema.articles)
    .where(eq(schema.articles.studentId, studentId))
    .orderBy(schema.articles.createdAt);

  return NextResponse.json(articleList);
}
