import { format, getHours } from "date-fns";

import type { ResourceType, SystemSnapshot } from "@/lib/domain";

const REPORT_RESOURCE_TYPES = ["pc", "nintendo", "playstation"] as const;

type ReportResourceType = (typeof REPORT_RESOURCE_TYPES)[number];

type ResourceRevenue = Record<ReportResourceType, number>;

type AggregateBucket = {
  key: string;
  memberIds: Set<string>;
  visitCount: number;
  totalRevenue: number;
  resourceRevenue: ResourceRevenue;
};

export type DailyReportSummary = {
  date: string;
  uniqueVisitors: number;
  visitCount: number;
  totalRevenue: number;
  resourceRevenue: ResourceRevenue;
};

export type MonthlyReportSummary = {
  month: string;
  uniqueVisitors: number;
  visitCount: number;
  totalRevenue: number;
  resourceRevenue: ResourceRevenue;
};

export type YearlyReportSummary = {
  year: string;
  uniqueVisitors: number;
  visitCount: number;
  totalRevenue: number;
  resourceRevenue: ResourceRevenue;
};

export type HourlyReportSummary = {
  hour: number;
  label: string;
  uniqueVisitors: number;
  visitCount: number;
  totalRevenue: number;
};

export type MemberVisitSummary = {
  memberId: string;
  name: string;
  gradeOrAge: string;
  visitCount: number;
  totalRevenue: number;
  lastVisitedAt: string;
};

export type ResourceReportSummary = {
  resourceType: ReportResourceType;
  visitCount: number;
  sessionCount: number;
  sessionMinutes: number;
  totalRevenue: number;
};

export type ReportsOverview = {
  totalUniqueVisitors: number;
  totalVisitCount: number;
  totalRevenue: number;
  topMember?: MemberVisitSummary;
  dailyRows: DailyReportSummary[];
  monthlyRows: MonthlyReportSummary[];
  yearlyRows: YearlyReportSummary[];
  hourlyRows: HourlyReportSummary[];
  topMembers: MemberVisitSummary[];
  resourceRows: ResourceReportSummary[];
};

function emptyResourceRevenue(): ResourceRevenue {
  return {
    pc: 0,
    nintendo: 0,
    playstation: 0,
  };
}

function isReportResourceType(type: ResourceType): type is ReportResourceType {
  return REPORT_RESOURCE_TYPES.includes(type as ReportResourceType);
}

function createBucket(key: string): AggregateBucket {
  return {
    key,
    memberIds: new Set(),
    visitCount: 0,
    totalRevenue: 0,
    resourceRevenue: emptyResourceRevenue(),
  };
}

function getBucket(map: Map<string, AggregateBucket>, key: string) {
  let bucket = map.get(key);

  if (!bucket) {
    bucket = createBucket(key);
    map.set(key, bucket);
  }

  return bucket;
}

