import { pgTable, text, integer, timestamp, serial, jsonb, boolean, varchar, date } from "drizzle-orm/pg-core";

export const generatedTopics = pgTable("generated_topics", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  generatedDate: date("generated_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  guideId: integer("guide_id").references(() => guides.id).notNull(),
  readingLevel: integer("reading_level"), // 1-6, null until assessed
  gradeLevel: integer("grade_level"), // actual grade (2-8+)
  age: integer("age"), // student age
  interestProfile: jsonb("interest_profile"),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  dailyArticleCap: integer("daily_article_cap").default(5),
  weeklySessionTarget: integer("weekly_session_target"), // null = auto-calculate from dailyArticleCap × 5
  totalSessionsCompleted: integer("total_sessions_completed").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  readingSessionId: integer("reading_session_id").references(() => readingSessions.id).notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string; timestamp?: string }[]>().default([]),
  conversationStyle: varchar("conversation_style", { length: 30 }), // which of 6 styles was used
  complete: boolean("complete").default(false).notNull(),
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
