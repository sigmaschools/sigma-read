CREATE TABLE "parent_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"parent_conversation_id" integer NOT NULL,
	"category" varchar(30) NOT NULL,
	"sentiment" varchar(15) NOT NULL,
	"summary" text NOT NULL,
	"source_message_index" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parent_conversations" ADD CONSTRAINT "parent_conversations_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_conversations" ADD CONSTRAINT "parent_conversations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_feedback" ADD CONSTRAINT "parent_feedback_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_feedback" ADD CONSTRAINT "parent_feedback_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_feedback" ADD CONSTRAINT "parent_feedback_parent_conversation_id_parent_conversations_id_fk" FOREIGN KEY ("parent_conversation_id") REFERENCES "public"."parent_conversations"("id") ON DELETE no action ON UPDATE no action;