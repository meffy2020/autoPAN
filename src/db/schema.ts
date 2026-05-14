import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const resourceTypeEnum = pgEnum("resource_type", [
  "pc",
  "nintendo",
  "playstation",
  "space",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card"]);

export const queueStatusEnum = pgEnum("queue_status", [
  "waiting",
  "ready",
  "seated",
  "no_show",
  "canceled",
]);

export const visitStatusEnum = pgEnum("visit_status", [
  "queued",
  "awaiting_payment",
  "in_session",
  "completed",
  "canceled",
  "no_show",
]);

export const sessionStatusEnum = pgEnum("session_status", ["active", "ended"]);

export const announcementModeEnum = pgEnum("announcement_mode", [
  "name",
  "ticket",
]);

export const ttsCategoryEnum = pgEnum("tts_category", [
  "queue_ready",
  "ending_soon",
  "time_over",
]);

export const paymentPhaseEnum = pgEnum("payment_phase", [
  "initial",
  "extension",
  "adjustment",
]);

export const staffActionEnum = pgEnum("staff_action", [
  "enqueue_visit",
  "record_payment",
  "start_session",
  "extend_session",
  "end_session",
  "manual_call",
  "mark_no_show",
  "requeue",
  "update_settings",
  "reset_demo",
  "auto_no_show",
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "member",
  "visit",
  "queue_entry",
  "session",
  "payment",
  "settings",
]);

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  announcementMode: announcementModeEnum("announcement_mode")
    .notNull()
    .default("name"),
  readyGraceMinutes: integer("ready_grace_minutes").notNull().default(3),
  endingSoonMinutes: integer("ending_soon_minutes").notNull().default(10),
  operatingWindowMinutes: integer("operating_window_minutes")
    .notNull()
    .default(600),
  staffRoster: jsonb("staff_roster")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    gradeOrAge: text("grade_or_age").notNull(),
    guardianPhone: text("guardian_phone").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
  },
  (table) => ({
    nameIdx: index("members_name_idx").on(table.name),
    guardianPhoneIdx: index("members_guardian_phone_idx").on(table.guardianPhone),
    lastVisitedAtIdx: index("members_last_visited_at_idx").on(
      table.lastVisitedAt,
    ),
  }),
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    label: text("label").notNull(),
    displayOrder: integer("display_order").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("resources_code_unique").on(table.code),
    resourceTypeIdx: index("resources_resource_type_idx").on(table.resourceType),
    displayOrderIdx: index("resources_display_order_idx").on(
      table.displayOrder,
    ),
  }),
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    label: text("label").notNull(),
    minutes: integer("minutes").notNull(),
    amount: integer("amount").notNull(),
    isExtension: boolean("is_extension").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    lookupIdx: uniqueIndex("pricing_rules_lookup_unique").on(
      table.resourceType,
      table.label,
      table.minutes,
      table.isExtension,
      table.sortOrder,
    ),
    resourceTypeIdx: index("pricing_rules_resource_type_idx").on(
      table.resourceType,
    ),
    sortOrderIdx: index("pricing_rules_sort_order_idx").on(table.sortOrder),
  }),
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    ticketNumber: text("ticket_number").notNull(),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    pricingRuleId: uuid("pricing_rule_id")
      .notNull()
      .references(() => pricingRules.id, { onDelete: "restrict" }),
    status: visitStatusEnum("status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketNumberUnique: uniqueIndex("visits_ticket_number_unique").on(
      table.ticketNumber,
    ),
    memberIdx: index("visits_member_id_idx").on(table.memberId),
    resourceTypeIdx: index("visits_resource_type_idx").on(table.resourceType),
    statusIdx: index("visits_status_idx").on(table.status),
  }),
);

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    status: queueStatusEnum("status").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    calledAt: timestamp("called_at", { withTimezone: true }),
    noShowAt: timestamp("no_show_at", { withTimezone: true }),
  },
  (table) => ({
    visitIdx: index("queue_entries_visit_id_idx").on(table.visitId),
    resourceTypeIdx: index("queue_entries_resource_type_idx").on(
      table.resourceType,
    ),
    statusIdx: index("queue_entries_status_idx").on(table.status),
    positionIdx: index("queue_entries_position_idx").on(table.position),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    resourceType: resourceTypeEnum("resource_type").notNull(),
    pricingRuleId: uuid("pricing_rule_id")
      .notNull()
      .references(() => pricingRules.id, { onDelete: "restrict" }),
    plannedMinutes: integer("planned_minutes").notNull(),
    extensionMinutes: integer("extension_minutes").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: sessionStatusEnum("status").notNull(),
    warnedAt: timestamp("warned_at", { withTimezone: true }),
    timeOverAlertAt: timestamp("time_over_alert_at", { withTimezone: true }),
  },
  (table) => ({
    visitIdx: index("sessions_visit_id_idx").on(table.visitId),
    resourceIdx: index("sessions_resource_id_idx").on(table.resourceId),
    statusIdx: index("sessions_status_idx").on(table.status),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    method: paymentMethodEnum("method").notNull(),
    phase: paymentPhaseEnum("phase").notNull(),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    visitIdx: index("payments_visit_id_idx").on(table.visitId),
    recordedAtIdx: index("payments_recorded_at_idx").on(table.recordedAt),
  }),
);

export const dailyOperationReports = pgTable(
  "daily_operation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportDate: text("report_date").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    visitCount: integer("visit_count").notNull().default(0),
    totalRevenue: integer("total_revenue").notNull().default(0),
    cashRevenue: integer("cash_revenue").notNull().default(0),
    cardRevenue: integer("card_revenue").notNull().default(0),
    activeSessions: integer("active_sessions").notNull().default(0),
    rows: jsonb("rows")
      .$type<
        Array<{
          resourceType: "pc" | "nintendo" | "playstation" | "space";
          revenue: number;
          queueCount: number;
          sessionMinutes: number;
          occupancyRate: number;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    reportDateUnique: uniqueIndex("daily_operation_reports_date_unique").on(
      table.reportDate,
    ),
    reportDateIdx: index("daily_operation_reports_date_idx").on(table.reportDate),
  }),
);

export const ttsEvents = pgTable(
  "tts_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    category: ttsCategoryEnum("category").notNull(),
    message: text("message").notNull(),
    audienceLabel: text("audience_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => ({
    visitIdx: index("tts_events_visit_id_idx").on(table.visitId),
    categoryIdx: index("tts_events_category_idx").on(table.category),
    createdAtIdx: index("tts_events_created_at_idx").on(table.createdAt),
  }),
);

export const staffActivityLogs = pgTable(
  "staff_activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffName: text("staff_name").notNull(),
    action: staffActionEnum("action").notNull(),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    staffIdx: index("staff_activity_logs_staff_name_idx").on(table.staffName),
    actionIdx: index("staff_activity_logs_action_idx").on(table.action),
    entityIdx: index("staff_activity_logs_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    createdAtIdx: index("staff_activity_logs_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export const dbSchema = {
  systemSettings,
  members,
  resources,
  pricingRules,
  visits,
  queueEntries,
  sessions,
  payments,
  dailyOperationReports,
  ttsEvents,
  staffActivityLogs,
};
