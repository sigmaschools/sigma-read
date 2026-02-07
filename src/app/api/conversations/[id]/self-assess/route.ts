export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversationId = parseInt(id);
  const { assessment } = await req.json();

  const valid = ["really_well", "pretty_well", "not_sure", "lost"];
  if (!valid.includes(assessment)) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  // Find the comprehension report for this conversation
  const [report] = await db.select().from(schema.comprehensionReports)
    .where(eq(schema.comprehensionReports.conversationId, conversationId)).limit(1);

  if (!report) return NextResponse.json({ error: "No report found" }, { status: 404 });

  await db.update(schema.comprehensionReports)
    .set({ selfAssessment: assessment })
    .where(eq(schema.comprehensionReports.id, report.id));

  return NextResponse.json({ ok: true });
}
