"use client";

import { useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  LogOut,
  Monitor,
  RefreshCw,
  TimerReset,
  X,
} from "lucide-react";

import { PageChrome } from "@/components/page-chrome";
import { RESOURCE_FLOOR_LAYOUT } from "@/components/resource-floor-map";
import { StatusPill } from "@/components/ui-primitives";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { postMutation } from "@/lib/client-api";
import type {
  PaymentMethod,
  PricingRule,
  Resource,
  ResourceType,
  Session,
  Visit,
} from "@/lib/domain";
import { PAYMENT_METHOD_LABELS, RESOURCE_TYPE_LABELS } from "@/lib/domain";
import {
  formatSessionWindow,
  getAvailableResources,
  getMemberName,
  getMinutesRemaining,
  getPricingRule,
  getResource,
  getVisit,
  sortPricingRules,
  sortQueueEntries,
  sortSessions,
} from "@/lib/selectors";
import type { SnapshotEnvelope } from "@/lib/snapshot";
import { cn, formatCurrency, formatMinutes } from "@/lib/utils";

type ExtensionDraft = {
  pricingRuleId: string;
  method: PaymentMethod;
};

type QueueWorkItem =
  | {
      kind: "payment";
      id: string;
      visit: Visit;
    }
  | {
      kind: "queue";
      id: string;
      entryId: string;
      status: "ready" | "no_show";
      visit: Visit;
    };
type QueueStatusBadge = "payment" | "ready" | "no_show";

const floorLayoutResourceLabels: Set<string> = new Set(
  RESOURCE_FLOOR_LAYOUT.flatMap((row) => row.flatMap((label) => (label ? [label] : []))),
);

const panelClass = "surface-card rounded-[20px] p-4";
const fieldClass = "toss-select min-h-11 text-[13px]";
const actionButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border px-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
const primaryButtonClass = `${actionButtonClass} border-[color:var(--accent)] bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-strong)]`;
const secondaryButtonClass = `${actionButtonClass} border-[color:var(--line)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--surface)]`;
const dangerButtonClass = `${actionButtonClass} border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100`;
const quietButtonClass = `${actionButtonClass} border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-soft)]`;

function minuteTone(minutes: number) {
  if (minutes <= 0) {
    return "danger" as const;
  }

  if (minutes <= 10) {
    return "warn" as const;
  }

  return "good" as const;
}

function queueLabel(status: QueueStatusBadge) {
  if (status === "payment") {
    return "결제 대기";
  }

  if (status === "ready") {
    return "호출됨";
  }

  if (status === "no_show") {
    return "삭제";
  }

  return "대기";
}

function resourceShortLabel(type: ResourceType) {
  if (type === "pc") {
    return "PC";
  }

  if (type === "nintendo") {
    return "닌텐도";
  }

  if (type === "playstation") {
    return "플스";
  }

  return "공간";
}

