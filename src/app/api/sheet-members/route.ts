import { NextResponse } from "next/server";

import { searchKioskMembersFromSheet } from "@/lib/server/google-sheets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const members = await searchKioskMembersFromSheet(query, 8);

    return NextResponse.json({ ok: true, members });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "사용자DB 시트에서 이용자를 찾지 못했습니다." },
      { status: 500 },
    );
  }
}
