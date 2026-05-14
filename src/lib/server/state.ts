import "server-only";

import {
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  setHours,
  setMinutes,
  subMinutes,
} from "date-fns";

import type {
  AnnouncementMode,
  DailyReport,
  DailyReportRecord,
  Member,
  Payment,
  PricingRule,
  QueueEntry,
  Resource,
  ResourceType,
  Session,
  StaffActivityLog,
  SystemSettings,
  SystemSnapshot,
  TTSEvent,
  Visit,
} from "@/lib/domain";
import { RESOURCE_TYPE_LABELS } from "@/lib/domain";

export type CounterKey =
  | "member"
  | "visit"
  | "queue"
  | "session"
  | "payment"
  | "tts"
  | "log"
  | "ticket";

export interface StoreState {
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
  counters: Record<CounterKey, number>;
}

export type MemberInput = {
  name: string;
  gradeOrAge: string;
  guardianPhone: string;
  notes?: string;
};

export function createId(prefix: string, value: number) {
  return `${prefix}_${String(value).padStart(4, "0")}`;
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function normalize(value: string) {
  return value.replace(/[\s-]/g, "").toLowerCase();
}

export function nextCounter(state: StoreState, key: CounterKey) {
  state.counters[key] += 1;
  return state.counters[key];
}

export function buildTicketNumber(state: StoreState, now = new Date()) {
  const sequence = nextCounter(state, "ticket");
  return `${format(now, "MMdd")}-${String(sequence).padStart(3, "0")}`;
}

export function buildPricingRules(): PricingRule[] {
  const rules: Array<[ResourceType, string, number, number, boolean]> = [
    ["pc", "30분", 30, 500, false],
    ["pc", "60분", 60, 1000, false],
    ["pc", "90분", 90, 1500, false],
    ["pc", "120분", 120, 2000, false],
    ["pc", "30분 연장", 30, 500, true],
    ["nintendo", "30분", 30, 500, false],
    ["nintendo", "60분", 60, 1000, false],
    ["nintendo", "90분", 90, 1500, false],
    ["nintendo", "120분", 120, 2000, false],
    ["nintendo", "30분 연장", 30, 500, true],
    ["playstation", "30분", 30, 500, false],
    ["playstation", "60분", 60, 1000, false],
    ["playstation", "90분", 90, 1500, false],
    ["playstation", "120분", 120, 2000, false],
    ["playstation", "30분 연장", 30, 500, true],
    ["pc", "1시간 연장", 60, 1000, true],
    ["pc", "1시간 30분 연장", 90, 1500, true],
    ["nintendo", "1시간 연장", 60, 1000, true],
    ["nintendo", "1시간 30분 연장", 90, 1500, true],
    ["playstation", "1시간 연장", 60, 1000, true],
    ["playstation", "1시간 30분 연장", 90, 1500, true],
  ];

  return rules.map(([resourceType, label, minutes, amount, isExtension], index) => ({
    id: createId("price", index + 1),
    resourceType,
    label,
    minutes,
    amount,
    isExtension,
    sortOrder: index + 1,
  }));
}

export function buildResources(): Resource[] {
  const resources: Resource[] = [];
  let order = 1;

  for (let index = 1; index <= 6; index += 1) {
    resources.push({
      id: createId("resource", order),
      type: "pc",
      label: `PC-${String(index).padStart(2, "0")}`,
      order,
      isActive: true,
    });
    order += 1;
  }

  for (let index = 1; index <= 4; index += 1) {
    resources.push({
      id: createId("resource", order),
      type: "nintendo",
      label: `NIN-${String(index).padStart(2, "0")}`,
      order,
      isActive: true,
    });
    order += 1;
  }

  for (let index = 1; index <= 2; index += 1) {
    resources.push({
      id: createId("resource", order),
      type: "playstation",
      label: `PS-${String(index).padStart(2, "0")}`,
      order,
      isActive: true,
    });
    order += 1;
  }

  return resources;
}

export function seedState(now = new Date()): StoreState {
  const pricingRules = buildPricingRules();
  const resources = buildResources();
  const members: Member[] = [
    {
      id: createId("member", 1),
      name: "김하늘",
      gradeOrAge: "초5",
      guardianPhone: "01012345678",
      notes: "친구와 같이 방문",
      createdAt: nowIso(subMinutes(now, 1440)),
      updatedAt: nowIso(subMinutes(now, 60)),
      lastVisitedAt: nowIso(subMinutes(now, 60)),
    },
    {
      id: createId("member", 2),
      name: "이준",
      gradeOrAge: "중1",
      guardianPhone: "01022223333",
      createdAt: nowIso(subMinutes(now, 4320)),
      updatedAt: nowIso(subMinutes(now, 20)),
      lastVisitedAt: nowIso(subMinutes(now, 20)),
    },
    {
      id: createId("member", 3),
      name: "박소율",
      gradeOrAge: "초6",
      guardianPhone: "01044445555",
      createdAt: nowIso(subMinutes(now, 2880)),
      updatedAt: nowIso(subMinutes(now, 10)),
      lastVisitedAt: nowIso(subMinutes(now, 10)),
    },
    {
      id: createId("member", 4),
      name: "최민호",
      gradeOrAge: "초4",
      guardianPhone: "01077778888",
      createdAt: nowIso(subMinutes(now, 90)),
      updatedAt: nowIso(subMinutes(now, 90)),
    },
    {
      id: createId("member", 5),
      name: "오다은",
      gradeOrAge: "중2",
      guardianPhone: "01099990000",
      createdAt: nowIso(subMinutes(now, 75)),
      updatedAt: nowIso(subMinutes(now, 75)),
    },
  ];

  const visits: Visit[] = [
    {
      id: createId("visit", 1),
      memberId: createId("member", 1),
      ticketNumber: "0413-101",
      resourceType: "pc",
      pricingRuleId: createId("price", 2),
      status: "in_session",
      createdAt: nowIso(subMinutes(now, 45)),
    },
    {
      id: createId("visit", 2),
      memberId: createId("member", 2),
      ticketNumber: "0413-102",
      resourceType: "nintendo",
      pricingRuleId: createId("price", 6),
      status: "in_session",
      createdAt: nowIso(subMinutes(now, 20)),
    },
    {
      id: createId("visit", 3),
      memberId: createId("member", 3),
      ticketNumber: "0413-103",
      resourceType: "playstation",
      pricingRuleId: createId("price", 12),
      status: "queued",
      createdAt: nowIso(subMinutes(now, 12)),
    },
    {
      id: createId("visit", 4),
      memberId: createId("member", 4),
      ticketNumber: "0413-104",
      resourceType: "pc",
      pricingRuleId: createId("price", 1),
      status: "queued",
      createdAt: nowIso(subMinutes(now, 8)),
    },
    {
      id: createId("visit", 5),
      memberId: createId("member", 5),
      ticketNumber: "0413-105",
      resourceType: "pc",
      pricingRuleId: createId("price", 1),
      status: "queued",
      createdAt: nowIso(subMinutes(now, 5)),
    },
  ];

  const queueEntries: QueueEntry[] = [
    {
      id: createId("queue", 1),
      visitId: createId("visit", 3),
      resourceType: "playstation",
      status: "waiting",
      position: 1,
      createdAt: nowIso(subMinutes(now, 12)),
    },
    {
      id: createId("queue", 2),
      visitId: createId("visit", 4),
      resourceType: "pc",
      status: "waiting",
      position: 1,
      createdAt: nowIso(subMinutes(now, 8)),
    },
    {
      id: createId("queue", 3),
      visitId: createId("visit", 5),
      resourceType: "pc",
      status: "waiting",
      position: 2,
      createdAt: nowIso(subMinutes(now, 5)),
    },
  ];

  const sessions: Session[] = [
    {
      id: createId("session", 1),
      visitId: createId("visit", 1),
      resourceId: createId("resource", 1),
      resourceType: "pc",
      pricingRuleId: createId("price", 2),
      plannedMinutes: 60,
      extensionMinutes: 0,
      startsAt: nowIso(subMinutes(now, 35)),
      endsAt: nowIso(addMinutes(subMinutes(now, 35), 60)),
      status: "active",
    },
    {
      id: createId("session", 2),
      visitId: createId("visit", 2),
      resourceId: createId("resource", 7),
      resourceType: "nintendo",
      pricingRuleId: createId("price", 6),
      plannedMinutes: 30,
      extensionMinutes: 0,
      startsAt: nowIso(subMinutes(now, 20)),
      endsAt: nowIso(addMinutes(subMinutes(now, 20), 30)),
      status: "active",
    },
  ];

  const payments: Payment[] = [
    {
      id: createId("payment", 1),
      visitId: createId("visit", 1),
      amount: 1000,
      method: "cash",
      phase: "initial",
      recordedBy: "김선생",
      recordedAt: nowIso(subMinutes(now, 35)),
    },
    {
      id: createId("payment", 2),
      visitId: createId("visit", 2),
      amount: 500,
      method: "card",
      phase: "initial",
      recordedBy: "이선생",
      recordedAt: nowIso(subMinutes(now, 20)),
    },
  ];

  return {
    members,
    resources,
    pricingRules,
    visits,
    queueEntries,
    sessions,
    payments,
    ttsEvents: [],
    staffActivityLogs: [],
    dailyReports: [],
    settings: {
      announcementMode: "name",
      readyGraceMinutes: 3,
      endingSoonMinutes: 10,
      operatingWindowMinutes: 600,
      staffRoster: ["김선생", "이선생", "박선생"],
    },
    counters: {
      member: members.length,
      visit: visits.length,
      queue: queueEntries.length,
      session: sessions.length,
      payment: payments.length,
      tts: 0,
      log: 0,
      ticket: 105,
    },
  };
}

export function createLog(
  state: StoreState,
  {
    staffName,
    action,
    entityType,
    entityId,
    metadata,
    now,
  }: Omit<StaffActivityLog, "id" | "createdAt"> & { now?: Date },
) {
  state.staffActivityLogs.unshift({
    id: createId("log", nextCounter(state, "log")),
    staffName,
    action,
    entityType,
    entityId,
    createdAt: nowIso(now),
    metadata,
  });
}

export function buildAnnouncementMessage(
  memberName: string,
  ticketNumber: string,
  resourceType: ResourceType,
  mode: AnnouncementMode,
) {
  const label = RESOURCE_TYPE_LABELS[resourceType];

  if (mode === "ticket") {
    return `${label} ${ticketNumber}번 이용자 입장해 주세요.`;
  }

  return `${memberName} 이용자, ${label} 자리로 와 주세요.`;
}

export function emitTtsEvent(
  state: StoreState,
  {
    visitId,
    category,
    message,
    audienceLabel,
    now,
  }: Omit<TTSEvent, "id" | "createdAt" | "deliveredAt"> & { now?: Date },
) {
  state.ttsEvents.unshift({
    id: createId("tts", nextCounter(state, "tts")),
    visitId,
    category,
    message,
    audienceLabel,
    createdAt: nowIso(now),
  });
}

export function getVisit(state: StoreState, visitId: string) {
  const visit = state.visits.find((item) => item.id === visitId);

  if (!visit) {
    throw new Error("방문 정보를 찾을 수 없습니다.");
  }

  return visit;
}

export function getQueueEntry(state: StoreState, queueEntryId: string) {
  const entry = state.queueEntries.find((item) => item.id === queueEntryId);

  if (!entry) {
    throw new Error("대기 정보를 찾을 수 없습니다.");
  }

  return entry;
}

export function getSession(state: StoreState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("세션 정보를 찾을 수 없습니다.");
  }

  return session;
}

