CREATE TABLE "daily_operation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_date" text NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"cash_revenue" integer DEFAULT 0 NOT NULL,
	"card_revenue" integer DEFAULT 0 NOT NULL,
	"active_sessions" integer DEFAULT 0 NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_operation_reports_date_unique" ON "daily_operation_reports" USING btree ("report_date");
--> statement-breakpoint
CREATE INDEX "daily_operation_reports_date_idx" ON "daily_operation_reports" USING btree ("report_date");
