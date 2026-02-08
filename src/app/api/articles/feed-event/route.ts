export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Track article feed events (show_me_different clicks, etc.)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventType, metadata } = await req.json();
  
  if (!eventType) return NextResponse.json({ error: "eventType required" }, { status: 400 });

  await db.insert(schema.articleFeedEvents).values({
    studentId: session.userId,
    eventType,
    metadata: metadata || {},
  });

  return NextResponse.json({ ok: true });
}