function seatClass({
  isActive,
  selected,
  remaining,
}: {
  isActive: boolean;
  selected: boolean;
  remaining?: number;
}) {
  if (selected) {
    return "border-[color:var(--accent)] bg-[color:var(--accent-soft)] ring-2 ring-[color:var(--accent)]";
  }

  if (!isActive) {
    return "border-slate-200 bg-slate-50 text-slate-400";
  }

  if (remaining !== undefined && remaining <= 0) {
    return "border-rose-200 bg-rose-50";
  }

  if (remaining !== undefined && remaining <= 10) {
    return "border-amber-200 bg-amber-50";
  }

  if (remaining !== undefined) {
    return "border-emerald-100 bg-emerald-50";
  }

  return "border-[color:var(--line)] bg-white";
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--line)] bg-white px-4 py-3">
      <div className="text-[12px] text-[color:var(--muted)]">{label}</div>
      <div className="tabular-nums mt-1 text-[24px] font-bold text-[color:var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function SeatActionPopover({
  resource,
  session,
  memberName,
  remaining,
  moveOptions,
  moveTargetId,
  extensionRules,
  extensionDraft,
  onMoveTargetChange,
  onExtensionDraftChange,
  onMove,
  onExtend,
  onEnd,
  onClose,
}: {
  resource: Resource;
  session?: Session;
  memberName?: string;
  remaining?: number;
  moveOptions: Resource[];
  moveTargetId: string;
  extensionRules: PricingRule[];
  extensionDraft: ExtensionDraft;
  onMoveTargetChange: (resourceId: string) => void;
  onExtensionDraftChange: (draft: ExtensionDraft) => void;
  onMove: () => void;
  onExtend: () => void;
  onEnd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-[calc(100%+10px)] z-50 w-[520px] -translate-x-1/2 rounded-[18px] border border-[color:var(--line)] bg-white p-3 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold text-[color:var(--foreground)]">
            {resource.label}
          </div>
          <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">
            {RESOURCE_TYPE_LABELS[resource.type]}
          </div>
        </div>
        <button
          type="button"
          aria-label="좌석 작업 닫기"
          onClick={onClose}
          className="rounded-full border border-[color:var(--line)] p-1.5 text-[color:var(--muted)] hover:bg-[color:var(--surface)]"
        >
          <X className="size-4" />
        </button>
      </div>

      {session ? (
        <div className="mt-3">
          <div className="rounded-[14px] bg-[color:var(--surface)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[18px] font-bold text-[color:var(--foreground)]">
                  {memberName}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                  {formatSessionWindow(session)} · 기본 {formatMinutes(session.plannedMinutes)}
                  · 연장 {formatMinutes(session.extensionMinutes)}
                </div>
              </div>
              <StatusPill tone={minuteTone(remaining ?? 0)}>
                {(remaining ?? 0) > 0 ? `${remaining}분` : "종료"}
              </StatusPill>
            </div>
          </div>

          <div className="mt-3 rounded-[14px] border border-[color:var(--line)] bg-white p-2.5">
            <div className="text-[12px] font-semibold text-[color:var(--muted)]">자리 이동</div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
              <select
                aria-label={`${resource.label} 이동할 자리`}
                value={moveTargetId}
                onChange={(event) => onMoveTargetChange(event.target.value)}
                className={`${fieldClass} w-full`}
              >
                {moveOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!moveTargetId || moveTargetId === session.resourceId}
                onClick={onMove}
                className={secondaryButtonClass}
              >
                <ArrowRightLeft className="size-4" />
                이동
              </button>
            </div>
          </div>

          {extensionRules.length > 0 ? (
            <div className="mt-2 rounded-[14px] border border-[color:var(--line)] bg-white p-2.5">
              <div className="text-[12px] font-semibold text-[color:var(--muted)]">
                시간 연장
              </div>
              <select
                aria-label={`${resource.label} 연장권`}
                value={extensionDraft.pricingRuleId}
                onChange={(event) =>
                  onExtensionDraftChange({
                    ...extensionDraft,
                    pricingRuleId: event.target.value,
                  })
                }
                className={`${fieldClass} mt-2 w-full`}
              >
                {extensionRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.label} · {formatCurrency(rule.amount)}
                  </option>
                ))}
              </select>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                <select
                  aria-label={`${resource.label} 연장 결제 수단`}
                  value={extensionDraft.method}
                  onChange={(event) =>
                    onExtensionDraftChange({
                      ...extensionDraft,
                      method: event.target.value as PaymentMethod,
                    })
                  }
                  className={`${fieldClass} w-full`}
                >
                  {(["cash", "card"] as const).map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={onExtend} className={secondaryButtonClass}>
                  <TimerReset className="size-4" />
                  연장
                </button>
              </div>
            </div>
          ) : null}

          <button type="button" onClick={onEnd} className={`${dangerButtonClass} mt-2 w-full`}>
            <LogOut className="size-4" />
            종료
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-[14px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-3 text-[14px] font-semibold text-[color:var(--foreground)]">
          빈 자리
        </div>
      )}
    </div>
  );
}