export function moveActiveSessionResource(
  state: StoreState,
  input: {
    sessionId: string;
    resourceId: string;
    staffName: string;
  },
  now = new Date(),
) {
  const session = getSession(state, input.sessionId);

  if (session.status !== "active") {
    throw new Error("진행 중인 세션만 자리를 이동할 수 있습니다.");
  }

  const nextResource = state.resources.find((resource) => resource.id === input.resourceId);

  if (!nextResource || !nextResource.isActive) {
    throw new Error("이동할 자리를 찾을 수 없습니다.");
  }

  if (nextResource.type !== session.resourceType) {
    throw new Error("같은 자원 종류의 자리로만 이동할 수 있습니다.");
  }

  if (nextResource.id === session.resourceId) {
    return {
      sessionId: session.id,
      previousResourceId: session.resourceId,
      nextResourceId: session.resourceId,
      changed: false,
    };
  }

  const occupiedSession = state.sessions.find(
    (item) =>
      item.status === "active" &&
      item.id !== session.id &&
      item.resourceId === nextResource.id,
  );

  if (occupiedSession) {
    throw new Error("이미 사용 중인 자리입니다.");
  }

  const previousResourceId = session.resourceId;
  session.resourceId = nextResource.id;

  createLog(state, {
    staffName: input.staffName,
    action: "move_session",
    entityType: "session",
    entityId: session.id,
    metadata: {
      previousResourceId,
      nextResourceId: nextResource.id,
    },
    now,
  });

  return {
    sessionId: session.id,
    previousResourceId,
    nextResourceId: nextResource.id,
    changed: true,
  };
}

