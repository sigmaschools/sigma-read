import { pgTable, text, integer, timestamp, serial, jsonb, boolean, varchar } from "drizzle-orm/pg-core";

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
  readingLevel: integer("reading_level"), // 1-4, null until assessed
  interestProfile: jsonb("interest_profile"),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const readingSessions = pgTable("reading_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").references(() => students.id).notNull(),
  articleId: integer("article_id").references(() => articles.id).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  readingSessionId: integer("reading_session_id").references(() => readingSessions.id).notNull(),
  messages: jsonb("messages").$type<{ role: string; content: string }[]>().default([]),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