export function AdminClient({ initial }: { initial: SnapshotEnvelope }) {
  const { snapshot, refresh } = useLiveSnapshot(initial, 4000);
  const [notice, setNotice] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [startResourceDrafts, setStartResourceDrafts] = useState<Record<string, string>>({});
  const [moveDrafts, setMoveDrafts] = useState<Record<string, string>>({});
  const [extensionDrafts, setExtensionDrafts] = useState<Record<string, ExtensionDraft>>({});
  const [, startTransition] = useTransition();

  const activeSessions = sortSessions(
    snapshot.sessions.filter((session) => session.status === "active"),
  );
  const activeSessionByResource = new Map(
    activeSessions.map((session) => [session.resourceId, session]),
  );
  const effectiveStaff = snapshot.settings.staffRoster[0] ?? "김선생";
  const selectedResource = selectedResourceId ? getResource(snapshot, selectedResourceId) : undefined;
  const selectedIsEmpty =
    selectedResourceId !== null && !activeSessionByResource.has(selectedResourceId);
  const waitingCount = snapshot.queueEntries.filter((entry) => entry.status === "waiting").length;
  const readyCount = snapshot.queueEntries.filter((entry) => entry.status === "ready").length;
  const awaitingPaymentCount = snapshot.visits.filter(
    (visit) => visit.status === "awaiting_payment",
  ).length;
  const endingSoonCount = activeSessions.filter(
    (session) => getMinutesRemaining(session) <= snapshot.settings.endingSoonMinutes,
  ).length;

  const paymentWorkItems: QueueWorkItem[] = snapshot.visits
    .filter((visit) => visit.status === "awaiting_payment")
    .toSorted((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((visit) => ({
      kind: "payment" as const,
      id: `payment-${visit.id}`,
      visit,
    }));
  const queueWorkItems: QueueWorkItem[] = sortQueueEntries(
    snapshot.queueEntries.filter(
      (entry) => entry.status === "ready" || entry.status === "no_show",
    ),
  ).flatMap((entry) => {
    const visit = getVisit(snapshot, entry.visitId);

    if (!visit) {
      return [];
    }

    return [
      {
        kind: "queue" as const,
        id: `queue-${entry.id}`,
        entryId: entry.id,
        status: entry.status as "ready" | "no_show",
        visit,
      },
    ];
  });
  const workItems = [...paymentWorkItems, ...queueWorkItems];
  const waitingEntries = sortQueueEntries(
    snapshot.queueEntries.filter((entry) => entry.status === "waiting"),
  );
  const resourceByLabel = new Map(snapshot.resources.map((resource) => [resource.label, resource]));
  const extraResources = snapshot.resources
    .filter((resource) => !floorLayoutResourceLabels.has(resource.label))
    .toSorted((a, b) => a.order - b.order);

  const runAction = (task: () => Promise<void>, successMessage: string, after?: () => void) => {
    startTransition(async () => {
      try {
        await task();
        after?.();
        setNotice(successMessage);
        refresh();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "작업 처리에 실패했습니다.");
      }
    });
  };

  const getStartResourceId = (key: string, resources: Resource[], resourceType: ResourceType) => {
    const selectedEmptyResource =
      selectedResource &&
      selectedIsEmpty &&
      selectedResource.type === resourceType &&
      resources.some((resource) => resource.id === selectedResource.id)
        ? selectedResource.id
        : undefined;

    return startResourceDrafts[key] ?? selectedEmptyResource ?? resources[0]?.id ?? "";
  };

  const setStartResourceId = (key: string, resourceId: string) => {
    setStartResourceDrafts((current) => ({ ...current, [key]: resourceId }));
  };

  const recordPaymentAndStart = async ({
    visitId,
    amount,
    method,
    resourceId,
    queueEntryId,
  }: {
    visitId: string;
    amount: number;
    method: PaymentMethod;
    resourceId: string;
    queueEntryId?: string;
  }) => {
    await postMutation("recordPayment", {
      visitId,
      amount,
      method,
      phase: "initial",
      staffName: effectiveStaff,
    });

    if (queueEntryId) {
      await postMutation("startSession", {
        queueEntryId,
        resourceId,
        staffName: effectiveStaff,
      });
      return;
    }

    await postMutation("startWalkInSession", {
      visitId,
      resourceId,
      staffName: effectiveStaff,
    });
  };

  const renderSeat = (resource: Resource) => {
    const session = activeSessionByResource.get(resource.id);
    const visit = session ? getVisit(snapshot, session.visitId) : undefined;
    const memberName = visit ? getMemberName(snapshot, visit.memberId) : undefined;
    const remaining = session ? getMinutesRemaining(session) : undefined;
    const selected = selectedResourceId === resource.id;
    const moveOptions = session
      ? snapshot.resources
          .filter((item) => {
            if (item.type !== session.resourceType || !item.isActive) {
              return false;
            }

            const activeSession = activeSessionByResource.get(item.id);
            return !activeSession || activeSession.id === session.id;
          })
          .toSorted((a, b) => a.order - b.order)
      : [];
    const moveTargetId = session && (moveDrafts[session.id] ?? session.resourceId);
    const extensionRules = session
      ? sortPricingRules(snapshot.pricingRules, session.resourceType).filter(
          (item) => item.isExtension,
        )
      : [];
    const extensionDraft =
      session &&
      (extensionDrafts[session.id] ?? {
        pricingRuleId: extensionRules[0]?.id ?? "",
        method: "cash" as const,
      });

    return (
      <div key={resource.id} className={cn("relative", selected && "z-40")}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() =>
            setSelectedResourceId((current) => (current === resource.id ? null : resource.id))
          }
          className={cn(
            "h-[128px] w-full rounded-[16px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
            seatClass({
              isActive: resource.isActive,
              selected,
              remaining,
            }),
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[18px] font-bold text-[color:var(--foreground)]">
              {resource.label}
            </div>
            {session ? (
              <StatusPill tone={minuteTone(remaining ?? 0)}>
                {(remaining ?? 0) > 0 ? `${remaining}분` : "종료"}
              </StatusPill>
            ) : (
              <StatusPill tone="neutral">빈자리</StatusPill>
            )}
          </div>
          {session ? (
            <div className="mt-5">
              <div className="truncate text-[20px] font-bold text-[color:var(--foreground)]">
                {memberName}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                {resourceShortLabel(session.resourceType)} 이용 중
              </div>
            </div>
          ) : (
            <div className="mt-7 text-[14px] font-semibold text-[color:var(--muted)]">
              배정 가능
            </div>
          )}
        </button>

        {selected && session && moveTargetId && extensionDraft ? (
          <SeatActionPopover
            resource={resource}
            session={session}
            memberName={memberName}
            remaining={remaining}
            moveOptions={moveOptions}
            moveTargetId={moveTargetId}
            extensionRules={extensionRules}
            extensionDraft={extensionDraft}
            onMoveTargetChange={(resourceId) =>
              setMoveDrafts((current) => ({
                ...current,
                [session.id]: resourceId,
              }))
            }
            onExtensionDraftChange={(draft) =>
              setExtensionDrafts((current) => ({
                ...current,
                [session.id]: draft,
              }))
            }
            onMove={() =>
              runAction(
                async () => {
                  await postMutation("moveSession", {
                    sessionId: session.id,
                    resourceId: moveTargetId,
                    staffName: effectiveStaff,
                  });
                },
                `${memberName} 자리를 이동했습니다.`,
                () => setSelectedResourceId(moveTargetId),
              )
            }
            onExtend={() =>
              runAction(
                async () => {
                  const rule = snapshot.pricingRules.find(
                    (item) => item.id === extensionDraft.pricingRuleId,
                  );

                  if (!visit || !rule) {
                    throw new Error("연장 정보를 확인해 주세요.");
                  }

                  await postMutation("recordPayment", {
                    visitId: visit.id,
                    amount: rule.amount,
                    method: extensionDraft.method,
                    phase: "extension",
                    staffName: effectiveStaff,
                  });
                  await postMutation("extendSession", {
                    sessionId: session.id,
                    pricingRuleId: extensionDraft.pricingRuleId,
                    staffName: effectiveStaff,
                  });
                },
                `${memberName} 이용 시간을 연장했습니다.`,
              )
            }
            onEnd={() =>
              runAction(
                async () => {
                  await postMutation("endSession", {
                    sessionId: session.id,
                    staffName: effectiveStaff,
                  });
                },
                `${memberName} 세션을 종료했습니다.`,
                () => setSelectedResourceId(null),
              )
            }
            onClose={() => setSelectedResourceId(null)}
          />
        ) : null}

        {selected && !session ? (
          <SeatActionPopover
            resource={resource}
            moveOptions={[]}
            moveTargetId=""
            extensionRules={[]}
            extensionDraft={{ pricingRuleId: "", method: "cash" }}
            onMoveTargetChange={() => undefined}
            onExtensionDraftChange={() => undefined}
            onMove={() => undefined}
            onExtend={() => undefined}
            onEnd={() => undefined}
            onClose={() => setSelectedResourceId(null)}
          />
        ) : null}
      </div>
    );
  };

  return (
    <PageChrome active="admin">
      <div className="min-w-[1180px] space-y-4">
        <header className={panelClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill tone="neutral">관리자</StatusPill>
                <StatusPill tone={initial.meta.mode === "local-sqlite" ? "good" : "warn"}>
                  {initial.meta.mode === "local-sqlite" ? "SQLite 저장" : "데모 메모리"}
                </StatusPill>
              </div>
              <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[color:var(--foreground)]">
                좌석 운영
              </h1>
            </div>
            <div className="grid w-[620px] grid-cols-4 gap-3">
              <StatBox label="결제 대기" value={`${awaitingPaymentCount}`} />
              <StatBox label="호출됨" value={`${readyCount}`} />
              <StatBox label="대기 중" value={`${waitingCount}`} />
              <StatBox label="종료 임박" value={`${endingSoonCount}`} />
            </div>
          </div>
        </header>

        {notice ? (
          <div className="rounded-[14px] border border-[color:var(--line)] bg-[color:var(--accent-soft)] px-4 py-3 text-[14px] font-medium text-[color:var(--foreground)]">
            {notice}
          </div>
        ) : null}

        <main className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className={panelClass}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-[color:var(--accent)]">
                  좌석판
                </div>
                <h2 className="mt-1 text-[20px] font-bold text-[color:var(--foreground)]">
                  실제 배치
                </h2>
              </div>
              <Monitor className="size-5 text-[color:var(--accent)]" />
            </div>

            <div className="mt-4 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--surface)] p-3">
              <div className="space-y-3">
                {RESOURCE_FLOOR_LAYOUT.map((row, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-3">
                    {row.map((label, columnIndex) => {
                      if (!label) {
                        return (
                          <div
                            key={`gap-${rowIndex}-${columnIndex}`}
                            className="h-[128px]"
                            aria-hidden="true"
                          />
                        );
                      }

                      const resource = resourceByLabel.get(label);

                      if (!resource) {
                        return (
                          <div
                            key={label}
                            className="h-[128px] rounded-[16px] border border-dashed border-[color:var(--line)] bg-white/50"
                          />
                        );
                      }

                      return renderSeat(resource);
                    })}
                  </div>
                ))}

                {extraResources.length > 0 ? (
                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-3 border-t border-[color:var(--line)] pt-3">
                    {extraResources.map((resource) => renderSeat(resource))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className={panelClass}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-[color:var(--accent)]">
                    대기 처리
                  </div>
                  <h2 className="mt-1 text-[20px] font-bold text-[color:var(--foreground)]">
                    결제 / 시작
                  </h2>
                </div>
                <RefreshCw className="size-4 text-[color:var(--muted)]" />
              </div>

              <div className="mt-4 space-y-3">
                {workItems.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-3 text-[13px] text-[color:var(--muted)]">
                    처리할 항목 없음
                  </div>
                ) : (
                  workItems.map((item) => {
                    const visit = item.visit;
                    const rule = getPricingRule(snapshot, visit.pricingRuleId);
                    const memberName = getMemberName(snapshot, visit.memberId);
                    const availableResources = getAvailableResources(snapshot, visit.resourceType);
                    const selectedResourceForStart = getStartResourceId(
                      item.id,
                      availableResources,
                      visit.resourceType,
                    );
                    const status = item.kind === "payment" ? item.kind : item.status;
                    const canStart =
                      (item.kind === "payment" || item.status === "ready") &&
                      Boolean(selectedResourceForStart && rule);

                    return (
                      <article
                        key={item.id}
                        className="rounded-[16px] border border-[color:var(--line)] bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[16px] font-bold text-[color:var(--foreground)]">
                              {memberName}
                            </div>
                            <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">
                              {visit.ticketNumber} · {RESOURCE_TYPE_LABELS[visit.resourceType]} ·{" "}
                              {rule?.label ?? "요금제 없음"}
                            </div>
                          </div>
                          <StatusPill tone={status === "no_show" ? "danger" : "good"}>
                            {queueLabel(status)}
                          </StatusPill>
                        </div>

                        {status === "no_show" ? (
                          <button
                            type="button"
                            onClick={() =>
                              runAction(
                                async () => {
                                  if (item.kind !== "queue") {
                                    return;
                                  }

                                  await postMutation("requeueVisit", {
                                    queueEntryId: item.entryId,
                                    staffName: effectiveStaff,
                                  });
                                },
                                `${visit.ticketNumber}를 다시 대기열에 올렸습니다.`,
                              )
                            }
                            className={`${secondaryButtonClass} mt-3 w-full`}
                          >
                            다시 대기
                          </button>
                        ) : (
                          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                            <select
                              aria-label={`${memberName} 배정 자리`}
                              value={selectedResourceForStart}
                              onChange={(event) => setStartResourceId(item.id, event.target.value)}
                              className={fieldClass}
                            >
                              {availableResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.label}
                                </option>
                              ))}
                            </select>
                            {(["cash", "card"] as const).map((method) => (
                              <button
                                key={method}
                                type="button"
                                disabled={!canStart}
                                onClick={() =>
                                  runAction(
                                    async () => {
                                      if (!rule) {
                                        throw new Error("요금제를 확인해 주세요.");
                                      }

                                      await recordPaymentAndStart({
                                        visitId: visit.id,
                                        amount: rule.amount,
                                        method,
                                        resourceId: selectedResourceForStart,
                                        queueEntryId:
                                          item.kind === "queue" ? item.entryId : undefined,
                                      });
                                    },
                                    `${visit.ticketNumber} 결제와 시작을 완료했습니다.`,
                                    () => setSelectedResourceId(selectedResourceForStart),
                                  )
                                }
                                className={primaryButtonClass}
                              >
                                {method === "card" ? <CreditCard className="size-4" /> : null}
                                {PAYMENT_METHOD_LABELS[method]}
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className={panelClass}>
              <div className="text-[12px] font-semibold text-[color:var(--accent)]">
                대기 중
              </div>
              <div className="mt-3 space-y-2">
                {waitingEntries.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-3 text-[13px] text-[color:var(--muted)]">
                    대기 중인 이용자 없음
                  </div>
                ) : (
                  waitingEntries.map((entry) => {
                    const visit = getVisit(snapshot, entry.visitId);

                    if (!visit) {
                      return null;
                    }

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-[14px] border border-[color:var(--line)] bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-bold text-[color:var(--foreground)]">
                            {getMemberName(snapshot, visit.memberId)}
                          </div>
                          <div className="text-[12px] text-[color:var(--muted)]">
                            {RESOURCE_TYPE_LABELS[entry.resourceType]} {entry.position}번째
                          </div>
                        </div>
                        <StatusPill tone="warn">대기</StatusPill>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className={panelClass}>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-[color:var(--line)] bg-white p-3">
                  <div className="text-[12px] text-[color:var(--muted)]">현금</div>
                  <div className="tabular-nums mt-1 text-[18px] font-bold">
                    {formatCurrency(snapshot.report.cashRevenue)}
                  </div>
                </div>
                <div className="rounded-[14px] border border-[color:var(--line)] bg-white p-3">
                  <div className="text-[12px] text-[color:var(--muted)]">카드</div>
                  <div className="tabular-nums mt-1 text-[18px] font-bold">
                    {formatCurrency(snapshot.report.cardRevenue)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  runAction(
                    async () => {
                      await postMutation("resetDemo");
                    },
                    "데이터를 초기 상태로 되돌렸습니다.",
                    () => setSelectedResourceId(null),
                  )
                }
                className={`${quietButtonClass} mt-3 w-full`}
              >
                <CheckCircle2 className="size-4" />
                초기화
              </button>
            </section>
          </aside>
        </main>
      </div>
    </PageChrome>
  );
}
