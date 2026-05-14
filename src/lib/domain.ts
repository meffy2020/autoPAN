export const RESOURCE_TYPES = ["pc", "nintendo", "playstation", "space"] as const;
export const PAYMENT_METHODS = ["cash", "card"] as const;
export const QUEUE_STATUSES = [
  "waiting",
  "ready",
  "seated",
  "no_show",
  "canceled",
] as const;
export const VISIT_STATUSES = [
  "queued",
  "awaiting_payment",
  "in_session",
  "completed",
  "canceled",
  "no_show",
] as const;
export const SESSION_STATUSES = ["active", "ended"] as const;
export const ANNOUNCEMENT_MODES = ["name", "ticket"] as const;
export const TTS_CATEGORIES = [
  "queue_ready",
  "ending_soon",
  "time_over",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type AnnouncementMode = (typeof ANNOUNCEMENT_MODES)[number];
export type TTSCategory = (typeof TTS_CATEGORIES)[number];

export interface Member {
  id: string;
  name: string;
  gradeOrAge: string;
  guardianPhone: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastVisitedAt?: string;
}

export interface Resource {
  id: string;
  type: ResourceType;
  label: string;
  order: number;
  isActive: boolean;
}

export interface PricingRule {
  id: string;
  resourceType: ResourceType;
  label: string;
  minutes: number;
  amount: number;
  isExtension: boolean;
  sortOrder: number;
}

export interface Visit {
  id: string;
  memberId: string;
  ticketNumber: string;
  resourceType: ResourceType;
  pricingRuleId: string;
  status: VisitStatus;
  createdAt: string;
  note?: string;
}

export interface QueueEntry {
  id: string;
  visitId: string;
  resourceType: ResourceType;
  status: QueueStatus;
  position: number;
  createdAt: string;
  readyAt?: string;
  calledAt?: string;
  noShowAt?: string;
}

export interface Session {
  id: string;
  visitId: string;
  resourceId: string;
  resourceType: ResourceType;
  pricingRuleId: string;
  plannedMinutes: number;
  extensionMinutes: number;
  startsAt: string;
  endsAt: string;
  endedAt?: string;
  status: SessionStatus;
  warnedAt?: string;
  timeOverAlertAt?: string;
}

export interface Payment {
  id: string;
  visitId: string;
  amount: number;
  method: PaymentMethod;
  phase: "initial" | "extension" | "adjustment";
  recordedBy: string;
  recordedAt: string;
}

export interface TTSEvent {
  id: string;
  visitId: string;
  category: TTSCategory;
  message: string;
  audienceLabel: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface StaffActivityLog {
  id: string;
  staffName: string;
  action:
    | "enqueue_visit"
    | "record_payment"
    | "start_session"
    | "extend_session"
    | "end_session"
    | "move_session"
    | "manual_call"
    | "mark_no_show"
    | "requeue"
    | "update_settings"
    | "reset_demo"
    | "auto_no_show";
  entityType: "member" | "visit" | "queue_entry" | "session" | "payment" | "settings";
  entityId: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface SystemSettings {
  announcementMode: AnnouncementMode;
  readyGraceMinutes: number;
  endingSoonMinutes: number;
  operatingWindowMinutes: number;
  staffRoster: string[];
}

export interface DailyReportRow {
  resourceType: ResourceType;
  revenue: number;
  queueCount: number;
  sessionMinutes: number;
  occupancyRate: number;
}

export interface DailyReportRecord {
  date: string;
  uniqueVisitors: number;
  visitCount: number;
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  activeSessions: number;
  rows: DailyReportRow[];
  updatedAt: string;
}

export interface DailyReport {
  date: string;
  uniqueVisitors: number;
  totalVisits: number;
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  activeSessions: number;
  revisitRate: number;
  rows: DailyReportRow[];
}

export interface SystemSnapshot {
  generatedAt: string;
  members: Member[];
  resources: Resource[];
  pricingRules: PricingRule[];
  visits: Visit[];
  queueEntries: QueueEntry[];
  sessions: Session[];
  payments: Payment[];
  ttsEvents: TTSEvent[];
  staffActivityLogs: StaffActivityLog[];
  dailyReports: DailyReportRecord[];
  settings: SystemSettings;
  report: DailyReport;
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  pc: "컴퓨터",
  nintendo: "닌텐도",
  playstation: "플레이스테이션",
  space: "공간 이용",
};

export const RESOURCE_TYPE_SHORT_LABELS: Record<ResourceType, string> = {
  pc: "PC",
  nintendo: "NIN",
  playstation: "PS",
  space: "SPACE",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "현금",
  card: "카드",
};
