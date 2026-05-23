import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  acknowledgeTtsEvent,
  enqueueVisit,
  endSession,
  extendSession,
  getSnapshot,
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
import { appendKioskSubmissionToSheet } from "@/lib/server/google-sheets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: string;
      payload?: unknown;
    };

    let result: unknown;

    switch (body.action) {
      case "enqueueVisit": {
        const payload = enqueueVisitSchema.parse(body.payload);
        const visitResult = enqueueVisit(payload);
        result = visitResult;
        const snapshot = getSnapshot();
        const visit = snapshot.visits.find((item) => item.id === visitResult.visitId);
        const member = visit
          ? snapshot.members.find((item) => item.id === visit.memberId)
          : undefined;
        const pricingRule = snapshot.pricingRules.find(
          (item) => item.id === payload.pricingRuleId,
        );

        if (member) {
          await appendKioskSubmissionToSheet({
            member,
            metadata: payload.sheetMetadata,
            resourceType: payload.resourceType,
            pricingRule,
          });
        }
        break;
      }
      case "registerSpaceVisit": {
        const payload = registerSpaceVisitSchema.parse(body.payload);
        const visitResult = registerSpaceVisit(payload);
        result = visitResult;
        const snapshot = getSnapshot();
        const visit = snapshot.visits.find((item) => item.id === visitResult.visitId);
        const member = visit
          ? snapshot.members.find((item) => item.id === visit.memberId)
          : undefined;

        if (member) {
          await appendKioskSubmissionToSheet({
            member,
            metadata: payload.sheetMetadata,
            resourceType: "space",
          });
        }
        break;
      }
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
      console.error("Mutation validation failed.", error.issues);
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    console.error("Mutation failed.", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
