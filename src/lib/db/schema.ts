import { pgTable, text, integer, timestamp, serial, jsonb, boolean, varchar, date, numeric, real, uniqueIndex, index } from "drizzle-orm/pg-core";

export const generatedTopics = pgTable("generated_topics", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  generatedDate: date("generated_date").notNull(),
  query: text("query"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const interestRotation = pgTable("interest_rotation", {
  id: serial("id").primaryKey(),
  interest: text("interest").notNull().unique(),
  lastFeaturedAt: date("last_featured_at"),
  studentIds: integer("student_ids").array(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blockedTopics = pgTable("blocked_topics", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  reason: text("reason"),
  blockedBy: integer("blocked_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const guides = pgTable("guides", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  externalId: text("external_id"), // Compass ID, set by an admin
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("guides_external_id_unique").on(t.externalId)]);

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  guideId: integer("guide_id").references(() => guides.id).notNull(),
  externalId: text("external_id"), // Compass ID, set by an admin
  readingLevel: integer("reading_level"), // 1-6, null until assessed
  gradeLevel: integer("grade_level"), // actual grade (2-8+)
  age: integer("age"), // student age
  interestProfile: jsonb("interest_profile"),
  adjacentInterests: jsonb("adjacent_interests").$type<string[]>(), // pre-computed horizon interests
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  // First-login articles: "pending" while they're found or written, "done" after; null for students onboarded before this existed
  starterArticlesStatus: varchar("starter_articles_status", { length: 20 }),
  starterArticlesStartedAt: timestamp("starter_articles_started_at"),
  dailyArticleCap: integer("daily_article_cap").default(5),
  weeklySessionTarget: integer("weekly_session_target"), // null = auto-calculate from dailyArticleCap × 5
  totalSessionsCompleted: integer("total_sessions_completed").default(0),
  feedMix: jsonb("feed_mix").$type<{
    probeDirection: "up" | "down" | null;
    probePhase: number; // 1, 2, or 3
    probeStartDate: string | null;
    probeScores: number[]; // scores on probe-level articles
  }>().default({ probeDirection: null, probePhase: 0, probeStartDate: null, probeScores: [] }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("students_external_id_unique").on(t.externalId)]);

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  bodyText: text("body_text").notNull(),
  readingLevel: integer("reading_level").notNull(),
  sources: jsonb("sources").$type<string[]>().default([]),
  estimatedReadTime: integer("estimated_read_time").default(4),
  read: boolean("read").default(false).notNull(),
  liked: boolean("liked"), // null = no feedback, true = liked, false = disliked
  category: varchar("category", { length: 20 }).default("general"), // news, general, interest
  preReadingPrompt: text("pre_reading_prompt"), // AI-generated activation question
  summary: text("summary"), // Brief summary for cross-article connections
  sourceCacheId: integer("source_cache_id"), // tracks which cache article this came from
  servedAsLevel: integer("served_as_level"), // the level this article was served as (may differ from readingLevel during probing)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pre-generated news articles cached at multiple reading levels
export const articleCache = pgTable("article_cache", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  bodyText: text("body_text").notNull(),
  readingLevel: integer("reading_level").notNull(), // 1-4
  sources: jsonb("sources").$type<string[]>().default([]),
  estimatedReadTime: integer("estimated_read_time").default(4),
  category: varchar("category", { length: 20 }).notNull().default("news"), // news, general
  baseArticleId: integer("base_article_id"), // links level adaptations to their source
  generatedDate: date("generated_date"), // which batch date this was generated for
  headlineSource: text("headline_source"), // source URL for news articles
  sourceUrl: text("source_url"), // URL of the real web source this article was rewritten from
  flagged: boolean("flagged").default(false).notNull(), // flagged = won't be served to new students
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tracks which cached articles each student has been served (prevents repeats)
export const studentArticleHistory = pgTable("student_article_history", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  articleCacheId: integer("article_cache_id").notNull(),
  articleTitle: text("article_title").notNull(),
  servedAt: timestamp("served_at").defaultNow().notNull(),
});

// Feed events: "show_me_different" clicks, article impressions, etc.
export const articleFeedEvents = pgTable("article_feed_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Daily favorite article picks (at goal completion)
export const articleFavorites = pgTable("article_favorites", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  articleId: integer("article_id").references(() => articles.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Periodic article quality ratings (every 20th session)
export const articleRatings = pgTable("article_ratings", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  rating: varchar("rating", { length: 20 }).notNull(),
  feedbackText: text("feedback_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const readingSessions = pgTable("reading_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  articleId: integer("article_id").references(() => articles.id).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  readingCompletedAt: timestamp("reading_completed_at"), // when student clicked "I'm done reading"
  completedAt: timestamp("completed_at"),
  discussionDurationSeconds: integer("discussion_duration_seconds"), // active discussion time, computed from message timestamps
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  readingSessionId: integer("reading_session_id").references(() => readingSessions.id).notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string; timestamp?: string; type?: string }[]>().default([]),
  conversationStyle: varchar("conversation_style", { length: 30 }), // which of 6 styles was used
  complete: boolean("complete").default(false).notNull(),
  progressScore: integer("progress_score").default(0).notNull(), // quality-based progress toward conversation completion (0-100+)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const comprehensionReports = pgTable("comprehension_reports", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  score: integer("score").notNull(),
  rating: varchar("rating", { length: 20 }).notNull(),
  understood: text("understood").notNull(),
  missed: text("missed").notNull(),
  engagementNote: text("engagement_note").notNull(),
  selfAssessment: varchar("self_assessment", { length: 20 }), // Student's self-rating: "really_well" | "pretty_well" | "not_sure" | "lost"
  aiAvgWords: integer("ai_avg_words"), // average words per AI message
  studentAvgWords: integer("student_avg_words"), // average words per student message
  redirectCount: integer("redirect_count"), // times AI redirected/corrected student
  exchangeCount: integer("exchange_count"), // total message exchanges
  skills: jsonb("skills").$type<Record<string, string>>(), // main_idea, key_details, vocabulary, inference, connection → shown | partly | not_shown | not_tested
  evidence: jsonb("evidence").$type<{ skill: string; quote: string; shows?: boolean }[]>(), // student quotes backing the skill ratings
  summary: text("summary"), // two sentences for the guide
  nextStep: text("next_step"), // one thing the guide could try next
  confidence: varchar("confidence", { length: 10 }), // high | medium | low, from conversation shape
  forcedClose: boolean("forced_close"), // conversation hit the 6-message backstop
  inChatScore: integer("in_chat_score"), // progressScore at completion, for comparing with score
  model: varchar("model", { length: 50 }),
  promptVersion: varchar("prompt_version", { length: 20 }),
  // A guide or admin disagreeing with the report ("Disagree" button)
  guideFlag: varchar("guide_flag", { length: 20 }), // score_too_high | score_too_low | other
  guideNote: text("guide_note"),
  guideFlaggedBy: integer("guide_flagged_by"),
  guideFlaggedRole: varchar("guide_flagged_role", { length: 10 }), // guide | admin
  guideFlaggedAt: timestamp("guide_flagged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const parents = pgTable("parents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const studentParents = pgTable("student_parents", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  parentId: integer("parent_id").references(() => parents.id).notNull(),
  relationship: varchar("relationship", { length: 30 }).default("parent"),
  isPrimary: boolean("is_primary").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const parentConversations = pgTable("parent_conversations", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").references(() => parents.id).notNull(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string; timestamp?: string }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const parentFeedback = pgTable("parent_feedback", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").references(() => parents.id).notNull(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  parentConversationId: integer("parent_conversation_id").references(() => parentConversations.id).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  sentiment: varchar("sentiment", { length: 15 }).notNull(),
  summary: text("summary").notNull(),
  sourceMessageIndex: integer("source_message_index"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const levelHistory = pgTable("level_history", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  triggeredBySessionId: integer("triggered_by_session_id"),
});

// One row per morning batch day — tracks progress across resumable cron calls
export const batchRuns = pgTable("batch_runs", {
  id: serial("id").primaryKey(),
  runDate: date("run_date").notNull().unique(), // America/Chicago date
  status: varchar("status", { length: 20 }).notNull().default("running"), // running | partial | complete | failed
  attempts: integer("attempts").default(0).notNull(),
  leaseUntil: timestamp("lease_until"), // lock held by the call currently running
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  counts: jsonb("counts").$type<{ baseArticles?: number; adaptations?: number; served?: number }>().default({}),
  lastError: text("last_error"),
  alertSentAt: timestamp("alert_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Who changed what from the admin area (student edits, level overrides, impersonation)
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  action: varchar("action", { length: 40 }).notNull(), // student.update | student.level_override | impersonate.start | impersonate.end
  targetType: varchar("target_type", { length: 20 }), // student | guide
  targetId: integer("target_id"),
  details: jsonb("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per Claude API call from the app (scripts and evals aren't recorded)
export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  feature: varchar("feature", { length: 40 }).notNull(), // see AiFeature in src/lib/ai-usage.ts
  model: varchar("model", { length: 80 }).notNull(),
  studentId: integer("student_id"), // no FK: usage history outlives deleted students
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
  cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }), // null when the model has no listed price
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service clients of the read-only /api/v1 (Compass). Keys are shown once and stored hashed.
export const apiClients = pgTable("api_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(), // first characters, to recognise a key in the admin list
  keyHash: text("key_hash").notNull(), // sha256 hex of the full key
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]), // students:read | reports:read | transcripts:read
  guideId: integer("guide_id"), // when set, only this guide's students are visible
  createdBy: integer("created_by"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("api_clients_key_hash_unique").on(t.keyHash)]);

// One row per /api/v1 call: the audit trail for data about minors, and the rate limit window
export const apiRequestLog = pgTable("api_request_log", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  method: varchar("method", { length: 8 }).notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("api_request_log_client_time_idx").on(t.clientId, t.createdAt)]);

// ─── Interest graph (see src/lib/interest-graph) ─────────────────────────────
// Topics and signals refer to topics by slug, a stable ID that will travel to Compass.

// The shared topic map: domain → category → topic
export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  parentSlug: text("parent_slug"),
  domain: text("domain").notNull(), // the top-level topic's slug
  safetyStatus: varchar("safety_status", { length: 20 }).default("approved").notNull(), // approved, pending, blocked
  wikidataId: text("wikidata_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("topics_slug_unique").on(t.slug)]);

// Free text → topic. `alias` is stored normalized (see normalizePhrase in interest-graph/resolve.ts)
export const topicAliases = pgTable("topic_aliases", {
  id: serial("id").primaryKey(),
  alias: text("alias").notNull(),
  topicSlug: text("topic_slug").notNull(),
  origin: varchar("origin", { length: 20 }).default("seed").notNull(), // seed, ai, admin
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("topic_aliases_alias_unique").on(t.alias)]);

// Links across the tree (parents and siblings are related through parentSlug already)
export const topicRelations = pgTable("topic_relations", {
  id: serial("id").primaryKey(),
  fromSlug: text("from_slug").notNull(),
  toSlug: text("to_slug").notNull(),
  relation: varchar("relation", { length: 20 }).default("related").notNull(),
  weight: real("weight").default(1).notNull(),
  origin: varchar("origin", { length: 20 }).default("seeded").notNull(), // seeded, learned
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("topic_relations_pair_unique").on(t.fromSlug, t.toSlug, t.relation)]);

// Topics of a base cache article; its level adaptations share them (via base_article_id)
export const articleTopics = pgTable("article_topics", {
  id: serial("id").primaryKey(),
  articleCacheId: integer("article_cache_id").notNull(),
  topicSlug: text("topic_slug").notNull(),
  role: varchar("role", { length: 10 }).default("primary").notNull(), // primary, secondary
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [uniqueIndex("article_topics_article_topic_unique").on(t.articleCacheId, t.topicSlug)]);

// Append-only log of what each student did, the source of truth for affinities
export const interestSignals = pgTable("interest_signals", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  topicSlug: text("topic_slug"), // null when the phrase didn't match a topic yet
  phrase: text("phrase"), // the student's own words, when the signal came from text
  signalType: varchar("signal_type", { length: 30 }).notNull(),
  weight: real("weight").notNull(),
  sourceApp: varchar("source_app", { length: 30 }).default("sigmaread").notNull(),
  sourceRef: text("source_ref"), // what produced it, e.g. "article:123"; makes re-recording a no-op
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [
  uniqueIndex("interest_signals_source_unique").on(t.studentId, t.signalType, t.sourceRef),
  index("interest_signals_student_time_idx").on(t.studentId, t.createdAt),
]);
