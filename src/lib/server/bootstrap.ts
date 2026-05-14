import type { SnapshotEnvelope } from "@/lib/snapshot";
import {
  getOpeningWindow,
  getSnapshot,
  getRuntimeModeStatus,
} from "@/lib/server/store";

export function getInitialEnvelope(): SnapshotEnvelope {
  return {
    snapshot: getSnapshot(),
    meta: {
      ...getRuntimeModeStatus(),
      ...getOpeningWindow(),
    },
  };
}
