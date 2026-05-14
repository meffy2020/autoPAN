import type { ReactNode } from "react";

import { Activity, RadioTower } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold",
        tone === "neutral" &&
          "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted-strong)]",
        tone === "good" &&
          "border-emerald-100 bg-emerald-50 text-emerald-700",
        tone === "warn" &&
          "border-amber-100 bg-amber-50 text-amber-700",
        tone === "danger" &&
          "border-rose-100 bg-rose-50 text-rose-700",
      )}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="surface-card rounded-[20px] p-5">
      <div className="text-[12px] font-medium text-[color:var(--muted)]">{label}</div>
      <div className="tabular-nums mt-3 text-[28px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl space-y-2.5">
      <div className="text-[12px] font-semibold text-[color:var(--accent)]">{eyebrow}</div>
      <h1 className="text-[26px] font-bold tracking-tight text-[color:var(--foreground)] sm:text-[30px]">
        {title}
      </h1>
      {description ? (
        <p className="text-[14px] leading-[22px] text-[color:var(--muted)] sm:text-[16px] sm:leading-6">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function LiveIndicator({
  label,
  isRefreshing,
}: {
  label: string;
  isRefreshing?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-[12px] text-[color:var(--muted)]">
      {isRefreshing ? (
        <Activity className="size-3.5 animate-pulse text-[color:var(--warning)]" />
      ) : (
        <RadioTower className="size-3.5 text-[color:var(--success)]" />
      )}
      <span>{label}</span>
    </div>
  );
}
