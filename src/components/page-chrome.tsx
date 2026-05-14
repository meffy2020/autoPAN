"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

type SurfaceKey = "home" | "kiosk" | "admin" | "reports";

const SURFACES: Array<{
  key: SurfaceKey;
  href: string;
  label: string;
  summary: string;
}> = [
  { key: "home", href: "/", label: "대시보드", summary: "오늘 현황" },
  { key: "kiosk", href: "/kiosk", label: "키오스크", summary: "학생 접수" },
  { key: "admin", href: "/admin", label: "관리자", summary: "운영 처리" },
  { key: "reports", href: "/reports", label: "기록", summary: "매출·방문 분석" },
];

export function PageChrome({
  active,
  compact = false,
  children,
}: {
  active: SurfaceKey;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-4 text-[color:var(--foreground)] sm:px-6">
      <div className="flex w-full flex-col gap-4">
        {compact ? null : (
          <nav className="grid gap-2 sm:grid-cols-4">
            {SURFACES.map((surface) => {
              const isActive = surface.key === active;

              return (
                <Link
                  key={surface.key}
                  href={surface.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-[18px] border px-4 py-3 transition",
                    isActive
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--foreground)]"
                      : "border-[color:var(--line)] bg-white text-[color:var(--foreground)] hover:bg-[color:var(--surface)]",
                  )}
                >
                  <div>
                    <div className="text-[14px] font-semibold">{surface.label}</div>
                    <div className="mt-1 text-[12px] text-[color:var(--muted)]">
                      {surface.summary}
                    </div>
                  </div>
                  <ArrowRight className="size-4" />
                </Link>
              );
            })}
          </nav>
        )}

        {children}
      </div>
    </div>
  );
}
