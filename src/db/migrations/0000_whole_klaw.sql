CREATE TYPE "public"."announcement_mode" AS ENUM('name', 'ticket');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('member', 'visit', 'queue_entry', 'session', 'payment', 'settings');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."payment_phase" AS ENUM('initial', 'extension', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('waiting', 'ready', 'seated', 'no_show', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('pc', 'nintendo', 'playstation', 'space');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."staff_action" AS ENUM('enqueue_visit', 'record_payment', 'start_session', 'extend_session', 'end_session', 'manual_call', 'mark_no_show', 'requeue', 'update_settings', 'reset_demo', 'auto_no_show');--> statement-breakpoint
CREATE TYPE "public"."tts_category" AS ENUM('queue_ready', 'ending_soon', 'time_over');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('queued', 'awaiting_payment', 'in_session', 'completed', 'canceled', 'no_show');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grade_or_age" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"phase" "payment_phase" NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"amount" integer NOT NULL,
	"is_extension" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"status" "queue_status" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"called_at" timestamp with time zone,
	"no_show_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"label" text NOT NULL,
	"display_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"pricing_rule_id" uuid NOT NULL,
	"planned_minutes" integer NOT NULL,
	"extension_minutes" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" "session_status" NOT NULL,
	"warned_at" timestamp with time zone,
	"time_over_alert_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_name" text NOT NULL,
	"action" "staff_action" NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_mode" "announcement_mode" DEFAULT 'name' NOT NULL,
	"ready_grace_minutes" integer DEFAULT 3 NOT NULL,
	"ending_soon_minutes" integer DEFAULT 10 NOT NULL,
	"operating_window_minutes" integer DEFAULT 600 NOT NULL,
	"staff_roster" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tts_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"category" "tts_category" NOT NULL,
	"message" text NOT NULL,
	"audience_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"ticket_number" text NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"pricing_rule_id" uuid NOT NULL,
	"status" "visit_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pricing_rule_id_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_events" ADD CONSTRAINT "tts_events_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_pricing_rule_id_pricing_rules_id_fk" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "members_name_idx" ON "members" USING btree ("name");--> statement-breakpoint
CREATE INDEX "members_guardian_phone_idx" ON "members" USING btree ("guardian_phone");--> statement-breakpoint
CREATE INDEX "members_last_visited_at_idx" ON "members" USING btree ("last_visited_at");--> statement-breakpoint
CREATE INDEX "payments_visit_id_idx" ON "payments" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "payments_recorded_at_idx" ON "payments" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rules_lookup_unique" ON "pricing_rules" USING btree ("resource_type","label","minutes","is_extension","sort_order");--> statement-breakpoint
CREATE INDEX "pricing_rules_resource_type_idx" ON "pricing_rules" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "pricing_rules_sort_order_idx" ON "pricing_rules" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "queue_entries_visit_id_idx" ON "queue_entries" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "queue_entries_resource_type_idx" ON "queue_entries" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "queue_entries_status_idx" ON "queue_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "queue_entries_position_idx" ON "queue_entries" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_code_unique" ON "resources" USING btree ("code");--> statement-breakpoint
CREATE INDEX "resources_resource_type_idx" ON "resources" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "resources_display_order_idx" ON "resources" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "sessions_visit_id_idx" ON "sessions" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "sessions_resource_id_idx" ON "sessions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_activity_logs_staff_name_idx" ON "staff_activity_logs" USING btree ("staff_name");--> statement-breakpoint
CREATE INDEX "staff_activity_logs_action_idx" ON "staff_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "staff_activity_logs_entity_idx" ON "staff_activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "staff_activity_logs_created_at_idx" ON "staff_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tts_events_visit_id_idx" ON "tts_events" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "tts_events_category_idx" ON "tts_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tts_events_created_at_idx" ON "tts_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_ticket_number_unique" ON "visits" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "visits_member_id_idx" ON "visits" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "visits_resource_type_idx" ON "visits" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "visits_status_idx" ON "visits" USING btree ("status");
