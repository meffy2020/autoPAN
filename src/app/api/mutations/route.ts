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
  appendKioskSubmissionToSheet,
  getDailyGameSheetUsage,
} from "@/lib/server/google-sheets";
import {
  formatDailyGameLimitMessage,
  getDailyGameLimitViolation,
  isGameResourceType,
  MAX_DAILY_GAME_MINUTES,
} from "@/lib/kiosk-policy";

export const dynamic = "force-dynamic";

let kioskIntakeQueue: Promise<unknown> = Promise.resolve();

function withSerializedKioskIntake<T>(task: () => Promise<T>) {
  const run = kioskIntakeQueue.then(task, task);
  kioskIntakeQueue = run.catch(() => undefined);
  return run;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: string;
      payload?: unknown;
    };

    let result: unknown;

    switch (body.action) {
      case "enqueueVisit": {
        result = await withSerializedKioskIntake(async () => {
          const payload = enqueueVisitSchema.parse(body.payload);
          const snapshotBeforeMutation = getSnapshot();
          const pricingRule = snapshotBeforeMutation.pricingRules.find(
            (item) => item.id === payload.pricingRuleId,
          );

          if (!pricingRule) {
            throw new Error("요금제를 찾을 수 없습니다.");
          }

          const policyMember =
            payload.member ??
            snapshotBeforeMutation.members.find(
              (member) => member.id === payload.existingMemberId,
            );

          if (!policyMember) {
            throw new Error("회원 정보를 입력해 주세요.");
          }

          if (isGameResourceType(payload.resourceType)) {
            const localLimitViolation = getDailyGameLimitViolation({
              state: snapshotBeforeMutation,
              identity: {
                memberId: payload.existingMemberId,
                member: payload.member,
              },
              selectedMinutes: pricingRule.minutes,
            });

            if (localLimitViolation) {
              throw new Error(
                formatDailyGameLimitMessage(
                  localLimitViolation.remainingMinutes,
                ),
              );
            }

            let sheetUsage;

            try {
              sheetUsage = await getDailyGameSheetUsage({
                member: policyMember,
                pricingRules: snapshotBeforeMutation.pricingRules,
              });
            } catch (error) {
              console.error("Daily game sheet usage lookup failed.", error);
              throw new Error(
                "오늘 컴퓨터·닌텐도·플스 이용 시간을 확인하지 못해 접수할 수 없어요. 선생님께 문의해 주세요.",
              );
            }

            if (sheetUsage) {
              const totalMinutes = sheetUsage.minutes + pricingRule.minutes;

              if (totalMinutes > MAX_DAILY_GAME_MINUTES) {
                throw new Error(
                  formatDailyGameLimitMessage(
                    Math.max(MAX_DAILY_GAME_MINUTES - sheetUsage.minutes, 0),
                  ),
                );
              }
            }
          }

          await appendKioskSubmissionToSheet({
            member: policyMember,
            metadata: payload.sheetMetadata,
            resourceType: payload.resourceType,
            pricingRule,
          });

          return enqueueVisit(payload);
        });
        break;
      }
      case "registerSpaceVisit": {
        result = await withSerializedKioskIntake(async () => {
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

          await appendKioskSubmissionToSheet({
            member,
            metadata: payload.sheetMetadata,
            resourceType: "space",
          });

          return registerSpaceVisit(payload);
        });
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
        error:
          error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
