import { differenceInMinutes, format } from "date-fns";

import type {
  PricingRule,
  QueueEntry,
  ResourceType,
  Session,
  SystemSnapshot,
  TTSEvent,
  Visit,
} from "@/lib/domain";

export function getVisit(snapshot: SystemSnapshot, visitId: string) {
  return snapshot.visits.find((visit) => visit.id === visitId);
}

export function getMemberName(snapshot: SystemSnapshot, memberId: string) {
  return snapshot.members.find((member) => member.id === memberId)?.name ?? "알 수 없음";
}

export function getResource(snapshot: SystemSnapshot, resourceId: string) {
  return snapshot.resources.find((resource) => resource.id === resourceId);
}

export function getPricingRule(snapshot: SystemSnapshot, pricingRuleId: string) {
  return snapshot.pricingRules.find((rule) => rule.id === pricingRuleId);
}

export function getPaymentsForVisit(snapshot: SystemSnapshot, visitId: string) {
  return snapshot.payments.filter((payment) => payment.visitId === visitId);
}

export function getPaidAmount(snapshot: SystemSnapshot, visitId: string) {
  return getPaymentsForVisit(snapshot, visitId).reduce(
    (total, payment) => total + payment.amount,
    0,
  );
}

export function getQueueEntriesByType(snapshot: SystemSnapshot, resourceType: ResourceType) {
  return snapshot.queueEntries.filter((entry) => entry.resourceType === resourceType);
}

export function getActiveSessionsByType(snapshot: SystemSnapshot, resourceType: ResourceType) {
  return snapshot.sessions.filter(
    (session) => session.status === "active" && session.resourceType === resourceType,
  );
}

export function getAvailableResources(snapshot: SystemSnapshot, resourceType: ResourceType) {
  const busyIds = new Set(
    getActiveSessionsByType(snapshot, resourceType).map((session) => session.resourceId),
  );

  return snapshot.resources.filter(
    (resource) =>
      resource.type === resourceType && resource.isActive && !busyIds.has(resource.id),
  );
}

export function getResourceSummary(snapshot: SystemSnapshot, resourceType: ResourceType) {
  const resources = snapshot.resources.filter((resource) => resource.type === resourceType);
  const activeSessions = getActiveSessionsByType(snapshot, resourceType);
  const readyQueue = snapshot.queueEntries.filter(
    (entry) => entry.resourceType === resourceType && entry.status === "ready",
  );
  const waitingQueue = snapshot.queueEntries.filter(
    (entry) => entry.resourceType === resourceType && entry.status === "waiting",
  );

  return {
    total: resources.length,
    active: activeSessions.length,
    ready: readyQueue.length,
    waiting: waitingQueue.length,
    free: Math.max(resources.length - activeSessions.length - readyQueue.length, 0),
  };
}

export function getMinutesRemaining(session: Session, now = new Date()) {
  return differenceInMinutes(new Date(session.endsAt), now);
}

export function formatSessionWindow(session: Session) {
  return `${format(new Date(session.startsAt), "HH:mm")} - ${format(
    new Date(session.endsAt),
    "HH:mm",
  )}`;
}

export function getLatestUndeliveredEvents(snapshot: SystemSnapshot) {
  return snapshot.ttsEvents.filter((event) => !event.deliveredAt);
}

export function sortQueueEntries(entries: QueueEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "ready" ? -1 : 1;
    }

    return a.position - b.position;
  });
}

export function sortSessions(sessions: Session[]) {
  return [...sessions].sort(
    (a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
  );
}

export function sortPricingRules(pricingRules: PricingRule[], resourceType: ResourceType) {
  return pricingRules
    .filter((rule) => rule.resourceType === resourceType)
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
}

export function getVisitTicket(snapshot: SystemSnapshot, visitId: string) {
  return getVisit(snapshot, visitId)?.ticketNumber ?? "-";
}

export function getVisitForSession(snapshot: SystemSnapshot, session: Session) {
  return getVisit(snapshot, session.visitId);
}

export function queueEntriesForVisit(entries: QueueEntry[], visitId: string) {
  return entries.find((entry) => entry.visitId === visitId);
}

export function latestTtsEventForVisit(events: TTSEvent[], visitId: string) {
  return [...events]
    .filter((event) => event.visitId === visitId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function queueCountForType(visits: Visit[], resourceType: ResourceType) {
  return visits.filter((visit) => visit.resourceType === resourceType).length;
}
