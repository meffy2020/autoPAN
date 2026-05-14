import "server-only";

import { addMinutes } from "date-fns";

import type {
  Payment,
  PaymentMethod,
  ResourceType,
  SystemSettings,
  SystemSnapshot,
} from "@/lib/domain";
import {
  availableResourceCount,
  buildAnnouncementMessage,
  buildSystemSnapshot,
  buildTicketNumber,
  createId,
  createLog,
  emitTtsEvent,
  getMember,
  getPricingRule,
  getQueueEntry,
  getSession,
  getVisit,
  getVisitPayments,
  moveActiveSessionResource,
  nextCounter,
  nowIso,
  normalize,
  reconcileState,
} from "@/lib/server/state";
import type { MemberInput, StoreState } from "@/lib/server/state";
import {
  getStoreRepository,
  getStoreRepositoryStatus,
} from "@/lib/server/repository";

function withState<T>(mutator: (state: StoreState, now: Date) => T, now = new Date()) {
  return getStoreRepository().mutate(mutator, now);
}

export function getSnapshot(now = new Date()): SystemSnapshot {
  return withState((state, current) => {
    reconcileState(state, current);
    return buildSystemSnapshot(state, current);
  }, now);
}

export function enqueueVisit(input: {
  existingMemberId?: string;
  member?: MemberInput;
  resourceType: ResourceType;
  pricingRuleId: string;
  note?: string;
}) {
  return withState((state, now) => {
    const pricingRule = getPricingRule(state, input.pricingRuleId);

    if (pricingRule.resourceType !== input.resourceType) {
      throw new Error("선택한 자원과 요금제가 맞지 않습니다.");
    }

    let memberId = input.existingMemberId;

    if (!memberId) {
      if (!input.member) {
        throw new Error("회원 정보를 입력해 주세요.");
      }

      const matchedMember = state.members.find(
        (member) =>
          normalize(member.name) === normalize(input.member!.name) &&
          normalize(member.guardianPhone) === normalize(input.member!.guardianPhone),
      );

      if (matchedMember) {
        memberId = matchedMember.id;
        matchedMember.gradeOrAge = input.member.gradeOrAge;
        matchedMember.notes = input.member.notes ?? matchedMember.notes;
        matchedMember.updatedAt = nowIso(now);
      } else {
        const nextMemberId = createId("member", nextCounter(state, "member"));
        state.members.unshift({
          id: nextMemberId,
          name: input.member.name,
          gradeOrAge: input.member.gradeOrAge,
          guardianPhone: input.member.guardianPhone,
          notes: input.member.notes,
          createdAt: nowIso(now),
          updatedAt: nowIso(now),
        });
        memberId = nextMemberId;
      }
    }

    const visitId = createId("visit", nextCounter(state, "visit"));
    const ticketNumber = buildTicketNumber(state, now);
    const hasOpenQueue = state.queueEntries.some(
      (entry) =>
        entry.resourceType === input.resourceType &&
        (entry.status === "waiting" || entry.status === "ready"),
    );
    const canWalkIn = !hasOpenQueue && availableResourceCount(state, input.resourceType) > 0;

    state.visits.unshift({
      id: visitId,
      memberId,
      ticketNumber,
      resourceType: input.resourceType,
      pricingRuleId: input.pricingRuleId,
      status: canWalkIn ? "awaiting_payment" : "queued",
      createdAt: nowIso(now),
      note: input.note,
    });
    let queueId: string | undefined;

    if (!canWalkIn) {
      queueId = createId("queue", nextCounter(state, "queue"));
      state.queueEntries.unshift({
        id: queueId,
        visitId,
        resourceType: input.resourceType,
        status: "waiting",
        position: 0,
        createdAt: nowIso(now),
      });
    }

    const member = getMember(state, memberId);
    member.lastVisitedAt = nowIso(now);
    member.updatedAt = nowIso(now);

    createLog(state, {
      staffName: "kiosk",
      action: "enqueue_visit",
      entityType: "visit",
      entityId: visitId,
      metadata: {
        ticketNumber,
        resourceType: input.resourceType,
        immediateEntry: canWalkIn,
      },
      now,
    });

    reconcileState(state, now);

    return {
      visitId,
      queueEntryId: queueId,
      ticketNumber,
      queueStatus: canWalkIn
        ? "awaiting_payment"
        : queueId
          ? getQueueEntry(state, queueId).status
          : "waiting",
    };
  });
}