function hourLabel(hour: number) {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00-${end}:00`;
}

export function buildReportsOverview(snapshot: SystemSnapshot): ReportsOverview {
  const visitById = new Map(snapshot.visits.map((visit) => [visit.id, visit]));
  const memberById = new Map(snapshot.members.map((member) => [member.id, member]));
  const dailyBuckets = new Map<string, AggregateBucket>();
  const monthlyBuckets = new Map<string, AggregateBucket>();
  const yearlyBuckets = new Map<string, AggregateBucket>();
  const hourlyBuckets = new Map<string, AggregateBucket>();
  const memberBuckets = new Map<string, MemberVisitSummary>();
  const resourceRows = new Map<ReportResourceType, ResourceReportSummary>(
    REPORT_RESOURCE_TYPES.map((resourceType) => [
      resourceType,
      {
        resourceType,
        visitCount: 0,
        sessionCount: 0,
        sessionMinutes: 0,
        totalRevenue: 0,
      },
    ]),
  );

  for (const visit of snapshot.visits) {
    const visitDate = format(new Date(visit.createdAt), "yyyy-MM-dd");
    const visitMonth = format(new Date(visit.createdAt), "yyyy-MM");
    const visitYear = format(new Date(visit.createdAt), "yyyy");
    const visitHour = getHours(new Date(visit.createdAt));
    const member = memberById.get(visit.memberId);

    const daily = getBucket(dailyBuckets, visitDate);
    daily.memberIds.add(visit.memberId);
    daily.visitCount += 1;

    const monthly = getBucket(monthlyBuckets, visitMonth);
    monthly.memberIds.add(visit.memberId);
    monthly.visitCount += 1;

    const yearly = getBucket(yearlyBuckets, visitYear);
    yearly.memberIds.add(visit.memberId);
    yearly.visitCount += 1;

    const hourly = getBucket(hourlyBuckets, String(visitHour));
    hourly.memberIds.add(visit.memberId);
    hourly.visitCount += 1;

    const memberSummary = memberBuckets.get(visit.memberId) ?? {
      memberId: visit.memberId,
      name: member?.name ?? "알 수 없음",
      gradeOrAge: member?.gradeOrAge ?? "-",
      visitCount: 0,
      totalRevenue: 0,
      lastVisitedAt: visit.createdAt,
    };

    memberSummary.visitCount += 1;

    if (new Date(visit.createdAt) > new Date(memberSummary.lastVisitedAt)) {
      memberSummary.lastVisitedAt = visit.createdAt;
    }

    memberBuckets.set(visit.memberId, memberSummary);

    if (isReportResourceType(visit.resourceType)) {
      resourceRows.get(visit.resourceType)!.visitCount += 1;
    }
  }

  for (const payment of snapshot.payments) {
    const visit = visitById.get(payment.visitId);

    if (!visit || !isReportResourceType(visit.resourceType)) {
      continue;
    }

    const paymentDate = format(new Date(payment.recordedAt), "yyyy-MM-dd");
    const paymentMonth = format(new Date(payment.recordedAt), "yyyy-MM");
    const paymentYear = format(new Date(payment.recordedAt), "yyyy");
    const paymentHour = getHours(new Date(payment.recordedAt));

    const daily = getBucket(dailyBuckets, paymentDate);
    daily.totalRevenue += payment.amount;
    daily.resourceRevenue[visit.resourceType] += payment.amount;

    const monthly = getBucket(monthlyBuckets, paymentMonth);
    monthly.totalRevenue += payment.amount;
    monthly.resourceRevenue[visit.resourceType] += payment.amount;

    const yearly = getBucket(yearlyBuckets, paymentYear);
    yearly.totalRevenue += payment.amount;
    yearly.resourceRevenue[visit.resourceType] += payment.amount;

    const hourly = getBucket(hourlyBuckets, String(paymentHour));
    hourly.totalRevenue += payment.amount;

    const memberSummary = memberBuckets.get(visit.memberId);

    if (memberSummary) {
      memberSummary.totalRevenue += payment.amount;
    }

    resourceRows.get(visit.resourceType)!.totalRevenue += payment.amount;
  }

  for (const session of snapshot.sessions) {
    if (!isReportResourceType(session.resourceType)) {
      continue;
    }

    const row = resourceRows.get(session.resourceType)!;
    row.sessionCount += 1;
    row.sessionMinutes += session.plannedMinutes + session.extensionMinutes;
  }

  const dailyRows = [...dailyBuckets.values()]
    .map((bucket) => ({
      date: bucket.key,
      uniqueVisitors: bucket.memberIds.size,
      visitCount: bucket.visitCount,
      totalRevenue: bucket.totalRevenue,
      resourceRevenue: bucket.resourceRevenue,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const monthlyRows = [...monthlyBuckets.values()]
    .map((bucket) => ({
      month: bucket.key,
      uniqueVisitors: bucket.memberIds.size,
      visitCount: bucket.visitCount,
      totalRevenue: bucket.totalRevenue,
      resourceRevenue: bucket.resourceRevenue,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const yearlyRows = [...yearlyBuckets.values()]
    .map((bucket) => ({
      year: bucket.key,
      uniqueVisitors: bucket.memberIds.size,
      visitCount: bucket.visitCount,
      totalRevenue: bucket.totalRevenue,
      resourceRevenue: bucket.resourceRevenue,
    }))
    .sort((a, b) => b.year.localeCompare(a.year));

  const hourlyRows = [...hourlyBuckets.values()]
    .map((bucket) => {
      const hour = Number(bucket.key);

      return {
        hour,
        label: hourLabel(hour),
        uniqueVisitors: bucket.memberIds.size,
        visitCount: bucket.visitCount,
        totalRevenue: bucket.totalRevenue,
      };
    })
    .sort((a, b) => b.visitCount - a.visitCount || b.totalRevenue - a.totalRevenue || a.hour - b.hour);

  const topMembers = [...memberBuckets.values()].sort(
    (a, b) =>
      b.visitCount - a.visitCount ||
      b.totalRevenue - a.totalRevenue ||
      new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime(),
  );

  return {
    totalUniqueVisitors: new Set(snapshot.visits.map((visit) => visit.memberId)).size,
    totalVisitCount: snapshot.visits.length,
    totalRevenue: snapshot.payments.reduce((sum, payment) => sum + payment.amount, 0),
    topMember: topMembers[0],
    dailyRows,
    monthlyRows,
    yearlyRows,
    hourlyRows,
    topMembers: topMembers.slice(0, 8),
    resourceRows: [...resourceRows.values()],
  };
}
