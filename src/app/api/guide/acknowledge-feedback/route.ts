export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "guide" && session.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { feedbackId } = await req.json();
  if (!feedbackId) return NextResponse.json({ error: "Missing feedbackId" }, { status: 400 });

  await db.update(schema.parentFeedback)
    .set({ acknowledgedAt: new Date() })
    .where(eq(schema.parentFeedback.id, feedbackId));

  return NextResponse.json({ ok: true });
}