export function registerSpaceVisit(input: {
  existingMemberId?: string;
  member?: MemberInput;
  note?: string;
}) {
  return withState((state, now) => {
    let memberId = input.existingMemberId;

    if (!memberId) {
      if (!input.member) {
        throw new Error("회원 정보를 입력해 주세요.");
      }

      const matchedMember = state.members.find(
        (member) =>
          normalize(member.name) === normalize(input.member!.name) &&
          normalize(member.guardianPhone) === normalize(input.member!.guardianPhone),
      );

      if (matchedMember) {
        memberId = matchedMember.id;
        matchedMember.gradeOrAge = input.member.gradeOrAge;
        matchedMember.notes = input.member.notes ?? matchedMember.notes;
        matchedMember.updatedAt = nowIso(now);
      } else {
        const nextMemberId = createId("member", nextCounter(state, "member"));
        state.members.unshift({
          id: nextMemberId,
          name: input.member.name,
          gradeOrAge: input.member.gradeOrAge,
          guardianPhone: input.member.guardianPhone,
          notes: input.member.notes,
          createdAt: nowIso(now),
          updatedAt: nowIso(now),
        });
        memberId = nextMemberId;
      }
    }

    const visitId = createId("visit", nextCounter(state, "visit"));
    const ticketNumber = buildTicketNumber(state, now);

    state.visits.unshift({
      id: visitId,
      memberId,
      ticketNumber,
      resourceType: "space",
      pricingRuleId: "",
      status: "completed",
      createdAt: nowIso(now),
      note: input.note,
    });

    const member = getMember(state, memberId);
    member.lastVisitedAt = nowIso(now);
    member.updatedAt = nowIso(now);

    createLog(state, {
      staffName: "kiosk",
      action: "enqueue_visit",
      entityType: "visit",
      entityId: visitId,
      metadata: {
        ticketNumber,
        resourceType: "space",
      },
      now,
    });

    return {
      visitId,
      ticketNumber,
      queueStatus: "completed",
    };
  });
}

export function recordPayment(input: {
  visitId: string;
  amount: number;
  method: PaymentMethod;
  phase: Payment["phase"];
  staffName: string;
}) {
  return withState((state, now) => {
    const visit = getVisit(state, input.visitId);

    const paymentId = createId("payment", nextCounter(state, "payment"));
    state.payments.unshift({
      id: paymentId,
      visitId: input.visitId,
      amount: input.amount,
      method: input.method,
      phase: input.phase,
      recordedBy: input.staffName,
      recordedAt: nowIso(now),
    });

    const member = getMember(state, visit.memberId);
    member.lastVisitedAt = nowIso(now);
    member.updatedAt = nowIso(now);

    createLog(state, {
      staffName: input.staffName,
      action: "record_payment",
      entityType: "payment",
      entityId: paymentId,
      metadata: {
        amount: input.amount,
        method: input.method,
        phase: input.phase,
      },
      now,
    });

    reconcileState(state, now);

    return { paymentId };
  });
}

export function startSession(input: {
  queueEntryId: string;
  resourceId: string;
  staffName: string;
}) {
  return withState((state, now) => {
    const queueEntry = getQueueEntry(state, input.queueEntryId);

    if (queueEntry.status !== "ready") {
      throw new Error("입장 가능 상태의 대기만 시작할 수 있습니다.");
    }

    const visit = getVisit(state, queueEntry.visitId);
    const pricingRule = getPricingRule(state, visit.pricingRuleId);
    const resource = state.resources.find((item) => item.id === input.resourceId);

    if (!resource || resource.type !== visit.resourceType) {
      throw new Error("선택한 자원이 올바르지 않습니다.");
    }

    const activeSession = state.sessions.find(
      (session) => session.status === "active" && session.resourceId === input.resourceId,
    );

    if (activeSession) {
      throw new Error("이미 사용 중인 자리입니다.");
    }

    const paidAmount = getVisitPayments(state, visit.id).reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    if (paidAmount <= 0) {
      throw new Error("결제기록을 먼저 등록해 주세요.");
    }

    const sessionId = createId("session", nextCounter(state, "session"));
    state.sessions.unshift({
      id: sessionId,
      visitId: visit.id,
      resourceId: input.resourceId,
      resourceType: visit.resourceType,
      pricingRuleId: visit.pricingRuleId,
      plannedMinutes: pricingRule.minutes,
      extensionMinutes: 0,
      startsAt: nowIso(now),
      endsAt: nowIso(addMinutes(now, pricingRule.minutes)),
      status: "active",
    });

    queueEntry.status = "seated";
    visit.status = "in_session";

    createLog(state, {
      staffName: input.staffName,
      action: "start_session",
      entityType: "session",
      entityId: sessionId,
      metadata: {
        ticketNumber: visit.ticketNumber,
        resourceId: input.resourceId,
      },
      now,
    });

    reconcileState(state, now);

    return { sessionId };
  });
}

