import "server-only";

import { google } from "googleapis";

import type { PricingRule, ResourceType } from "@/lib/domain";
import { RESOURCE_TYPE_LABELS } from "@/lib/domain";
import type { MemberInput } from "@/lib/server/state";

export type KioskSheetMetadata = {
  schoolName?: string;
  birthDate?: string;
  gender?: "male" | "female";
};

type KioskSheetSubmission = {
  member: Pick<MemberInput, "name" | "gradeOrAge" | "guardianPhone">;
  metadata?: KioskSheetMetadata;
  resourceType: ResourceType;
  pricingRule?: Pick<PricingRule, "amount" | "label" | "minutes">;
};

const TAB_NAMES: Record<ResourceType, string> = {
  pc: "컴퓨터",
  nintendo: "닌텐도",
  playstation: "플스",
  space: "무료",
};

function getSheetsConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SHEETS_PRIVATE_KEY);

  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    spreadsheetId,
    clientEmail,
    privateKey,
  };
}

function normalizePrivateKey(value?: string) {
  if (!value) {
    return "";
  }

  let key = value.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").trim();

  if (!key.includes("BEGIN PRIVATE KEY")) {
    try {
      key = Buffer.from(key, "base64").toString("utf8").replace(/\\n/g, "\n").trim();
    } catch {}
  }

  return key;
}

function formatDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function parseBirthYear(value?: string) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function getKoreanAge(birthDate?: string, gradeOrAge?: string) {
  const birthYear = parseBirthYear(birthDate) ?? parseBirthYear(gradeOrAge);
  if (!birthYear) {
    return null;
  }

  return new Date().getFullYear() - birthYear + 1;
}

function buildAgeGenderColumns(submission: KioskSheetSubmission) {
  const values = Array.from({ length: 10 }, () => "");
  const gender = submission.metadata?.gender;
  const age = getKoreanAge(submission.metadata?.birthDate, submission.member.gradeOrAge);

  if (!gender || !age) {
    return values;
  }

  const genderOffset = gender === "male" ? 0 : 1;
  let categoryOffset: number;

  if (age <= 7) {
    categoryOffset = 0;
  } else if (age <= 13) {
    categoryOffset = 2;
  } else if (age <= 16) {
    categoryOffset = 4;
  } else if (age <= 19) {
    categoryOffset = 6;
  } else {
    categoryOffset = 8;
  }

  values[categoryOffset + genderOffset] = "O";
  return values;
}

export async function appendKioskSubmissionToSheet(submission: KioskSheetSubmission) {
  const config = getSheetsConfig();

  if (!config) {
    console.warn("Google Sheets env vars are missing. Skipping kiosk sheet append.");
    return;
  }

  const { date, time } = formatDateParts();
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = TAB_NAMES[submission.resourceType];
  const birthDate = submission.metadata?.birthDate ?? submission.member.gradeOrAge;
  const row = [
    date,
    time,
    submission.member.name,
    submission.metadata?.schoolName ?? "",
    birthDate,
    ...buildAgeGenderColumns(submission),
    submission.member.guardianPhone,
    RESOURCE_TYPE_LABELS[submission.resourceType],
    submission.pricingRule?.amount ?? 0,
    "",
    "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `'${tabName}'!A:T`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });
}
