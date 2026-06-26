import "server-only";

import { sql } from "drizzle-orm";

const KIOSK_SHEET_LOCK_NAMESPACE = 20260626;
const KIOSK_SHEET_LOCK_ID = 1;

export async function withKioskSheetWriteLock<T>(task: () => Promise<T>) {
  const { db } = await import("@/db");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${KIOSK_SHEET_LOCK_NAMESPACE}, ${KIOSK_SHEET_LOCK_ID})`,
    );

    return task();
  });
}
