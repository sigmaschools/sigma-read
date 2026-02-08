export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Save article quality rating (every 20th session)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rating, feedbackText } = await req.json();
  if (!rating) return NextResponse.json({ error: "rating required" }, { status: 400 });

  await db.insert(schema.articleRatings).values({
    studentId: session.userId,
    rating,
    feedbackText: feedbackText || null,
  });

  return NextResponse.json({ ok: true });
}
