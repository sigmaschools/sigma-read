CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "article_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"body_text" text NOT NULL,
	"reading_level" integer NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"estimated_read_time" integer DEFAULT 4,
	"category" varchar(20) DEFAULT 'news' NOT NULL,
	"base_article_id" integer,
	"generated_date" date,
	"headline_source" text,
	"source_url" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_feed_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"rating" varchar(20) NOT NULL,
	"feedback_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"body_text" text NOT NULL,
	"reading_level" integer NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"estimated_read_time" integer DEFAULT 4,
	"read" boolean DEFAULT false NOT NULL,
	"liked" boolean,
	"category" varchar(20) DEFAULT 'general',
	"pre_reading_prompt" text,
	"summary" text,
	"source_cache_id" integer,
	"served_as_level" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"reason" text,
	"blocked_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comprehension_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"score" integer NOT NULL,
	"rating" varchar(20) NOT NULL,
	"understood" text NOT NULL,
	"missed" text NOT NULL,
	"engagement_note" text NOT NULL,
	"self_assessment" varchar(20),
	"ai_avg_words" integer,
	"student_avg_words" integer,
	"redirect_count" integer,
	"exchange_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"reading_session_id" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"conversation_style" varchar(30),
	"complete" boolean DEFAULT false NOT NULL,
	"progress_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"category" varchar(20) NOT NULL,
	"generated_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guides_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "level_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"triggered_by_session_id" integer
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"reading_completed_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "student_article_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"article_cache_id" integer NOT NULL,
	"article_title" text NOT NULL,
	"served_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_parents" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"parent_id" integer NOT NULL,
	"relationship" varchar(30) DEFAULT 'parent',
	"is_primary" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"guide_id" integer NOT NULL,
	"reading_level" integer,
	"grade_level" integer,
	"age" integer,
	"interest_profile" jsonb,
	"adjacent_interests" jsonb,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"daily_article_cap" integer DEFAULT 5,
	"weekly_session_target" integer,
	"total_sessions_completed" integer DEFAULT 0,
	"feed_mix" jsonb DEFAULT '{"probeDirection":null,"probePhase":0,"probeStartDate":null,"probeScores":[]}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "article_favorites" ADD CONSTRAINT "article_favorites_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_favorites" ADD CONSTRAINT "article_favorites_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_feed_events" ADD CONSTRAINT "article_feed_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_ratings" ADD CONSTRAINT "article_ratings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprehension_reports" ADD CONSTRAINT "comprehension_reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_reading_session_id_reading_sessions_id_fk" FOREIGN KEY ("reading_session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_history" ADD CONSTRAINT "level_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_article_history" ADD CONSTRAINT "student_article_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;