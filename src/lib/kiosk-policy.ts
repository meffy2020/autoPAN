import type { Member, PricingRule, ResourceType, Session, SystemSnapshot, Visit } from "@/lib/domain";

export const GAME_RESOURCE_TYPES = ["pc", "nintendo", "playstation"] as const satisfies ResourceType[];
export const MAX_DAILY_GAME_MINUTES = 120;
export const KOREA_TIME_ZONE = "Asia/Seoul";

export type GameResourceType = (typeof GAME_RESOURCE_TYPES)[number];

export type KioskPolicyState = Pick<
  SystemSnapshot,
  "members" | "visits" | "sessions" | "pricingRules"
>;

export type KioskPolicyIdentity = {
  memberId?: string;
  member?: {
    name: string;
    guardianPhone: string;
  };
};

const EXCLUDED_VISIT_STATUSES = new Set(["canceled", "no_show"]);

export function normalizeKioskIdentity(value: string) {
  return value.replace(/[\s-]/g, "").toLowerCase();
}

export function isGameResourceType(resourceType: ResourceType): resourceType is GameResourceType {
  return (GAME_RESOURCE_TYPES as readonly ResourceType[]).includes(resourceType);
}

export function getKoreaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const valueByType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(valueByType.get("year")),
    month: Number(valueByType.get("month")),
    day: Number(valueByType.get("day")),
  };
}

export function getKoreaBusinessDateKey(date = new Date()) {
  const { year, month, day } = getKoreaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isSameKoreaBusinessDay(left: Date | string, right = new Date()) {
  return getKoreaBusinessDateKey(new Date(left)) === getKoreaBusinessDateKey(right);
}

export function getElementaryEntryBirthYear(now = new Date()) {
  return getKoreaDateParts(now).year - 7;
}

export function isElementaryGradeOneOrOlderBirthYear(birthYear: string | number, now = new Date()) {
  const parsedBirthYear = Number(birthYear);

  return Number.isInteger(parsedBirthYear) && parsedBirthYear <= getElementaryEntryBirthYear(now);
}

export function findMemberByKioskIdentity(
  members: Member[],
  identity: KioskPolicyIdentity,
) {
  if (identity.memberId) {
    const memberById = members.find((member) => member.id === identity.memberId);

    if (memberById) {
      return memberById;
    }
  }

  if (!identity.member) {
    return undefined;
  }

  const inputName = normalizeKioskIdentity(identity.member.name);
  const inputPhone = normalizeKioskIdentity(identity.member.guardianPhone);

  return members.find(
    (member) =>
      normalizeKioskIdentity(member.name) === inputName &&
      normalizeKioskIdentity(member.guardianPhone) === inputPhone,
  );
}

export function getVisitPlannedGameMinutes({
  visit,
  session,
  pricingRule,
}: {
  visit: Visit;
  session?: Session;
  pricingRule?: PricingRule;
}) {
  if (!isGameResourceType(visit.resourceType) || EXCLUDED_VISIT_STATUSES.has(visit.status)) {
    return 0;
  }

  if (session) {
    return session.plannedMinutes + session.extensionMinutes;
  }

  return pricingRule?.minutes ?? 0;
}

export function getDailyGamePlannedMinutes(
  state: KioskPolicyState,
  identity: KioskPolicyIdentity,
  now = new Date(),
) {
  const matchedMember = findMemberByKioskIdentity(state.members, identity);
  const memberId = matchedMember?.id ?? identity.memberId;

  if (!memberId) {
    return 0;
  }

  return state.visits.reduce((total, visit) => {
    if (visit.memberId !== memberId || !isSameKoreaBusinessDay(visit.createdAt, now)) {
      return total;
    }

    const session = state.sessions.find((item) => item.visitId === visit.id);
    const pricingRule = state.pricingRules.find((item) => item.id === visit.pricingRuleId);

    return total + getVisitPlannedGameMinutes({ visit, session, pricingRule });
  }, 0);
}

export function getDailyGameLimitViolation({
  state,
  identity,
  selectedMinutes,
  now = new Date(),
}: {
  state: KioskPolicyState;
  identity: KioskPolicyIdentity;
  selectedMinutes: number;
  now?: Date;
}) {
  const usedMinutes = getDailyGamePlannedMinutes(state, identity, now);
  const totalMinutes = usedMinutes + selectedMinutes;

  if (totalMinutes <= MAX_DAILY_GAME_MINUTES) {
    return null;
  }

  return {
    usedMinutes,
    selectedMinutes,
    totalMinutes,
    remainingMinutes: Math.max(MAX_DAILY_GAME_MINUTES - usedMinutes, 0),
    maxMinutes: MAX_DAILY_GAME_MINUTES,
  };
}

export function formatDailyGameLimitMessage(remainingMinutes: number) {
  if (remainingMinutes <= 0) {
    return "오늘은 컴퓨터·닌텐도·플스를 합쳐 2시간을 모두 이용했어요. 내일 다시 접수해 주세요.";
  }

  return `컴퓨터·닌텐도·플스는 하루 2시간까지만 이용할 수 있어요. 오늘 남은 시간은 ${remainingMinutes}분이라 선택한 시간으로는 접수할 수 없어요.`;
}
