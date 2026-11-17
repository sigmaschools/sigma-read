export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { starterPending } from "@/lib/starter-plan";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (session.role === "admin") {
    // The name is the one in Compass's note, kept in the session; there is no admin list to look it up in
    return NextResponse.json({ role: "admin", userId: session.userId, name: session.name ?? "Admin" });
  }

  // Guides and parents have no pages here: they follow a student's reading in Compass
  if (session.role !== "student") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    role: "student",
    userId: student.id,
    name: student.name,
    onboardingComplete: student.onboardingComplete,
    readingLevel: student.readingLevel,
    interestProfile: student.interestProfile,
    // True while the first articles are still being found or written (not once the job has gone stale)
    starterArticlesPending: starterPending(student.starterArticlesStatus, student.starterArticlesStartedAt),
  });
}
