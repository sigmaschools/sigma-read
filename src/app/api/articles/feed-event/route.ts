export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { normalizeInterestProfile } from "@/lib/normalize-interests";

const MAX_PRIMARY_INTERESTS = 10;

// Track article feed events (show_me_different clicks, etc.)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventType, metadata } = await req.json();
  
  if (!eventType) return NextResponse.json({ error: "eventType required" }, { status: 400 });

  // Filter inappropriate interest suggestions before saving
  if (eventType === "interest_suggestion" && metadata?.text) {
    const topic = metadata.text.toLowerCase();
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

  // When a student suggests an interest, fold it into their profile
  if (eventType === "interest_suggestion" && metadata?.text) {
    const suggestion = metadata.text.trim();
    if (suggestion) {
      const [student] = await db.select({ interestProfile: schema.students.interestProfile })
        .from(schema.students)
        .where(eq(schema.students.id, session.userId))
        .limit(1);

      if (student) {
        const profile = normalizeInterestProfile(student.interestProfile);
        const lowerExisting = profile.primary_interests.map(i => i.toLowerCase());

        // Only add if not already present (case-insensitive)
        if (!lowerExisting.includes(suggestion.toLowerCase())) {
          profile.primary_interests.push(suggestion);

          // Cap at MAX_PRIMARY_INTERESTS — drop oldest (first) entries to make room
          if (profile.primary_interests.length > MAX_PRIMARY_INTERESTS) {
            profile.primary_interests = profile.primary_interests.slice(-MAX_PRIMARY_INTERESTS);
          }

          await db.update(schema.students)
            .set({ interestProfile: profile })
            .where(eq(schema.students.id, session.userId));
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
