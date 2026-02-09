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

  // Filter inappropriate interest suggestions before saving
  if (eventType === "interest_suggestion" && metadata?.topic) {
    const topic = metadata.topic.toLowerCase();
    // Allowlist: legitimate topics that contain blocked substrings
    const allowed = /star wars|civil war|world war|cold war|drug discovery|drugstore|nuclear energy|nuclear power|nuclear physics|warfare history|revolutionary war/i;
    if (!allowed.test(topic)) {
      const blocked = /\b(war(?:fare)?|weapons?|murder|kill(?:ing)?|guns?|bomb(?:ing|s)?|nuclear\s*(?:war|bomb|weapon)|abort(?:ion)?|drugs?(?!\s*(?:store|discovery))|suicid|sex(?:ual)?|porn|alcohol|tobacco|self.?harm|terroris|mass\s*shoot|school\s*shoot|genocide|rape)\b/i;
      if (blocked.test(topic)) {
        return NextResponse.json({ ok: true }); // Silently ignore
      }
    }
  }

  await db.insert(schema.articleFeedEvents).values({
    studentId: session.userId,
    eventType,
    metadata: metadata || {},
  });

  return NextResponse.json({ ok: true });
}
