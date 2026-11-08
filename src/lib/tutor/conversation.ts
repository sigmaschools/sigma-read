/**
 * One exchange of a Sigma conversation: the observer reads the kid's message while Sigma
 * replies, so the reply never waits on the scoring. The observer's notes from this exchange
 * steer the next one and decide when the talk is done.
 *
 * Shared by the chat route and the eval. No DB access here.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { ClosingKind, TurnMessage } from "../conversation-turn";
import { MODELS, requestSettings } from "../models";
import { sigmaSystemBlocks } from "./prompt";
import type { GuideNotes } from "./guide-notes";
import { observe, kidAskedQuestion, MAX_EXCHANGES, type ObserverNotes } from "./observer";
import { runSigmaTurn, type SigmaTurnArgs, type SigmaTurnResult } from "./turn";

export interface SigmaExchangeArgs {
  tutorClient: SigmaTurnArgs["client"];
  observerClient: { messages: Pick<Anthropic["messages"], "create"> };
  articleTitle: string;
  articleText: string;
  level: number;
  guideNotes?: GuideNotes | null;
  /** Another character and examples (evals comparing prompt versions); the app uses the files in md/ */
  voice?: { character: string; examples: string } | null;
  /** Conversation so far, including the student's latest message (empty for the opener) */
  messages: TurnMessage[];
  /** Progress score before this student message */
  priorProgress: number;
  /** The observer's notes from the previous exchange */
  previousNotes: ObserverNotes | null;
  /** Streams Sigma's reply as it is written */
  onDelta?: (text: string) => void;
  /** Overrides for evals; the app uses models.ts */
  tutorModel?: string;
  tutorSettings?: object;
  observerModel?: string;
  observerSettings?: object;
}

export interface SigmaExchangeResult extends SigmaTurnResult {
  progressDelta: number;
  progressScore: number;
  complete: boolean;
  closing: ClosingKind | null;
  /** Notes to store for the next exchange */
  notes: ObserverNotes | null;
}

export async function sigmaExchange(args: SigmaExchangeArgs): Promise<SigmaExchangeResult> {
  const exchanges = args.messages.filter(m => m.role === "user").length;
  const isOpener = args.messages.length === 0;
  // The observer decided on the previous message that the talk had done its job, so this reply
  // closes (one exchange later, so the kid's last answer gets a reaction). The backstop closes
  // on the reply to the MAX_EXCHANGES-th message whatever the observer says.
  // An earned close waits one more turn when the kid's latest message asks Sigma something, so
  // the goodbye never lands on a question (the backstop still closes, answering it inside the goodbye).
  const lastKidMessage = [...args.messages].reverse().find(m => m.role === "user")?.content ?? "";
  const deferred = !isOpener && !!args.previousNotes?.done && kidAskedQuestion(lastKidMessage) && exchanges < MAX_EXCHANGES;
  const closing: ClosingKind | null = isOpener ? null
    : args.previousNotes?.done && !deferred ? "earned"
    : exchanges >= MAX_EXCHANGES ? "forced"
    : null;
  const tutorModel = args.tutorModel ?? MODELS.sigmaTutor;
  const systemBlocks = sigmaSystemBlocks({ articleTitle: args.articleTitle, articleText: args.articleText, level: args.level, notes: args.guideNotes, voice: args.voice });

  const turnPromise = runSigmaTurn({
    client: args.tutorClient,
    model: tutorModel,
    settings: args.tutorSettings ?? requestSettings(tutorModel, "sigmaTutor"),
    systemBlocks,
    guideNotes: args.guideNotes,
    messages: args.messages,
    level: args.level,
    closing,
    steer: args.previousNotes?.steer,
    onDelta: args.onDelta,
  });
  // The closing turn scores nothing, as before: an answer given after the talk is done
  // shouldn't move the in-chat score
  const notesPromise: Promise<ObserverNotes | null> = isOpener || closing ? Promise.resolve(args.previousNotes) : observe({
    client: args.observerClient,
    articleText: args.articleText,
    level: args.level,
    messages: args.messages,
    previous: args.previousNotes,
    priorProgress: args.priorProgress,
    model: args.observerModel,
    settings: args.observerSettings,
  }).then(
    // The close was only put off for the kid's question: it still happens next turn
    n => deferred ? { ...n, done: true } : n,
    e => {
      // Keep the running notes for the next turn, but score nothing: the previous delta was already counted
      console.error("Observer failed, keeping the previous notes:", e);
      return args.previousNotes ? { ...args.previousNotes, progressDelta: 0 } : null;
    },
  );
  const [turn, notes] = await Promise.all([turnPromise, notesPromise]);
  const progressDelta = isOpener || closing ? 0 : (notes?.progressDelta ?? 0);
  return {
    ...turn,
    progressDelta,
    progressScore: args.priorProgress + progressDelta,
    complete: closing !== null,
    closing,
    notes: isOpener || closing ? args.previousNotes : notes,
  };
}
