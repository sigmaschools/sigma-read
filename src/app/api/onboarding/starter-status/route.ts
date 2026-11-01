export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { feedArticleCount } from "@/lib/starter-articles";
import { starterProgress } from "@/lib/starter-plan";

/** How many of a new student's first articles are ready; polled by the onboarding tutorial */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [student] = await db.select({ status: schema.students.starterArticlesStatus })
    .from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(starterProgress(student.status, await feedArticleCount(session.userId)));
}
