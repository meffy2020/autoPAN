import { NextResponse } from "next/server";

import { getOpeningWindow, getRuntimeModeStatus, getSnapshot } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    snapshot: getSnapshot(),
    meta: {
      ...getRuntimeModeStatus(),
      ...getOpeningWindow(),
    },
  });
}
