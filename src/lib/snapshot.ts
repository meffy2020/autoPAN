import type { SystemSnapshot } from "@/lib/domain";

export interface SnapshotEnvelope {
  snapshot: SystemSnapshot;
  meta: {
    mode: "demo" | "local-sqlite" | "local-postgres";
    storage?: "memory" | "sqlite";
    hasDatabaseUrl: boolean;
    sqlitePath?: string;
    opensAt: string;
    closesAt: string;
  };
}