export function getPricingRule(state: StoreState, pricingRuleId: string) {
  const rule = state.pricingRules.find((item) => item.id === pricingRuleId);

  if (!rule) {
    throw new Error("요금제를 찾을 수 없습니다.");
  }

  return rule;
}

export function getMember(state: StoreState, memberId: string) {
  const member = state.members.find((item) => item.id === memberId);

  if (!member) {
    throw new Error("회원 정보를 찾을 수 없습니다.");
  }

  return member;
}

export function getVisitPayments(state: StoreState, visitId: string) {
  return state.payments.filter((payment) => payment.visitId === visitId);
}

export function availableResourceCount(state: StoreState, resourceType: ResourceType) {
  const total = state.resources.filter(
    (resource) => resource.type === resourceType && resource.isActive,
  ).length;
  const activeSessions = state.sessions.filter(
    (session) => session.resourceType === resourceType && session.status === "active",
  ).length;
  const readyEntries = state.queueEntries.filter(
    (entry) => entry.resourceType === resourceType && entry.status === "ready",
  ).length;

  return Math.max(total - activeSessions - readyEntries, 0);
}

export function reconcileSessions(state: StoreState, now = new Date()) {
  for (const session of state.sessions) {
    if (session.status !== "active") {
      continue;
    }

    const visit = getVisit(state, session.visitId);
    const member = getMember(state, visit.memberId);
    const remainingMinutes = differenceInMinutes(new Date(session.endsAt), now);

    if (
      remainingMinutes <= state.settings.endingSoonMinutes &&
      remainingMinutes > 0 &&
      !session.warnedAt
    ) {
      session.warnedAt = nowIso(now);
      emitTtsEvent(state, {
        visitId: visit.id,
        category: "ending_soon",
        message: `${member.name} 이용자, ${state.settings.endingSoonMinutes}분 뒤 종료입니다.`,
        audienceLabel: visit.ticketNumber,
        now,
      });
    }

    if (remainingMinutes <= 0 && !session.timeOverAlertAt) {
      session.timeOverAlertAt = nowIso(now);
      emitTtsEvent(state, {
        visitId: visit.id,
        category: "time_over",
        message: `${member.name} 이용 시간 종료입니다. 관리자에게 와 주세요.`,
        audienceLabel: visit.ticketNumber,
        now,
      });
    }
  }
}

