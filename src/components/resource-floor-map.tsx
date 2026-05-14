import type { Member, Resource, Session, Visit } from "@/lib/domain";

export const RESOURCE_FLOOR_LAYOUT = [
  ["PC-06", "PC-04", "PC-02", null, "NIN-03", "NIN-02", "NIN-01"],
  ["PC-05", "PC-03", "PC-01", null, "NIN-04", "PS-02", "PS-01"],
] as const;

export function toShortLabel(label: string) {
  const [prefix, number] = label.split("-");

  if (prefix === "PC") {
    return `pc ${Number(number)}`;
  }

  if (prefix === "NIN") {
    return `N${Number(number)}`;
  }

  if (prefix === "PS") {
    return `PS${Number(number)}`;
  }

  return label;
}

export function ResourceFloorMap({
  resources,
  sessions,
  visits,
  members,
  showLegend = true,
}: {
  resources: Resource[];
  sessions: Session[];
  visits: Visit[];
  members: Member[];
  showLegend?: boolean;
}) {
  const resourceByLabel = new Map(resources.map((resource) => [resource.label, resource]));
  const sessionByResourceId = new Map(
    sessions
      .filter((session) => session.status === "active")
      .map((session) => [session.resourceId, session]),
  );
  const visitById = new Map(visits.map((visit) => [visit.id, visit]));
  const memberById = new Map(members.map((member) => [member.id, member]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[repeat(7,minmax(0,1fr))]">
        {RESOURCE_FLOOR_LAYOUT.flatMap((row, rowIndex) =>
          row.map((label, columnIndex) => {
            if (!label) {
              return (
                <div
                  key={`gap-${rowIndex}-${columnIndex}`}
                  className="hidden md:block"
                  aria-hidden="true"
                />
              );
            }

            const resource = resourceByLabel.get(label);
            const session = resource ? sessionByResourceId.get(resource.id) : undefined;
            const visit = session ? visitById.get(session.visitId) : undefined;
            const member = visit ? memberById.get(visit.memberId) : undefined;
            const isActive = Boolean(session);
            const isInactive = resource ? !resource.isActive : true;
            const remainingMinutes = session
              ? Math.max(
                  Math.ceil(
                    (new Date(session.endsAt).getTime() - Date.now()) / (1000 * 60),
                  ),
                  0,
                )
              : null;

            return (
              <div
                key={label}
                className={[
                  "rounded-[18px] border px-3 py-4 text-center",
                  isInactive
                    ? "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted)]"
                    : isActive
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--foreground)]"
                      : "border-[color:var(--line)] bg-white text-[color:var(--foreground)]",
                ].join(" ")}
              >
                <div className="text-[18px] font-bold tracking-tight">
                  {toShortLabel(label)}
                </div>
                {isInactive ? (
                  <div className="mt-2 text-[12px] font-medium">미사용</div>
                ) : isActive ? (
                  <div className="mt-2 space-y-1">
                    <div className="truncate text-[12px] font-semibold text-[color:var(--foreground)]">
                      {member?.name ?? "이용 중"}
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--accent)]">
                      {remainingMinutes}분
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] font-medium">비어 있음</div>
                )}
              </div>
            );
          }),
        )}
      </div>

      {showLegend ? (
        <div className="flex flex-wrap gap-2 text-[12px] text-[color:var(--muted)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5">
            <span className="size-2.5 rounded-full bg-[color:var(--accent)]" />
            사용 중
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5">
            <span className="size-2.5 rounded-full bg-[color:var(--surface-soft)]" />
            비어 있음
          </div>
        </div>
      ) : null}
    </div>
  );
}
