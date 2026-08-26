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
import {
  appendKioskOperationLogSafely,
  appendKioskSubmissionToSheet,
  type KioskOperationLogEntry,
} from "@/lib/server/google-sheets";
import type { ResourceType } from "@/lib/domain";

export const dynamic = "force-dynamic";

type KioskIntakeTiming = {
  action: "enqueueVisit" | "registerSpaceVisit";
  resourceType: ResourceType;
  startedAt: number;
  sheetWriteMs: number;
  localCommitMs: number;
};
const KIOSK_LOGGED_MUTATION_ACTIONS = new Set([
  "enqueueVisit",
  "registerSpaceVisit",
]);

function logKioskIntakeTiming(
  timing: KioskIntakeTiming,
  status: "success" | "failure",
  requestId: string,
) {
  console.info("Kiosk intake timing.", {
    action: timing.action,
    status,
    resourceType: timing.resourceType,
    sheetWriteMs: timing.sheetWriteMs,
    localCommitMs: timing.localCommitMs,
    totalMs: Date.now() - timing.startedAt,
    requestId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPayloadLogMember(
  payload: unknown,
): KioskOperationLogEntry["member"] {
  if (!isRecord(payload) || !isRecord(payload.member)) {
    return undefined;
  }

  const name = typeof payload.member.name === "string" ? payload.member.name : "";
  const guardianPhone =
    typeof payload.member.guardianPhone === "string"
      ? payload.member.guardianPhone
      : "";

  if (!name && !guardianPhone) {
    return undefined;
  }

  return { name, guardianPhone };
}

function getPayloadResourceType(payload: unknown): ResourceType | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const resourceType = payload.resourceType;

  if (
    resourceType === "pc" ||
    resourceType === "nintendo" ||
    resourceType === "playstation" ||
    resourceType === "space"
  ) {
    return resourceType;
  }

  return undefined;
}

function getRequestId(request: Request) {
  return (
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    ""
  );
}

export async function POST(request: Request) {
  let action = "unknown";
  let rawPayload: unknown;
  let operationLogContext: Partial<KioskOperationLogEntry> | null = null;
  let intakeTiming: KioskIntakeTiming | null = null;
  const requestId = getRequestId(request);

  const writeFailureLog = async (message: string) => {
    if (!KIOSK_LOGGED_MUTATION_ACTIONS.has(action)) {
      return;
    }

    await appendKioskOperationLogSafely({
      event: "mutation",
      action,
      status: "failure",
      resourceType:
        operationLogContext?.resourceType ?? getPayloadResourceType(rawPayload),
      sheetTarget: operationLogContext?.sheetTarget,
      member: operationLogContext?.member ?? getPayloadLogMember(rawPayload),
      message,
      requestId,
    });
  };

  try {
    const body = (await request.json()) as {
      action: string;
      payload?: unknown;
    };
    action = typeof body.action === "string" ? body.action : "unknown";
    rawPayload = body.payload;

    let result: unknown;

    switch (action) {
      case "enqueueVisit": {
        const timing: KioskIntakeTiming = {
          action: "enqueueVisit",
          resourceType: "pc",
          startedAt: Date.now(),
          sheetWriteMs: 0,
          localCommitMs: 0,
        };
        intakeTiming = timing;
        const payload = enqueueVisitSchema.parse(body.payload);
        timing.resourceType = payload.resourceType;
        const snapshotBeforeMutation = getSnapshot();
        const pricingRule = snapshotBeforeMutation.pricingRules.find(
          (item) => item.id === payload.pricingRuleId,
        );

        if (!pricingRule) {
          throw new Error("요금제를 찾을 수 없습니다.");
        }

        if (pricingRule.resourceType !== payload.resourceType) {
          throw new Error("선택한 자원과 요금제가 맞지 않습니다.");
        }

        const policyMember =
          payload.member ??
          snapshotBeforeMutation.members.find(
            (member) => member.id === payload.existingMemberId,
          );

        if (!policyMember) {
          throw new Error("회원 정보를 입력해 주세요.");
        }
        operationLogContext = {
          event: "mutation",
          action,
          resourceType: payload.resourceType,
          member: policyMember,
          requestId,
        };

        const sheetWriteStartedAt = Date.now();
        let sheetTarget;

        try {
          sheetTarget = await appendKioskSubmissionToSheet(
            {
              member: policyMember,
              metadata: payload.sheetMetadata,
              resourceType: payload.resourceType,
              pricingRule,
            },
            { pricingRules: snapshotBeforeMutation.pricingRules },
          );
        } finally {
          timing.sheetWriteMs = Date.now() - sheetWriteStartedAt;
        }
        operationLogContext = {
          ...operationLogContext,
          sheetTarget: sheetTarget ?? undefined,
        };

        const localCommitStartedAt = Date.now();
        result = enqueueVisit({
          ...payload,
          skipLocalDailyGameLimitCheck: Boolean(sheetTarget),
        });
        timing.localCommitMs = Date.now() - localCommitStartedAt;
        logKioskIntakeTiming(timing, "success", requestId);
        intakeTiming = null;
        break;
      }
      case "registerSpaceVisit": {
        const timing: KioskIntakeTiming = {
          action: "registerSpaceVisit",
          resourceType: "space",
          startedAt: Date.now(),
          sheetWriteMs: 0,
          localCommitMs: 0,
        };
        intakeTiming = timing;
        const payload = registerSpaceVisitSchema.parse(body.payload);
        const snapshotBeforeMutation = getSnapshot();
        const member =
          payload.member ??
          snapshotBeforeMutation.members.find(
            (item) => item.id === payload.existingMemberId,
          );

        if (!member) {
          throw new Error("회원 정보를 입력해 주세요.");
        }
        operationLogContext = {
          event: "mutation",
          action,
          resourceType: "space",
          member,
          requestId,
        };

        const sheetWriteStartedAt = Date.now();
        let sheetTarget;

        try {
          sheetTarget = await appendKioskSubmissionToSheet({
            member,
            metadata: payload.sheetMetadata,
            resourceType: "space",
          });
        } finally {
          timing.sheetWriteMs = Date.now() - sheetWriteStartedAt;
        }
        operationLogContext = {
          ...operationLogContext,
          sheetTarget: sheetTarget ?? undefined,
        };

        const localCommitStartedAt = Date.now();
        result = registerSpaceVisit(payload);
        timing.localCommitMs = Date.now() - localCommitStartedAt;
        logKioskIntakeTiming(timing, "success", requestId);
        intakeTiming = null;
        break;
      }
      case "recordPayment":
        result = recordPayment(recordPaymentSchema.parse(body.payload));
        break;
      case "startSession":
        result = startSession(startSessionSchema.parse(body.payload));
        break;
      case "startWalkInSession":
        result = startWalkInSession(
          startWalkInSessionSchema.parse(body.payload),
        );
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
    if (intakeTiming) {
      logKioskIntakeTiming(intakeTiming, "failure", requestId);
      intakeTiming = null;
    }

    if (error instanceof ZodError) {
      console.error("Mutation validation failed.", error.issues);
      await writeFailureLog(
        error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
      );
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    console.error("Mutation failed.", error);
    await writeFailureLog(
      error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
