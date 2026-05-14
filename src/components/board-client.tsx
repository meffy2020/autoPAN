"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Clock3, Megaphone } from "lucide-react";

import { postMutation } from "@/lib/client-api";
import { RESOURCE_TYPE_LABELS } from "@/lib/domain";
import {
  formatSessionWindow,
  getMemberName,
  getMinutesRemaining,
  getVisit,
} from "@/lib/selectors";
import type { SnapshotEnvelope } from "@/lib/snapshot";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { LiveIndicator, StatusPill } from "@/components/ui-primitives";

function toneByMinutes(minutes: number) {
  if (minutes <= 0) {
    return "danger" as const;
  }
  if (minutes <= 10) {
    return "warn" as const;
  }
  return "good" as const;
}

export function BoardClient({ initial }: { initial: SnapshotEnvelope }) {
  const { snapshot, isRefreshing, refresh } = useLiveSnapshot(initial, 3000);
  const speakingIdRef = useRef<string | null>(null);
  const hasPendingAnnouncement = snapshot.ttsEvents.some((event) => !event.deliveredAt);

  const acknowledge = useEffectEvent(async (eventId: string) => {
    await postMutation("ackTtsEvent", {
      eventId,
    });
    refresh();
  });

  useEffect(() => {
    if (speakingIdRef.current) {
      return;
    }

    const nextEvent = snapshot.ttsEvents.find((event) => !event.deliveredAt);

    if (!nextEvent) {
      return;
    }

    speakingIdRef.current = nextEvent.id;

    if (!("speechSynthesis" in window)) {
      void acknowledge(nextEvent.id).finally(() => {
        speakingIdRef.current = null;
      });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(nextEvent.message);
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      void acknowledge(nextEvent.id).finally(() => {
        speakingIdRef.current = null;
      });
    };
    utterance.onerror = () => {
      void acknowledge(nextEvent.id).finally(() => {
        speakingIdRef.current = null;
      });
    };

    window.speechSynthesis.speak(utterance);
  }, [snapshot.ttsEvents]);

  const readyEntries = snapshot.queueEntries.filter((entry) => entry.status === "ready");
  const activeSessions = snapshot.sessions.filter((session) => session.status === "active");
  const readyCountByType = {
    pc: readyEntries.filter((entry) => entry.resourceType === "pc").length,
    nintendo: readyEntries.filter((entry) => entry.resourceType === "nintendo").length,
    playstation: readyEntries.filter((entry) => entry.resourceType === "playstation").length,
  } as const;

  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-4 text-[color:var(--foreground)] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col gap-4">
        <header className="surface-card rounded-[28px] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                PUBLIC BOARD
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">
                  대기 번호와 이용 현황
                </h1>
                <StatusPill tone={hasPendingAnnouncement ? "warn" : "good"}>
                  {hasPendingAnnouncement ? "호출 대기" : "정상 안내"}
                </StatusPill>
              </div>
              <p className="max-w-3xl text-[14px] leading-[22px] text-[color:var(--muted)]">
                입장 가능 번호가 나오면 화면과 음성으로 함께 안내합니다. 멀리서 봐도 바로
                읽히도록 숫자와 상태만 크게 보여줍니다.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2 text-[13px] text-[color:var(--muted-strong)]">
                <Megaphone className="size-4 text-[color:var(--muted)]" />
                {hasPendingAnnouncement ? "안내 대기" : "음성 활성"}
              </div>
              <LiveIndicator label="실시간 갱신" isRefreshing={isRefreshing} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([
              ["pc", readyCountByType.pc],
              ["nintendo", readyCountByType.nintendo],
              ["playstation", readyCountByType.playstation],
            ] as const).map(([resourceType, count]) => (
              <div
                key={resourceType}
                className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-4"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {RESOURCE_TYPE_LABELS[resourceType]}
                </div>
                <div className="tabular-nums mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
                  {count}
                </div>
                <div className="mt-1 text-[13px] text-[color:var(--muted)]">입장 가능</div>
              </div>
            ))}
          </div>
        </header>

        <main className="grid flex-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="surface-card rounded-[28px] p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  CALLING NOW
                </div>
                <h2 className="mt-2 text-[22px] font-bold">입장 가능 번호</h2>
              </div>
              <div className="text-[13px] text-[color:var(--muted)]">{readyEntries.length}건</div>
            </div>

            <div className="mt-5 grid gap-4">
              {readyEntries.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-10 text-center text-lg text-[color:var(--muted)]">
                  현재 호출 중인 번호가 없습니다.
                </div>
              ) : (
                readyEntries.map((entry) => {
                  const visit = getVisit(snapshot, entry.visitId);

                  if (!visit) {
                    return null;
                  }

                  return (
                    <div
                      key={entry.id}
                      className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                          {RESOURCE_TYPE_LABELS[entry.resourceType]}
                        </div>
                        <StatusPill tone="good">입장 가능</StatusPill>
                      </div>
                      <div className="tabular-nums mt-4 text-[clamp(3.8rem,10vw,7.5rem)] font-bold leading-none tracking-tight text-[color:var(--foreground)]">
                        {visit.ticketNumber}
                      </div>
                      <div className="mt-4 text-lg font-semibold text-[color:var(--foreground)]">
                        {getMemberName(snapshot, visit.memberId)}
                      </div>
                      <div className="mt-2 text-[13px] text-[color:var(--muted)]">
                        호출 후 3분 안에 관리자에게 와 주세요.
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="surface-card rounded-[28px] p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  IN USE
                </div>
                <h2 className="mt-2 text-[22px] font-bold">현재 이용 현황</h2>
              </div>
              <div className="text-[13px] text-[color:var(--muted)]">{activeSessions.length}건</div>
            </div>

            <div className="mt-5 grid gap-4">
              {activeSessions.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-10 text-center text-lg text-[color:var(--muted)]">
                  현재 진행 중인 이용이 없습니다.
                </div>
              ) : (
                activeSessions.map((session) => {
                  const visit = getVisit(snapshot, session.visitId);
                  const remaining = getMinutesRemaining(session);

                  return (
                    <div
                      key={session.id}
                      className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                          {RESOURCE_TYPE_LABELS[session.resourceType]}
                        </div>
                        <StatusPill tone={toneByMinutes(remaining)}>
                          {remaining > 0 ? `${remaining}분 남음` : "종료 시간"}
                        </StatusPill>
                      </div>
                      <div className="tabular-nums mt-4 text-[clamp(2.8rem,7vw,5rem)] font-bold leading-none tracking-tight text-[color:var(--foreground)]">
                        {visit?.ticketNumber ?? "-"}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[color:var(--muted)]">
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="size-4 text-[color:var(--muted)]" />
                          {formatSessionWindow(session)}
                        </span>
                        <span>{visit ? getMemberName(snapshot, visit.memberId) : "알 수 없음"}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