export function startWalkInSession(input: {
  visitId: string;
  resourceId: string;
  staffName: string;
}) {
  return withState((state, now) => {
    const visit = getVisit(state, input.visitId);

    if (visit.status !== "awaiting_payment") {
      throw new Error("즉시 이용 가능 상태의 방문만 바로 시작할 수 있습니다.");
    }

    const pricingRule = getPricingRule(state, visit.pricingRuleId);
    const resource = state.resources.find((item) => item.id === input.resourceId);

    if (!resource || resource.type !== visit.resourceType) {
      throw new Error("선택한 자원이 올바르지 않습니다.");
    }

    const activeSession = state.sessions.find(
      (session) => session.status === "active" && session.resourceId === input.resourceId,
    );

    if (activeSession) {
      throw new Error("이미 사용 중인 자리입니다.");
    }

    const paidAmount = getVisitPayments(state, visit.id).reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    if (paidAmount <= 0) {
      throw new Error("결제기록을 먼저 등록해 주세요.");
    }

    const sessionId = createId("session", nextCounter(state, "session"));
    state.sessions.unshift({
      id: sessionId,
      visitId: visit.id,
      resourceId: input.resourceId,
      resourceType: visit.resourceType,
      pricingRuleId: visit.pricingRuleId,
      plannedMinutes: pricingRule.minutes,
      extensionMinutes: 0,
      startsAt: nowIso(now),
      endsAt: nowIso(addMinutes(now, pricingRule.minutes)),
      status: "active",
    });

    visit.status = "in_session";

    createLog(state, {
      staffName: input.staffName,
      action: "start_session",
      entityType: "session",
      entityId: sessionId,
      metadata: {
        ticketNumber: visit.ticketNumber,
        resourceId: input.resourceId,
        walkIn: true,
      },
      now,
    });

    reconcileState(state, now);

    return { sessionId };
  });
}

export function extendSession(input: {
  sessionId: string;
  pricingRuleId: string;
  staffName: string;
}) {
  return withState((state, now) => {
    const session = getSession(state, input.sessionId);
    const pricingRule = getPricingRule(state, input.pricingRuleId);

    if (session.status !== "active") {
      throw new Error("종료된 세션은 연장할 수 없습니다.");
    }

    if (pricingRule.resourceType !== session.resourceType) {
      throw new Error("자원 유형이 다른 연장권입니다.");
    }

    if (session.plannedMinutes + session.extensionMinutes + pricingRule.minutes > 240) {
      throw new Error("최대 이용 시간은 4시간입니다.");
    }

    session.extensionMinutes += pricingRule.minutes;
    session.endsAt = nowIso(addMinutes(new Date(session.endsAt), pricingRule.minutes));
    session.warnedAt = undefined;
    session.timeOverAlertAt = undefined;

    createLog(state, {
      staffName: input.staffName,
      action: "extend_session",
      entityType: "session",
      entityId: session.id,
      metadata: {
        addedMinutes: pricingRule.minutes,
        pricingRuleId: pricingRule.id,
      },
      now,
    });

    reconcileState(state, now);

    return {
      sessionId: session.id,
      endsAt: session.endsAt,
    };
  });
}

export function endSession(input: { sessionId: string; staffName: string }) {
  return withState((state, now) => {
    const session = getSession(state, input.sessionId);

    if (session.status !== "active") {
      throw new Error("이미 종료된 세션입니다.");
    }

    session.status = "ended";
    session.endedAt = nowIso(now);

    const visit = getVisit(state, session.visitId);
    visit.status = "completed";

    const member = getMember(state, visit.memberId);
    member.lastVisitedAt = nowIso(now);
    member.updatedAt = nowIso(now);

    createLog(state, {
      staffName: input.staffName,
      action: "end_session",
      entityType: "session",
      entityId: session.id,
      metadata: {
        ticketNumber: visit.ticketNumber,
      },
      now,
    });

    reconcileState(state, now);

    return { sessionId: session.id };
  });
}

