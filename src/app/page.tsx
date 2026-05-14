import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  Gamepad2,
  LayoutGrid,
  Monitor,
  RadioTower,
  Sparkles,
} from "lucide-react";

import { PageChrome } from "@/components/page-chrome";
import { ResourceFloorMap } from "@/components/resource-floor-map";
import { StatusPill } from "@/components/ui-primitives";
import { RESOURCE_TYPE_LABELS } from "@/lib/domain";
import {
  getMemberName,
  getVisit,
  sortQueueEntries,
  sortSessions,
} from "@/lib/selectors";
import { getInitialEnvelope } from "@/lib/server/bootstrap";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  {
    key: "home",
    title: "대시보드",
    body: "운영 현황",
    href: "/",
    icon: LayoutGrid,
  },
  {
    key: "kiosk",
    title: "키오스크",
    body: "학생 접수",
    href: "/kiosk",
    icon: Monitor,
  },
  {
    key: "admin",
    title: "관리자",
    body: "결제 · 배정",
    href: "/admin",
    icon: CreditCard,
  },
  {
    key: "reports",
    title: "기록",
    body: "매출 · 방문",
    href: "/reports",
    icon: BarChart3,
  },
] as const;

export default function Home() {
  const { snapshot, meta } = getInitialEnvelope();
  const activeSessions = sortSessions(
    snapshot.sessions.filter((session) => session.status === "active"),
  );
  const queueEntries = sortQueueEntries(
    snapshot.queueEntries.filter((entry) => entry.status === "ready" || entry.status === "waiting"),
  );

  return (
    <PageChrome active="home" compact>
      <main className="grid gap-5 2xl:grid-cols-[240px_minmax(0,1fr)_360px] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="surface-card rounded-[30px] p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-[16px] bg-[color:var(--foreground)] text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="text-[28px] font-bold tracking-tight text-[color:var(--foreground)]">
                PAN
              </div>
              <div className="text-[12px] text-[color:var(--muted)]">NOLDA</div>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === "home";

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={[
                    "flex items-center gap-3 rounded-[18px] px-4 py-3 transition",
                    isActive
                      ? "bg-[color:var(--surface)] text-[color:var(--foreground)]"
                      : "text-[color:var(--muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--foreground)]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex size-10 items-center justify-center rounded-[14px]",
                      isActive
                        ? "bg-[color:var(--foreground)] text-white"
                        : "bg-[color:var(--surface-soft)] text-[color:var(--muted)]",
                    ].join(" ")}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{item.title}</div>
                    <div className="text-[12px]">{item.body}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 rounded-[22px] bg-[color:var(--surface)] p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--accent)]">
              <RadioTower className="size-4" />
              {meta.mode === "demo" ? "demo" : "live"}
            </div>
            <div className="mt-3 text-[14px] font-semibold text-[color:var(--foreground)]">
              운영 화면 연결됨
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--muted)]">
              키오스크 · 관리자 · 대기보드
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <section className="surface-card rounded-[34px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold text-[color:var(--accent)]">오늘 매출</div>
                <h1 className="mt-3 text-[34px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[42px]">
                  {formatCurrency(snapshot.report.totalRevenue)}
                </h1>
                <div className="mt-2 text-[14px] text-[color:var(--muted)]">현금 {formatCurrency(snapshot.report.cashRevenue)} · 카드 {formatCurrency(snapshot.report.cardRevenue)}</div>
              </div>

              <div className="grid min-w-[240px] gap-3 sm:grid-cols-3">
                <MetricCard label="세션" value={`${activeSessions.length}`} tone="purple" />
                <MetricCard label="대기" value={`${queueEntries.length}`} tone="blue" />
                <MetricCard label="오늘 방문" value={`${snapshot.report.uniqueVisitors}명`} tone="mint" />
              </div>
            </div>
          </section>

          <section className="surface-card rounded-[30px] p-6">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--foreground)]">
              <Gamepad2 className="size-4 text-[color:var(--accent)]" />
              실제 배치
            </div>

            <div className="mt-5">
              <ResourceFloorMap
                resources={snapshot.resources}
                sessions={snapshot.sessions}
                visits={snapshot.visits}
                members={snapshot.members}
              />
            </div>
          </section>
        </section>

        <aside className="space-y-5">
          <section className="surface-card rounded-[30px] bg-[#fbfbfb] p-5">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-semibold text-[color:var(--foreground)]">대기</div>
              <StatusPill tone="neutral">{queueEntries.length}</StatusPill>
            </div>

            <div className="mt-4 space-y-3">
              {queueEntries.length === 0 ? (
                <div className="rounded-[20px] border border-[color:var(--line)] bg-white p-4 text-[13px] text-[color:var(--muted)]">
                  없음
                </div>
              ) : (
                queueEntries.slice(0, 5).map((entry, index) => {
                  const visit = getVisit(snapshot, entry.visitId);
                  const memberName = visit ? getMemberName(snapshot, visit.memberId) : "-";

                  return (
                    <div
                      key={entry.id}
                      className="rounded-[22px] border border-[color:var(--line)] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex size-9 items-center justify-center rounded-[12px] text-[13px] font-semibold text-white"
                            style={{
                              background: ["#73c7d8", "#c987ff", "#ffb84d", "#8d90f8", "#71d39a"][index % 5],
                            }}
                          >
                            {memberName.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold text-[color:var(--foreground)]">
                              {memberName}
                            </div>
                            <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                              {RESOURCE_TYPE_LABELS[entry.resourceType]}
                            </div>
                          </div>
                        </div>
                        <div className="text-[12px] text-[color:var(--muted)]">
                          {entry.position}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <Link
            href="/admin"
            className="flex items-center justify-between rounded-[24px] bg-[color:var(--foreground)] px-5 py-4 text-white transition hover:opacity-90"
          >
            <div>
              <div className="text-[14px] font-semibold">관리자 열기</div>
              <div className="mt-1 text-[12px] text-white/70">결제 · 배정 · 시작</div>
            </div>
            <ArrowRight className="size-4" />
          </Link>
        </aside>
      </main>
    </PageChrome>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "purple" | "blue" | "mint";
}) {
  const tones = {
    purple: { background: "#f7f2ff", color: "#8d90f8" },
    blue: { background: "#f3f8ff", color: "#73c7d8" },
    mint: { background: "#f4fcf6", color: "#71d39a" },
  } as const;

  return (
    <div className="rounded-[24px] p-4" style={{ background: tones[tone].background }}>
      <div className="text-[12px] font-medium text-[color:var(--muted)]">{label}</div>
      <div className="mt-3 text-[24px] font-bold tracking-tight" style={{ color: tones[tone].color }}>
        {value}
      </div>
    </div>
  );
}