export function reconcileQueue(state: StoreState, now = new Date()) {
  for (const entry of state.queueEntries) {
    if (entry.status !== "ready" || !entry.readyAt) {
      continue;
    }

    const readyMinutes = differenceInMinutes(now, new Date(entry.readyAt));

    if (readyMinutes < state.settings.readyGraceMinutes) {
      continue;
    }

    entry.status = "no_show";
    entry.noShowAt = nowIso(now);
    const visit = getVisit(state, entry.visitId);
    visit.status = "no_show";
    createLog(state, {
      staffName: "system",
      action: "auto_no_show",
      entityType: "queue_entry",
      entityId: entry.id,
      metadata: {
        ticketNumber: visit.ticketNumber,
      },
      now,
    });
  }

  for (const resourceType of ["pc", "nintendo", "playstation"] as const) {
    state.queueEntries
      .filter((entry) => entry.resourceType === resourceType && entry.status === "waiting")
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .forEach((entry, index) => {
        entry.position = index + 1;
      });

    let openSlots = availableResourceCount(state, resourceType);

    while (openSlots > 0) {
      const nextEntry = state.queueEntries
        .filter((entry) => entry.resourceType === resourceType && entry.status === "waiting")
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];

      if (!nextEntry) {
        break;
      }

      nextEntry.status = "ready";
      nextEntry.readyAt = nowIso(now);
      nextEntry.calledAt = nowIso(now);
      nextEntry.position = 0;
      openSlots -= 1;

      const visit = getVisit(state, nextEntry.visitId);
      const member = getMember(state, visit.memberId);

      emitTtsEvent(state, {
        visitId: visit.id,
        category: "queue_ready",
        message: buildAnnouncementMessage(
          member.name,
          visit.ticketNumber,
          visit.resourceType,
          state.settings.announcementMode,
        ),
        audienceLabel: visit.ticketNumber,
        now,
      });
    }

    state.queueEntries
      .filter((entry) => entry.resourceType === resourceType && entry.status === "waiting")
      .sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .forEach((entry, index) => {
        entry.position = index + 1;
      });
  }
}

