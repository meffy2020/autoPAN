"use client";

import { useEffect, useState, useTransition } from "react";

import type { SnapshotEnvelope } from "@/lib/snapshot";

async function fetchSnapshotEnvelope() {
  const response = await fetch("/api/state", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("상태를 불러오지 못했습니다.");
  }

  return (await response.json()) as SnapshotEnvelope;
}

export function useLiveSnapshot(initial: SnapshotEnvelope, intervalMs = 4000) {
  const [data, setData] = useState(initial);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(async () => {
        try {
          const next = await fetchSnapshotEnvelope();
          setData(next);
        } catch {}
      });
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs]);

  const refresh = () => {
    startTransition(async () => {
      try {
        const next = await fetchSnapshotEnvelope();
        setData(next);
      } catch {}
    });
  };

  return {
    snapshot: data.snapshot,
    meta: data.meta,
    isRefreshing,
    refresh,
  };
}