export function moveSession(input: {
  sessionId: string;
  resourceId: string;
  staffName: string;
}) {
  return withState((state, now) => moveActiveSessionResource(state, input, now));
}

export function manualCallQueueEntry(input: {
  queueEntryId: string;
  staffName: string;
}) {
  return withState((state, now) => {
    const queueEntry = getQueueEntry(state, input.queueEntryId);

    if (queueEntry.status !== "ready") {
      throw new Error("입장 가능 상태에서만 재호출할 수 있습니다.");
    }

    queueEntry.calledAt = nowIso(now);

    const visit = getVisit(state, queueEntry.visitId);
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

    createLog(state, {
      staffName: input.staffName,
      action: "manual_call",
      entityType: "queue_entry",
      entityId: queueEntry.id,
      metadata: {
        ticketNumber: visit.ticketNumber,
      },
      now,
    });

    return { queueEntryId: queueEntry.id };
  });
}

export function markNoShow(input: { queueEntryId: string; staffName: string }) {
  return withState((state, now) => {
    const queueEntry = getQueueEntry(state, input.queueEntryId);
    const visit = getVisit(state, queueEntry.visitId);

    queueEntry.status = "no_show";
    queueEntry.noShowAt = nowIso(now);
    visit.status = "no_show";

    createLog(state, {
      staffName: input.staffName,
      action: "mark_no_show",
      entityType: "queue_entry",
      entityId: queueEntry.id,
      metadata: {
        ticketNumber: visit.ticketNumber,
      },
      now,
    });

    reconcileState(state, now);

    return { queueEntryId: queueEntry.id };
  });
}

export function requeueVisit(input: { queueEntryId: string; staffName: string }) {
  return withState((state, now) => {
    const queueEntry = getQueueEntry(state, input.queueEntryId);
    const visit = getVisit(state, queueEntry.visitId);

    queueEntry.status = "waiting";
    queueEntry.position = 0;
    queueEntry.createdAt = nowIso(now);
    queueEntry.readyAt = undefined;
    queueEntry.calledAt = undefined;
    queueEntry.noShowAt = undefined;
    visit.status = "queued";

    createLog(state, {
      staffName: input.staffName,
      action: "requeue",
      entityType: "queue_entry",
      entityId: queueEntry.id,
      metadata: {
        ticketNumber: visit.ticketNumber,
      },
      now,
    });

    reconcileState(state, now);

    return { queueEntryId: queueEntry.id };
  });
}

export function updateSettings(
  input: Pick<
    SystemSettings,
    "announcementMode" | "readyGraceMinutes" | "endingSoonMinutes" | "staffRoster"
  >,
) {
  return withState((state, now) => {
    state.settings = {
      ...state.settings,
      announcementMode: input.announcementMode,
      readyGraceMinutes: input.readyGraceMinutes,
      endingSoonMinutes: input.endingSoonMinutes,
      staffRoster: input.staffRoster,
    };

    createLog(state, {
      staffName: "admin",
      action: "update_settings",
      entityType: "settings",
      entityId: "system",
      metadata: {
        announcementMode: input.announcementMode,
        readyGraceMinutes: input.readyGraceMinutes,
        endingSoonMinutes: input.endingSoonMinutes,
      },
      now,
    });

    reconcileState(state, now);

    return { ok: true };
  });
}

export function acknowledgeTtsEvent(input: { eventId: string }) {
  return withState((state, now) => {
    const event = state.ttsEvents.find((item) => item.id === input.eventId);

    if (!event) {
      return { ok: true };
    }

    event.deliveredAt = nowIso(now);
    return { ok: true };
  });
}

export function resetDemoState() {
  getStoreRepository().reset(new Date());

  return withState((state, now) => {
    createLog(state, {
      staffName: "admin",
      action: "reset_demo",
      entityType: "settings",
      entityId: "system",
      metadata: {
        reason: "manual reset",
      },
      now,
    });

    return { ok: true };
  });
}

export { getOpeningWindow } from "@/lib/server/state";

export function getRuntimeModeStatus() {
  return getStoreRepositoryStatus();
}
