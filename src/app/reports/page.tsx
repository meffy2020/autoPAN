import type { ReactNode } from "react";

import { format } from "date-fns";
import { BarChart3, CalendarDays, Clock3, Trophy, Users, WalletCards } from "lucide-react";

import { PageChrome } from "@/components/page-chrome";
import { RESOURCE_TYPE_LABELS } from "@/lib/domain";
import { buildReportsOverview } from "@/lib/reporting";
import { getInitialEnvelope } from "@/lib/server/bootstrap";
import { formatCurrency, formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RESOURCE_COLUMNS = ["pc", "nintendo", "playstation"] as const;

export default function ReportsPage() {
  const { snapshot } = getInitialEnvelope();
  const reports = buildReportsOverview(snapshot);

  return (
    <PageChrome active="reports">
      <main className="space-y-4">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--accent)]">
              <BarChart3 className="size-4" />
              기록
            </div>
            <h1 className="mt-2 text-[30px] font-bold tracking-tight text-[color:var(--foreground)]">
              방문 · 매출 리포트
            </h1>
          </div>
          <div className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-[12px] text-[color:var(--muted)]">
            {format(new Date(snapshot.generatedAt), "yyyy-MM-dd HH:mm")} 기준
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportCard
            icon={Users}
            label="총 방문 인원"
            value={`${reports.totalUniqueVisitors}명`}
            hint={`접수 ${reports.totalVisitCount}건 · 중복 제외`}
          />
          <ReportCard
            icon={WalletCards}
            label="총 매출"
            value={formatCurrency(reports.totalRevenue)}
            hint="현금·카드 결제 합산"
          />
          <ReportCard
            icon={Trophy}
            label="최다 방문"
            value={reports.topMember?.name ?? "-"}
            hint={reports.topMember ? `${reports.topMember.visitCount}회 방문` : "기록 없음"}
          />
          <ReportCard
            icon={Clock3}
            label="많이 온 시간대"
            value={reports.hourlyRows[0]?.label ?? "-"}
            hint={
              reports.hourlyRows[0]
                ? `${reports.hourlyRows[0].uniqueVisitors}명 · 접수 ${reports.hourlyRows[0].visitCount}건`
                : "기록 없음"
            }
          />
        </section>

        <section className="surface-card rounded-[26px] p-5">
          <SectionHeader icon={CalendarDays} title="일별 기록" meta="최근 날짜순" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[13px]">
              <thead className="text-[12px] text-[color:var(--muted)]">
                <tr>
                  <TableHead>날짜</TableHead>
                  <TableHead>방문 인원</TableHead>
                  <TableHead>접수</TableHead>
                  {RESOURCE_COLUMNS.map((type) => (
                    <TableHead key={type}>{RESOURCE_TYPE_LABELS[type]}</TableHead>
                  ))}
                  <TableHead>총매출</TableHead>
                </tr>
              </thead>
              <tbody>
                {reports.dailyRows.slice(0, 14).map((row) => (
                  <tr key={row.date} className="border-t border-[color:var(--line)]">
                    <TableCell strong>{row.date}</TableCell>
                    <TableCell>{row.uniqueVisitors}명</TableCell>
                    <TableCell>{row.visitCount}건</TableCell>
                    {RESOURCE_COLUMNS.map((type) => (
                      <TableCell key={type}>{formatCurrency(row.resourceRevenue[type])}</TableCell>
                    ))}
                    <TableCell strong>{formatCurrency(row.totalRevenue)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="surface-card rounded-[26px] p-5">
            <SectionHeader icon={CalendarDays} title="월별 기록" meta="월 단위 합산" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-[13px]">
                <thead className="text-[12px] text-[color:var(--muted)]">
                  <tr>
                    <TableHead>월</TableHead>
                    <TableHead>방문 인원</TableHead>
                    <TableHead>접수</TableHead>
                    {RESOURCE_COLUMNS.map((type) => (
                      <TableHead key={type}>{RESOURCE_TYPE_LABELS[type]}</TableHead>
                    ))}
                    <TableHead>총매출</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {reports.monthlyRows.map((row) => (
                    <tr key={row.month}>
                      <TableCell strong>{row.month}</TableCell>
                      <TableCell>{row.uniqueVisitors}명</TableCell>
                      <TableCell>{row.visitCount}건</TableCell>
                      {RESOURCE_COLUMNS.map((type) => (
                        <TableCell key={type}>{formatCurrency(row.resourceRevenue[type])}</TableCell>
                      ))}
                      <TableCell strong>{formatCurrency(row.totalRevenue)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="surface-card rounded-[26px] p-5">
            <SectionHeader icon={Clock3} title="시간대" meta="방문 많은 순" />
            <div className="mt-4 space-y-2">
              {reports.hourlyRows.slice(0, 8).map((row) => (
                <div
                  key={row.hour}
                  className="grid grid-cols-[96px_1fr_auto] items-center gap-3 rounded-[16px] border border-[color:var(--line)] bg-white px-4 py-3 text-[13px]"
                >
                  <div className="font-semibold text-[color:var(--foreground)]">{row.label}</div>
                  <div className="text-[color:var(--muted)]">
                    {row.uniqueVisitors}명 · {row.visitCount}건
                  </div>
                  <div className="font-semibold">{formatCurrency(row.totalRevenue)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-card rounded-[26px] p-5">
          <SectionHeader icon={CalendarDays} title="연도별 기록" meta="연 단위 합산" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-[13px]">
              <thead className="text-[12px] text-[color:var(--muted)]">
                <tr>
                  <TableHead>연도</TableHead>
                  <TableHead>방문 인원</TableHead>
                  <TableHead>접수</TableHead>
                  {RESOURCE_COLUMNS.map((type) => (
                    <TableHead key={type}>{RESOURCE_TYPE_LABELS[type]}</TableHead>
                  ))}
                  <TableHead>총매출</TableHead>
                </tr>
              </thead>
              <tbody>
                {reports.yearlyRows.map((row) => (
                  <tr key={row.year}>
                    <TableCell strong>{row.year}</TableCell>
                    <TableCell>{row.uniqueVisitors}명</TableCell>
                    <TableCell>{row.visitCount}건</TableCell>
                    {RESOURCE_COLUMNS.map((type) => (
                      <TableCell key={type}>{formatCurrency(row.resourceRevenue[type])}</TableCell>
                    ))}
                    <TableCell strong>{formatCurrency(row.totalRevenue)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="surface-card rounded-[26px] p-5">
            <SectionHeader icon={Trophy} title="자주 온 학생" meta="전체 기간" />
            <div className="mt-4 space-y-2">
              {reports.topMembers.map((member, index) => (
                <div
                  key={member.memberId}
                  className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-[16px] border border-[color:var(--line)] bg-white px-4 py-3"
                >
                  <div className="flex size-9 items-center justify-center rounded-[12px] bg-[color:var(--surface)] text-[13px] font-bold">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{member.name}</div>
                    <div className="text-[12px] text-[color:var(--muted)]">
                      {member.gradeOrAge} · 최근 {format(new Date(member.lastVisitedAt), "yyyy-MM-dd")}
                    </div>
                  </div>
                  <div className="text-right text-[13px] font-semibold">{member.visitCount}회</div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-[26px] p-5">
            <SectionHeader icon={WalletCards} title="자원별 합계" meta="전체 기간" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {reports.resourceRows.map((row) => (
                <div key={row.resourceType} className="rounded-[18px] border border-[color:var(--line)] bg-white p-4">
                  <div className="text-[13px] font-semibold text-[color:var(--accent)]">
                    {RESOURCE_TYPE_LABELS[row.resourceType]}
                  </div>
                  <div className="mt-3 text-[24px] font-bold tracking-tight">
                    {formatCurrency(row.totalRevenue)}
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-[color:var(--muted)]">
                    접수 {row.visitCount}건 · 이용 {row.sessionCount}건
                    <br />
                    누적 {formatMinutes(row.sessionMinutes)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PageChrome>
  );
}

function ReportCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="surface-card rounded-[22px] p-5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--muted)]">
        <Icon className="size-4 text-[color:var(--accent)]" />
        {label}
      </div>
      <div className="mt-3 truncate text-[28px] font-bold tracking-tight text-[color:var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-[13px] text-[color:var(--muted)]">{hint}</div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: typeof CalendarDays;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[15px] font-bold text-[color:var(--foreground)]">
        <Icon className="size-4 text-[color:var(--accent)]" />
        {title}
      </div>
      <div className="text-[12px] text-[color:var(--muted)]">{meta}</div>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return <th className="border-b border-[color:var(--line)] px-3 py-2 font-semibold">{children}</th>;
}

function TableCell({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={[
        "whitespace-nowrap border-b border-[color:var(--line)] px-3 py-3",
        strong ? "font-semibold text-[color:var(--foreground)]" : "text-[color:var(--muted-strong)]",
      ].join(" ")}
    >
      {children}
    </td>
  );
}
