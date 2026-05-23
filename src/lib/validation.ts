import { z } from "zod";

import {
  ANNOUNCEMENT_MODES,
  PAYMENT_METHODS,
  RESOURCE_TYPES,
} from "@/lib/domain";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = 1990;

export const kioskGenderSchema = z.enum(["male", "female"]);

export const kioskSheetMetadataSchema = z.object({
  schoolName: z.string().trim().max(40, "학교명은 40자 이하로 입력해 주세요.").optional(),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일을 다시 확인해 주세요.")
    .optional(),
  gender: kioskGenderSchema.optional(),
  spaceDetail: z.string().trim().max(40, "공간 이용 항목을 다시 확인해 주세요.").optional(),
});

export const memberInputSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요."),
  gradeOrAge: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "출생연도 4자리를 입력해 주세요.")
    .refine((value) => {
      const year = Number(value);
      return year >= MIN_BIRTH_YEAR && year <= CURRENT_YEAR;
    }, "출생연도를 다시 확인해 주세요."),
  guardianPhone: z
    .string()
    .trim()
    .min(8, "보호자 연락처를 입력해 주세요.")
    .max(20, "연락처 길이가 너무 깁니다."),
  notes: z.string().trim().max(120, "메모는 120자 이하로 입력해 주세요.").optional(),
});

export const enqueueVisitSchema = z.object({
  existingMemberId: z.string().trim().optional(),
  member: memberInputSchema.optional(),
  resourceType: z.enum(RESOURCE_TYPES),
  pricingRuleId: z.string().trim().min(1),
  note: z.string().trim().max(120).optional(),
  sheetMetadata: kioskSheetMetadataSchema.optional(),
});

export const registerSpaceVisitSchema = z.object({
  existingMemberId: z.string().trim().optional(),
  member: memberInputSchema.optional(),
  note: z.string().trim().max(120).optional(),
  sheetMetadata: kioskSheetMetadataSchema.optional(),
});

export const recordPaymentSchema = z.object({
  visitId: z.string().trim().min(1),
  amount: z.coerce.number().int().positive(),
  method: z.enum(PAYMENT_METHODS),
  phase: z.enum(["initial", "extension", "adjustment"]).default("initial"),
  staffName: z.string().trim().min(1),
});

export const startSessionSchema = z.object({
  queueEntryId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const startWalkInSessionSchema = z.object({
  visitId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const extendSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  pricingRuleId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const endSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const moveSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const queueActionSchema = z.object({
  queueEntryId: z.string().trim().min(1),
  staffName: z.string().trim().min(1),
});

export const updateSettingsSchema = z.object({
  announcementMode: z.enum(ANNOUNCEMENT_MODES),
  readyGraceMinutes: z.coerce.number().int().min(1).max(20),
  endingSoonMinutes: z.coerce.number().int().min(1).max(30),
  staffRoster: z.array(z.string().trim().min(1)).min(1).max(12),
});

export const ackTtsEventSchema = z.object({
  eventId: z.string().trim().min(1),
});
