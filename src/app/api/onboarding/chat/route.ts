export const dynamic = "force-dynamic";
// The starter articles keep running after the response (see after() below); writing one takes a minute or two
export const maxDuration = 300;
import { NextRequest, NextResponse, after } from "next/server";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { MODELS, requestSettings } from "@/lib/models";
import Anthropic from "@anthropic-ai/sdk";
import { tracked } from "@/lib/ai-usage";
import { INTEREST_INTERVIEW, READING_LEVEL_ASSESSMENT } from "@/lib/prompts";
import { normalizeInterestProfile } from "@/lib/normalize-interests";
import { gradeToReadingLevel } from "@/lib/grade-to-level";
import { quietly, recordDeclaredInterests } from "@/lib/interest-graph";
import { markStarterPending, prepareStarterArticles } from "@/lib/starter-articles";
import { extractAnswer, firstName, interviewOpener, interviewWrapUp, moreInterestsPrompt, stripAnswer, topUpInterests } from "@/lib/onboarding-copy";

/** After this many student answers Sigma wraps up as soon as it has enough interests */
const MAX_STUDENT_ANSWERS = 3;
/** The chat never ends with fewer interests than this (owner's rule) */
const MIN_INTERESTS = 3;
/** Past this many answers a short profile is topped up with defaults instead of asking again */
const GIVE_UP_ANSWERS = 6;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "student") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, phase } = await req.json(); // phase: "interest" | "level"

  // Get student name for personalization: Sigma uses the first name only, like a person would
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, session.userId)).limit(1);
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const studentName = firstName(student.name);

  // Onboarding happens once (an admin reset clears the flag): never save the profile or start the
  // starter articles again, e.g. on a double submit
  if (phase === "interest" && student.onboardingComplete) {
    return NextResponse.json({ message: "", profileComplete: true });
  }

  // The page opens the chat with a "Hi" the student never typed, so it isn't an answer
  const answers = Math.max(0, messages.filter((m: { role: string }) => m.role === "user").length - 1);
  const atCap = phase === "interest" && answers >= MAX_STUDENT_ANSWERS;
  const lastAnswer = atCap
    ? `\n\nYou've asked your questions. If you have at least three interests, output the closing sentence and the [PROFILE] now. If you have fewer, don't output the profile: make it easy (offer a few ideas they can pick from) and ask for one more.`
    : "";
  // The first message is fixed copy, so every student gets the same clear introduction
  if (phase === "interest" && answers === 0 && !messages.some((m: { role: string }) => m.role === "assistant")) {
    return NextResponse.json({ message: interviewOpener(studentName) });
  }

  const systemPrompt = (phase === "interest" ? INTEREST_INTERVIEW : READING_LEVEL_ASSESSMENT)
    + `\n\nThe student's name is ${studentName}.` + lastAnswer;
  const convo = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  async function reply(extra: { role: "user"; content: string }[] = []): Promise<string> {
    const response = await tracked(anthropic, "onboarding", session!.userId).messages.create({
      model: MODELS.standard, ...requestSettings(MODELS.standard, "standard"),
      max_tokens: 2048,
      // Same every turn of the chat: cached, so later turns read it at a tenth of the price
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [...convo, ...extra],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  }

  let assistantText: string;
  try {
    assistantText = await reply();
    // At the cap the chat ends once it has enough interests: if Sigma asked another question
    // anyway, ask once more for the profile (the profile check below holds it open if it's short)
    // Only on the first turn past the cap, and never forcing a profile the student didn't give
    if (answers === MAX_STUDENT_ANSWERS && !/\[PROFILE\]/.test(assistantText)) {
      const retry = await reply([{ role: "user", content: "[If the student has given at least three interests, output your one-sentence closing and the [PROFILE] now, using only interests they said. If not, reply with your last message unchanged.]" }]);
      if (/\[PROFILE\]/.test(retry)) assistantText = retry;
    }
  } catch (e) {
    // Without this the route 500s with an empty body and the student sees a blank chat
    console.error("onboarding chat: Claude call failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }

  if (!assistantText.trim()) {
    console.error("onboarding chat: Claude returned no text");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }

  // Check if interest profile is complete
  const profileMatch = assistantText.match(/\[PROFILE\]\s*(\{[\s\S]*?\})/);
  // [ANSWER] belongs to the profile turn's wrap-up; never show the tag itself
  if (!profileMatch) return NextResponse.json({ message: stripAnswer(assistantText) });

  const visibleText = stripAnswer(assistantText.replace(/\[PROFILE\][\s\S]*/, ""));
  let profile;
  try {
    profile = normalizeInterestProfile(JSON.parse(profileMatch[1]));
  } catch (e) {
    // Parse failed: continue the conversation, without showing the student the broken profile
    console.error("onboarding chat: profile parse failed", e);
    return NextResponse.json({ message: visibleText || "Tell me one more thing you like." });
  }

  // Never finish with fewer than three interests: keep the chat open and ask for more. A student
  // who still hasn't named three after GIVE_UP_ANSWERS answers gets kid-friendly defaults to make
  // three, so nobody is stuck in onboarding.
  if (phase === "interest" && profile.interests.length < MIN_INTERESTS) {
    if (answers < GIVE_UP_ANSWERS) return NextResponse.json({ message: moreInterestsPrompt(profile.interests) });
    profile = { interests: topUpInterests(profile.interests, MIN_INTERESTS) };
  }

  // Map grade level to initial reading level (placement then moves it, see level-progression.ts)
  const level = gradeToReadingLevel(student.gradeLevel);
  await db.update(schema.students)
    .set({
      interestProfile: profile,
      readingLevel: level,
      onboardingComplete: true,
    })
    .where(eq(schema.students.id, session.userId));
  await quietly(recordDeclaredInterests(session.userId, profile.interests, "onboarding", { client: anthropic }), "onboarding interests");

  // Find or write their first articles while the tutorial cards play
  await markStarterPending(session.userId);
  after(() => prepareStarterArticles(session.userId, anthropic));

  // Fixed wrap-up: it names what Sigma heard and says what happens next, in a length a kid reads.
  // If the student asked Sigma something, Sigma's one-sentence [ANSWER] goes first.
  const message = phase === "interest" ? interviewWrapUp(profile.interests, extractAnswer(assistantText)) : visibleText;
  return NextResponse.json({ message, profileComplete: true, profile });
}
