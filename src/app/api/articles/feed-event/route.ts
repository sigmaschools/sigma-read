export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { normalizeInterestProfile } from "@/lib/normalize-interests";
import Anthropic from "@anthropic-ai/sdk";

const MAX_INTERESTS = 10;

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

  // When a student suggests an interest, normalize to a short tag and fold into their profile
  if (eventType === "interest_suggestion" && metadata?.text) {
    let suggestion = metadata.text.trim();
    if (suggestion) {
      // Normalize long/conversational interest text to a short tag (2-4 words)
      if (suggestion.split(/\s+/).length > 4) {
        try {
          const anthropic = new Anthropic();
          const resp = await anthropic.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 30,
            messages: [{ role: "user", content: `Convert this student interest into a short topic tag (2-4 words, lowercase). Output ONLY the tag, nothing else.\n\nInput: "${suggestion}"\nTag:` }],
          });
          const tag = resp.content[0].type === "text" ? resp.content[0].text.trim().toLowerCase() : "";
          if (tag && tag.split(/\s+/).length <= 5) {
            suggestion = tag;
          }
        } catch {
          // If normalization fails, use as-is but truncate
          suggestion = suggestion.split(/\s+/).slice(0, 4).join(" ");
        }
      }
      const [student] = await db.select({ interestProfile: schema.students.interestProfile })
        .from(schema.students)
        .where(eq(schema.students.id, session.userId))
        .limit(1);

      if (student) {
        const profile = normalizeInterestProfile(student.interestProfile);
        const lowerExisting = profile.interests.map(i => i.toLowerCase());

        // Only add if not already present (case-insensitive)
        if (!lowerExisting.includes(suggestion.toLowerCase())) {
          profile.interests.push(suggestion);

          // Cap at MAX_INTERESTS — drop oldest (first) entries to make room
          if (profile.interests.length > MAX_INTERESTS) {
            profile.interests = profile.interests.slice(-MAX_INTERESTS);
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