export function buildDailyReport(state: StoreState, now = new Date()): DailyReport {
  const todayVisits = state.visits.filter((visit) => isSameDay(new Date(visit.createdAt), now));
  const todayPayments = state.payments.filter((payment) =>
    isSameDay(new Date(payment.recordedAt), now),
  );
  const todaySessions = state.sessions.filter((session) =>
    isSameDay(new Date(session.startsAt), now),
  );
  const activeSessions = state.sessions.filter((session) => session.status === "active").length;
  const uniqueVisitors = new Set(todayVisits.map((visit) => visit.memberId)).size;
  const visitCounts = new Map<string, number>();

  for (const visit of state.visits) {
    visitCounts.set(visit.memberId, (visitCounts.get(visit.memberId) ?? 0) + 1);
  }

  const revisitMembers = [...visitCounts.values()].filter((count) => count > 1).length;
  const revisitRate =
    state.members.length === 0 ? 0 : Math.round((revisitMembers / state.members.length) * 100);

  const rows = (["pc", "nintendo", "playstation"] as const).map((resourceType) => {
    const payments = todayPayments.filter((payment) => {
      const visit = state.visits.find((item) => item.id === payment.visitId);
      return visit?.resourceType === resourceType;
    });
    const sessionMinutes = todaySessions
      .filter((session) => session.resourceType === resourceType)
      .reduce((total, session) => {
        const endTime = session.endedAt
          ? new Date(session.endedAt)
          : new Date(Math.min(new Date(session.endsAt).getTime(), now.getTime()));

        if (endTime <= new Date(session.startsAt)) {
          return total;
        }

        return total + differenceInMinutes(endTime, new Date(session.startsAt));
      }, 0);
    const resourceCount = state.resources.filter((resource) => resource.type === resourceType)
      .length;
    const occupancyRate =
      resourceCount === 0
        ? 0
        : Math.round(
            (sessionMinutes / (resourceCount * state.settings.operatingWindowMinutes)) * 100,
          );

    return {
      resourceType,
      revenue: payments.reduce((sum, payment) => sum + payment.amount, 0),
      queueCount: state.queueEntries.filter(
        (entry) =>
          entry.resourceType === resourceType &&
          (entry.status === "waiting" || entry.status === "ready"),
      ).length,
      sessionMinutes,
      occupancyRate,
    };
  });

  return {
    date: format(now, "yyyy-MM-dd"),
    uniqueVisitors,
    totalVisits: todayVisits.length,
    totalRevenue: todayPayments.reduce((sum, payment) => sum + payment.amount, 0),
    cashRevenue: todayPayments
      .filter((payment) => payment.method === "cash")
      .reduce((sum, payment) => sum + payment.amount, 0),
    cardRevenue: todayPayments
      .filter((payment) => payment.method === "card")
      .reduce((sum, payment) => sum + payment.amount, 0),
    activeSessions,
    revisitRate,
    rows,
  };
}

