import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  acknowledgeTtsEvent,
  enqueueVisit,
  endSession,
  extendSession,
  manualCallQueueEntry,
  markNoShow,
  moveSession,
  recordPayment,
  registerSpaceVisit,
  requeueVisit,
  resetDemoState,
  startSession,
  startWalkInSession,
  updateSettings,
} from "@/lib/server/store";
import {
  ackTtsEventSchema,
  enqueueVisitSchema,
  endSessionSchema,
  extendSessionSchema,
  moveSessionSchema,
  queueActionSchema,
  recordPaymentSchema,
  registerSpaceVisitSchema,
  startSessionSchema,
  startWalkInSessionSchema,
  updateSettingsSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: string;
      payload?: unknown;
    };

    let result: unknown;

    switch (body.action) {
      case "enqueueVisit":
        result = enqueueVisit(enqueueVisitSchema.parse(body.payload));
        break;
      case "registerSpaceVisit":
        result = registerSpaceVisit(registerSpaceVisitSchema.parse(body.payload));
        break;
      case "recordPayment":
        result = recordPayment(recordPaymentSchema.parse(body.payload));
        break;
      case "startSession":
        result = startSession(startSessionSchema.parse(body.payload));
        break;
      case "startWalkInSession":
        result = startWalkInSession(startWalkInSessionSchema.parse(body.payload));
        break;
      case "extendSession":
        result = extendSession(extendSessionSchema.parse(body.payload));
        break;
      case "endSession":
        result = endSession(endSessionSchema.parse(body.payload));
        break;
      case "moveSession":
        result = moveSession(moveSessionSchema.parse(body.payload));
        break;
      case "manualCall":
        result = manualCallQueueEntry(queueActionSchema.parse(body.payload));
        break;
      case "markNoShow":
        result = markNoShow(queueActionSchema.parse(body.payload));
        break;
      case "requeueVisit":
        result = requeueVisit(queueActionSchema.parse(body.payload));
        break;
      case "updateSettings":
        result = updateSettings(updateSettingsSchema.parse(body.payload));
        break;
      case "ackTtsEvent":
        result = acknowledgeTtsEvent(ackTtsEventSchema.parse(body.payload));
        break;
      case "resetDemo":
        result = resetDemoState();
        break;
      default:
        return NextResponse.json(
          { error: "지원하지 않는 작업입니다." },
          { status: 400 },
        );
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
