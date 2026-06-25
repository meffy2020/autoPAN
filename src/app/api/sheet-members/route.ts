import { NextResponse } from "next/server";

import {
  appendKioskOperationLogSafely,
  searchKioskMembersFromSheet,
} from "@/lib/server/google-sheets";

export const dynamic = "force-dynamic";

function getRequestId(request: Request) {
  return (
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    ""
  );
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  let query = "";

  try {
    const { searchParams } = new URL(request.url);
    query = searchParams.get("q") ?? "";
    const members = await searchKioskMembersFromSheet(query, 8);

    await appendKioskOperationLogSafely({
      event: "memberSearch",
      action: "GET /api/sheet-members",
      status: "success",
      searchQuery: query,
      resultCount: members.length,
      message: "이용자 검색 완료",
      requestId,
    });

    return NextResponse.json({ ok: true, members });
  } catch (error) {
    console.error(error);
    await appendKioskOperationLogSafely({
      event: "memberSearch",
      action: "GET /api/sheet-members",
      status: "failure",
      searchQuery: query,
      message:
        error instanceof Error
          ? error.message
          : "사용자DB 시트에서 이용자를 찾지 못했습니다.",
      requestId,
    });

    return NextResponse.json(
      { ok: false, error: "사용자DB 시트에서 이용자를 찾지 못했습니다." },
      { status: 500 },
    );
  }
}