export function buildSystemSnapshot(state: StoreState, now = new Date()): SystemSnapshot {
  return structuredClone({
    generatedAt: nowIso(now),
    members: state.members,
    resources: state.resources,
    pricingRules: state.pricingRules,
    visits: state.visits,
    queueEntries: state.queueEntries,
    sessions: state.sessions,
    payments: state.payments,
    ttsEvents: state.ttsEvents.slice(0, 40),
    staffActivityLogs: state.staffActivityLogs.slice(0, 20),
    dailyReports: state.dailyReports,
    settings: state.settings,
    report: buildDailyReport(state, now),
  }) as SystemSnapshot;
}

function pricingRuleKey(rule: Pick<PricingRule, "resourceType" | "minutes" | "isExtension">) {
  return `${rule.resourceType}:${rule.minutes}:${rule.isExtension ? "extension" : "base"}`;
}

function nextPricingRuleId(state: StoreState) {
  const maxIndex = state.pricingRules.reduce((max, rule) => {
    const match = /^price_(\d+)$/.exec(rule.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return createId("price", maxIndex + 1);
}

function reconcilePricingRules(state: StoreState) {
  state.pricingRules ??= [];

  const existingKeys = new Set(state.pricingRules.map(pricingRuleKey));
  const existingIds = new Set(state.pricingRules.map((rule) => rule.id));

  for (const defaultRule of buildPricingRules()) {
    const key = pricingRuleKey(defaultRule);

    if (existingKeys.has(key)) {
      continue;
    }

    const id = existingIds.has(defaultRule.id) ? nextPricingRuleId(state) : defaultRule.id;
    state.pricingRules.push({ ...defaultRule, id });
    existingKeys.add(key);
    existingIds.add(id);
  }

  state.pricingRules.sort((a, b) => a.sortOrder - b.sortOrder);
}

function toEndOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function toDailyReportRecord(report: DailyReport, now: Date): DailyReportRecord {
  return {
    date: report.date,
    uniqueVisitors: report.uniqueVisitors,
    visitCount: report.totalVisits,
    totalRevenue: report.totalRevenue,
    cashRevenue: report.cashRevenue,
    cardRevenue: report.cardRevenue,
    activeSessions: report.activeSessions,
    rows: report.rows,
    updatedAt: nowIso(now),
  };
}

function reconcileDailyReports(state: StoreState, now = new Date()) {
  state.dailyReports ??= [];

  const today = format(now, "yyyy-MM-dd");
  const dates = new Set<string>([today]);

  for (const visit of state.visits) {
    dates.add(format(new Date(visit.createdAt), "yyyy-MM-dd"));
  }

  for (const payment of state.payments) {
    dates.add(format(new Date(payment.recordedAt), "yyyy-MM-dd"));
  }

  const reportsByDate = new Map(state.dailyReports.map((report) => [report.date, report]));

  for (const date of dates) {
    const reportTime = date === today ? now : toEndOfDay(date);
    reportsByDate.set(date, toDailyReportRecord(buildDailyReport(state, reportTime), now));
  }

  state.dailyReports = [...reportsByDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function reconcileState(state: StoreState, now = new Date()) {
  reconcilePricingRules(state);
  reconcileSessions(state, now);
  reconcileQueue(state, now);
  reconcileDailyReports(state, now);
}

export function getRuntimeModeStatus(): {
  mode: "demo" | "local-postgres";
  hasDatabaseUrl: boolean;
} {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const mode = hasDatabaseUrl ? "local-postgres" : "demo";

  return {
    mode,
    hasDatabaseUrl,
  };
}

export function getOpeningWindow() {
  const now = new Date();
  return {
    opensAt: setMinutes(setHours(now, 10), 0).toISOString(),
    closesAt: setMinutes(setHours(now, 20), 0).toISOString(),
  };
}
