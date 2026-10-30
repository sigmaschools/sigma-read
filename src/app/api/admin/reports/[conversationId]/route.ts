export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

/** One conversation's transcript and its report (if any), for the admin review queue. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = parseInt((await params).conversationId);
  if (!conversationId) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const [conversation] = await db.select({
    messages: schema.conversations.messages,
    progressScore: schema.conversations.progressScore,
    style: schema.conversations.conversationStyle,
  }).from(schema.conversations).where(eq(schema.conversations.id, conversationId)).limit(1);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [report] = await db.select().from(schema.comprehensionReports)
    .where(eq(schema.comprehensionReports.conversationId, conversationId))
    // Same rule as the list: the latest report is the one with the highest id
    .orderBy(desc(schema.comprehensionReports.id))
    .limit(1);

  return NextResponse.json({ conversation, report: report ?? null });
}
