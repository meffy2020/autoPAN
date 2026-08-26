import "server-only";

import { google } from "googleapis";

import type { Member, PricingRule, ResourceType } from "@/lib/domain";
import {
  formatDailyGameLimitMessage,
  isGameResourceType,
} from "@/lib/kiosk-policy";
import {
  getKioskRedis,
  withKioskRedisLock,
} from "@/lib/server/kiosk-redis";
import type { MemberInput } from "@/lib/server/state";

export type KioskSheetMetadata = {
  schoolName?: string;
  birthDate?: string;
  gender?: "male" | "female";
  spaceDetail?: string;
};

type KioskSheetSubmission = {
  member: Pick<MemberInput, "name" | "gradeOrAge" | "guardianPhone">;
  metadata?: KioskSheetMetadata;
  resourceType: ResourceType;
  pricingRule?: Pick<PricingRule, "amount" | "label" | "minutes">;
};
type KioskSubmissionSheetCell = string | number | null;
type KioskSubmissionWriteRequest = {
  tabName: string;
  todayLabel: string;
  resourceType: ResourceType;
  row: KioskSubmissionSheetCell[];
  gameLimit?: {
    memberName: string;
    guardianPhone: string;
    requestedMinutes: number;
    pricingRules: Array<{
      resourceType: (typeof GAME_SHEET_RESOURCE_TYPES)[number];
      amount: number;
      minutes: number;
    }>;
  };
};

export type KioskSheetWriteTarget = {
  tabName: string;
  rowNumber: number;
  resourceType: ResourceType;
};

type KioskSheetLockTiming = {
  lockWaitMs?: number;
  policyReadMs?: number;
  gameSegmentCursorHits?: number;
  scanMs?: number;
  writeMs?: number;
  totalMs?: number;
  cursorHit?: number;
};

export type KioskSheetMember = {
  id: string;
  name: string;
  schoolName?: string;
  birthDate?: string;
  gradeOrAge: string;
  gender?: "male" | "female";
  guardianPhone: string;
};

const TAB_NAMES: Record<ResourceType, string> = {
  pc: "컴퓨터",
  nintendo: "닌텐도",
  playstation: "플스",
  space: "무료콘텐츠",
};
const DEFAULT_OPERATION_LOG_TAB_NAME = "운영로그";
const OPERATION_LOG_HEADERS = [
  "일시",
  "ISO시각",
  "이벤트",
  "작업",
  "상태",
  "자원",
  "대상시트",
  "대상행",
  "이름",
  "연락처",
  "검색어",
  "결과수",
  "메시지",
  "요청ID",
];

const TAB_ENV_NAMES: Record<ResourceType, string> = {
  pc: "GOOGLE_SHEETS_PC_TAB_NAME",
  nintendo: "GOOGLE_SHEETS_NINTENDO_TAB_NAME",
  playstation: "GOOGLE_SHEETS_PLAYSTATION_TAB_NAME",
  space: "GOOGLE_SHEETS_FREE_TAB_NAME",
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
      key = Buffer.from(key, "base64")
        .toString("utf8")
        .replace(/\\n/g, "\n")
        .trim();
    } catch {}
  }

  return key;
}

function getTabName(resourceType: ResourceType) {
  return (
    process.env[TAB_ENV_NAMES[resourceType]]?.trim() || TAB_NAMES[resourceType]
  );
}

function getOperationLogTabName() {
  return (
    process.env.GOOGLE_SHEETS_OPERATION_LOG_TAB_NAME?.trim() ||
    DEFAULT_OPERATION_LOG_TAB_NAME
  );
}

function getKioskLockConfig() {
  const url = process.env.GOOGLE_SHEETS_KIOSK_LOCK_URL?.trim();

  if (!url) {
    return null;
  }

  const secret = process.env.GOOGLE_SHEETS_KIOSK_LOCK_SECRET?.trim();

  if (!secret) {
    throw new Error("GOOGLE_SHEETS_KIOSK_LOCK_SECRET is required.");
  }

  return { url, secret };
}

function normalizeKioskSheetLockTiming(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const readDuration = (key: keyof KioskSheetLockTiming) => {
    const duration = Number(input[key]);

    return Number.isFinite(duration) && duration >= 0
      ? Math.round(duration)
      : undefined;
  };
  const timing: KioskSheetLockTiming = {
    lockWaitMs: readDuration("lockWaitMs"),
    policyReadMs: readDuration("policyReadMs"),
    gameSegmentCursorHits: readDuration("gameSegmentCursorHits"),
    scanMs: readDuration("scanMs"),
    writeMs: readDuration("writeMs"),
    totalMs: readDuration("totalMs"),
    cursorHit: readDuration("cursorHit"),
  };

  return Object.values(timing).some((duration) => duration !== undefined)
    ? timing
    : undefined;
}

const GAME_SHEET_RESOURCE_TYPES = [
  "pc",
  "nintendo",
  "playstation",
] as const satisfies ResourceType[];
const SHEET_NAME_COLUMN_INDEX = 2;
const SHEET_PHONE_COLUMN_INDEX = 14;
const SHEET_PC_AMOUNT_COLUMN_INDEX = 16;
const SHEET_RENTAL_AMOUNT_COLUMN_INDEX = 17;

export type DailyGameSheetUsage = {
  minutes: number;
  rows: Array<{
    resourceType: (typeof GAME_SHEET_RESOURCE_TYPES)[number];
    rowNumber: number;
    amount: number;
    minutes: number;
  }>;
};

function getSheetRange(tabName: string, range: string) {
  return `'${tabName.replace(/'/g, "''")}'!${range}`;
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

function normalizeSearch(value?: string) {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizePhone(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

function cell(row: string[], index: number) {
  return String(row[index] ?? "").trim();
}

function toBirthYear(value?: string) {
  const match = (value ?? "").match(/^(\d{4})/);
  return match?.[1] ?? "";
}

function toBirthDate(value?: string) {
  const normalized = (value ?? "").replace(/\D/g, "");

  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }

  if (/^\d{6}$/.test(normalized)) {
    const yearPrefix =
      Number(normalized.slice(0, 2)) <= new Date().getFullYear() % 100
        ? "20"
        : "19";
    return `${yearPrefix}${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 6)}`;
  }

  return "";
}

function findColumnIndex(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeSearch);
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeSearch(header);

    if (!normalizedHeader) {
      return false;
    }

    return normalizedCandidates.some(
      (candidate) =>
        normalizedHeader === candidate || normalizedHeader.includes(candidate),
    );
  });
}

function getGenderFromAgeColumns(row: string[]) {
  const markers = row.slice(4, 14).map((value) => normalizeSearch(value));
  const maleIndexes = [0, 2, 4, 6, 8];
  const femaleIndexes = [1, 3, 5, 7, 9];

  if (maleIndexes.some((index) => Boolean(markers[index]))) {
    return "male";
  }

  if (femaleIndexes.some((index) => Boolean(markers[index]))) {
    return "female";
  }

  return undefined;
}

function toGender(value?: string) {
  const normalized = normalizeSearch(value);

  if (
    normalized === "남" ||
    normalized === "남자" ||
    normalized === "male" ||
    normalized === "m"
  ) {
    return "male";
  }

  if (
    normalized === "여" ||
    normalized === "여자" ||
    normalized === "female" ||
    normalized === "f"
  ) {
    return "female";
  }

  return undefined;
}

function toAppendLayoutMember(
  row: string[],
  index: number,
): KioskSheetMember | null {
  const name = cell(row, 2);
  const guardianPhone =
    row.findLast((value) => /^01\d{8,9}$/.test(normalizePhone(value))) ??
    cell(row, 14);

  if (!name || !guardianPhone) {
    return null;
  }

  const birthDate = row.slice(4, 14).map(toBirthDate).find(Boolean) ?? "";

  return {
    id: `member-${normalizePhone(guardianPhone) || index}-${normalizeSearch(name)}`,
    name,
    schoolName: cell(row, 3) || undefined,
    birthDate: birthDate || undefined,
    gradeOrAge: toBirthYear(birthDate),
    gender: getGenderFromAgeColumns(row),
    guardianPhone,
  };
}

function formatBirthForSheet(value?: string) {
  const normalized = (value ?? "").replace(/\D/g, "");

  if (/^\d{8}$/.test(normalized)) {
    return normalized.slice(2);
  }

  if (/^\d{6}$/.test(normalized)) {
    return normalized;
  }

  return "";
}

function buildBirthDateColumns(submission: KioskSheetSubmission) {
  const values: KioskSubmissionSheetCell[] = Array.from(
    { length: 10 },
    () => null,
  );
  const birthValue =
    submission.metadata?.birthDate ?? submission.member.gradeOrAge;
  const birthYear = parseBirthYear(birthValue);
  const birthForSheet = formatBirthForSheet(birthValue);
  const age = getKoreanAge(birthValue, submission.member.gradeOrAge);

  if (!birthForSheet) {
    return values;
  }

  const genderOffset = submission.metadata?.gender === "female" ? 1 : 0;
  let categoryOffset: number;

  if (!birthYear || !age) {
    categoryOffset = 2;
  } else if (age <= 7) {
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

  values[categoryOffset + genderOffset] = birthForSheet;
  return values;
}

function skipBlankCell(value?: string) {
  const trimmed = value?.trim() ?? "";

  return trimmed || null;
}

export function buildKioskSubmissionRow(
  submission: KioskSheetSubmission,
  dateParts: ReturnType<typeof formatDateParts>,
) {
  const isSpaceVisit = submission.resourceType === "space";
  const isRentalGameVisit =
    submission.resourceType === "nintendo" ||
    submission.resourceType === "playstation";
  const amount = submission.pricingRule?.amount ?? 0;
  const spaceDetail = submission.metadata?.spaceDetail?.trim() || "공간이용";

  return [
    dateParts.time,
    submission.member.name,
    skipBlankCell(submission.metadata?.schoolName),
    ...buildBirthDateColumns(submission),
    submission.member.guardianPhone,
    isSpaceVisit ? spaceDetail : null,
    isSpaceVisit || isRentalGameVisit ? null : amount,
    isRentalGameVisit ? amount : null,
  ];
}

function getTodaySheetLabel(now = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${Number(value("month"))}/${Number(value("day"))}`;
}

export function buildKioskSubmissionWriteRequest(
  submission: KioskSheetSubmission,
  now = new Date(),
  pricingRules: PricingRule[] = [],
): KioskSubmissionWriteRequest {
  const { date, time } = formatDateParts(now);
  const gameLimitPricingRules = new Map<
    string,
    {
      resourceType: (typeof GAME_SHEET_RESOURCE_TYPES)[number];
      amount: number;
      minutes: number;
    }
  >();

  pricingRules.forEach((rule) => {
    if (!isGameResourceType(rule.resourceType) || rule.isExtension) {
      return;
    }

    gameLimitPricingRules.set(`${rule.resourceType}:${rule.amount}`, {
      resourceType: rule.resourceType,
      amount: rule.amount,
      minutes: rule.minutes,
    });
  });
  const gameLimit = isGameResourceType(submission.resourceType)
    ? {
        memberName: submission.member.name,
        guardianPhone: submission.member.guardianPhone,
        requestedMinutes: submission.pricingRule?.minutes ?? 0,
        pricingRules: Array.from(gameLimitPricingRules.values()),
      }
    : undefined;

  return {
    tabName: getTabName(submission.resourceType),
    todayLabel: getTodaySheetLabel(now),
    resourceType: submission.resourceType,
    row: buildKioskSubmissionRow(submission, { date, time }),
    gameLimit,
  };
}

function isSheetDateLabel(value: string) {
  return /^\d{1,2}\/\d{1,2}$/.test(value);
}

function isWritableSubmissionRow(row: string[], resourceType: ResourceType) {
  if (cell(row, 0).startsWith("마감")) {
    return false;
  }

  const intakeColumnIndexes = Array.from({ length: 17 }, (_, index) => index + 1);
  const hasSpaceMarkerOnly =
    resourceType === "space" &&
    normalizeSearch(cell(row, 15)) === "공간이용" &&
    intakeColumnIndexes
      .filter((index) => index !== 15)
      .every((index) => !cell(row, index));

  if (hasSpaceMarkerOnly) {
    return true;
  }

  return intakeColumnIndexes.every((index) => !cell(row, index));
}

export function findSheetInsertRowIndex(
  rows: string[][],
  resourceType: ResourceType,
  now = new Date(),
) {
  const todayLabel = getTodaySheetLabel(now);
  const todayRowIndex = rows.findLastIndex(
    (row) => cell(row, 0) === todayLabel,
  );

  if (todayRowIndex < 0) {
    throw new Error(`${todayLabel} 날짜 행을 찾을 수 없습니다.`);
  }

  if (isWritableSubmissionRow(rows[todayRowIndex] ?? [], resourceType)) {
    return todayRowIndex;
  }

  for (let index = todayRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const firstCell = cell(row, 0);

    if (firstCell.startsWith("마감") || isSheetDateLabel(firstCell)) {
      break;
    }

    if (isWritableSubmissionRow(row, resourceType)) {
      return index;
    }
  }

  throw new Error(
    `${todayLabel} 구간에 입력 가능한 빈 행이 없습니다. 공식이 들어간 빈 행을 먼저 추가해 주세요.`,
  );
}

function parseSheetAmount(value?: string) {
  const normalized = (value ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function amountToGameMinutes(
  resourceType: ResourceType,
  amount: number,
  pricingRules: PricingRule[],
) {
  if (amount <= 0) {
    return 0;
  }

  const matchingRule = pricingRules
    .filter(
      (rule) =>
        rule.resourceType === resourceType &&
        !rule.isExtension &&
        rule.amount === amount,
    )
    .sort((left, right) => right.minutes - left.minutes)[0];

  if (matchingRule) {
    return matchingRule.minutes;
  }

  return Math.max(Math.round(amount / 500) * 30, 0);
}

function getAmountColumnIndex(resourceType: ResourceType) {
  return resourceType === "pc"
    ? SHEET_PC_AMOUNT_COLUMN_INDEX
    : SHEET_RENTAL_AMOUNT_COLUMN_INDEX;
}

export function findTodaySheetSegmentBounds(
  dateRows: string[][],
  now = new Date(),
) {
  const todayLabel = getTodaySheetLabel(now);
  const todayRowIndex = dateRows.findLastIndex(
    (row) => cell(row, 0) === todayLabel,
  );

  if (todayRowIndex < 0) {
    return null;
  }

  let segmentEndIndex = dateRows.length;
  let isOpenEnded = true;

  for (let index = todayRowIndex + 1; index < dateRows.length; index += 1) {
    const firstCell = cell(dateRows[index] ?? [], 0);

    if (firstCell.startsWith("마감") || isSheetDateLabel(firstCell)) {
      segmentEndIndex = index;
      isOpenEnded = false;
      break;
    }
  }

  return {
    firstRowNumber: todayRowIndex + 1,
    lastRowNumber: segmentEndIndex,
    isOpenEnded,
  };
}

export function getTodaySheetSegmentRangeTarget(
  resourceType: (typeof GAME_SHEET_RESOURCE_TYPES)[number],
  dateRows: string[][],
  now = new Date(),
) {
  const bounds = findTodaySheetSegmentBounds(dateRows, now);

  if (!bounds) {
    return null;
  }

  const endRow = bounds.isOpenEnded ? "" : String(bounds.lastRowNumber);

  return {
    resourceType,
    firstRowNumber: bounds.firstRowNumber,
    range: getSheetRange(
      getTabName(resourceType),
      `A${bounds.firstRowNumber}:T${endRow}`,
    ),
  };
}

function getTodaySegmentRows(
  rows: string[][],
  now = new Date(),
  firstRowNumber = 1,
) {
  const bounds = findTodaySheetSegmentBounds(rows, now);

  if (!bounds) {
    return [];
  }

  const segmentRows: Array<{ row: string[]; rowNumber: number }> = [];
  const startIndex = bounds.firstRowNumber - 1;

  for (let index = startIndex; index < bounds.lastRowNumber; index += 1) {
    const row = rows[index] ?? [];

    segmentRows.push({ row, rowNumber: firstRowNumber + index });
  }

  return segmentRows;
}

export function getDailyGameSheetUsageFromRows({
  rowsByResourceType,
  firstRowNumbersByResourceType,
  member,
  pricingRules,
  now = new Date(),
}: {
  rowsByResourceType: Partial<
    Record<(typeof GAME_SHEET_RESOURCE_TYPES)[number], string[][]>
  >;
  firstRowNumbersByResourceType?: Partial<
    Record<(typeof GAME_SHEET_RESOURCE_TYPES)[number], number>
  >;
  member: Pick<Member, "name" | "guardianPhone">;
  pricingRules: PricingRule[];
  now?: Date;
}): DailyGameSheetUsage {
  const targetName = normalizeSearch(member.name);
  const targetPhone = normalizePhone(member.guardianPhone);
  const usageRows: DailyGameSheetUsage["rows"] = [];

  GAME_SHEET_RESOURCE_TYPES.forEach((resourceType) => {
    const rows = rowsByResourceType[resourceType] ?? [];

    getTodaySegmentRows(
      rows,
      now,
      firstRowNumbersByResourceType?.[resourceType] ?? 1,
    ).forEach(({ row, rowNumber }) => {
      if (
        normalizeSearch(cell(row, SHEET_NAME_COLUMN_INDEX)) !== targetName ||
        normalizePhone(cell(row, SHEET_PHONE_COLUMN_INDEX)) !== targetPhone
      ) {
        return;
      }

      const amount = parseSheetAmount(
        cell(row, getAmountColumnIndex(resourceType)),
      );
      const minutes = amountToGameMinutes(resourceType, amount, pricingRules);

      if (minutes <= 0) {
        return;
      }

      usageRows.push({ resourceType, rowNumber, amount, minutes });
    });
  });

  return {
    minutes: usageRows.reduce((sum, row) => sum + row.minutes, 0),
    rows: usageRows,
  };
}

function maskPhoneForLog(value?: string) {
  return normalizePhone(value).replace(/(\d{3})\d+(\d{4})/, "$1****$2");
}

function maskQueryForLog(value?: string) {
  const query = String(value ?? "").trim();
  const digits = normalizePhone(query);

  if (digits.length >= 8) {
    return maskPhoneForLog(digits);
  }

  return query.slice(0, 80);
}

export type KioskOperationLogEntry = {
  event: "mutation" | "memberSearch";
  action: string;
  status: "failure";
  resourceType?: ResourceType;
  sheetTarget?: Pick<KioskSheetWriteTarget, "tabName" | "rowNumber">;
  member?: Pick<MemberInput, "name" | "guardianPhone">;
  searchQuery?: string;
  resultCount?: number;
  message?: string;
  requestId?: string;
};

export function buildKioskOperationLogRow(
  entry: KioskOperationLogEntry,
  now = new Date(),
) {
  const { date, time } = formatDateParts(now);

  return [
    `${date} ${time}`,
    now.toISOString(),
    entry.event,
    entry.action,
    "실패",
    entry.resourceType ?? "",
    entry.sheetTarget?.tabName ?? "",
    entry.sheetTarget?.rowNumber ?? "",
    entry.member?.name ?? "",
    maskPhoneForLog(entry.member?.guardianPhone),
    maskQueryForLog(entry.searchQuery),
    entry.resultCount ?? "",
    entry.message?.slice(0, 300) ?? "",
    entry.requestId ?? "",
  ];
}

let operationLogSheetReady: Promise<void> | null = null;

async function ensureOperationLogSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string,
) {
  const getExistingSheet = async () => {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(sheetId,title))",
    });

    return metadata.data.sheets?.find(
      (item) => item.properties?.title === tabName,
    );
  };

  let sheet = await getExistingSheet();

  if (!sheet) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: tabName,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("already exists")) {
        throw error;
      }
    }

    sheet = await getExistingSheet();
  }

  if (!sheet) {
    throw new Error(`${tabName} 탭을 만들거나 찾지 못했습니다.`);
  }

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: getSheetRange(tabName, `A1:${String.fromCharCode(64 + OPERATION_LOG_HEADERS.length)}1`),
  });
  const currentHeader = (headerResponse.data.values?.[0] ?? []) as string[];

  if (currentHeader.length > 0) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: getSheetRange(tabName, `A1:${String.fromCharCode(64 + OPERATION_LOG_HEADERS.length)}1`),
    valueInputOption: "RAW",
    requestBody: {
      values: [OPERATION_LOG_HEADERS],
    },
  });
}

async function ensureOperationLogSheetOnce(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string,
) {
  operationLogSheetReady ??= ensureOperationLogSheet(
    sheets,
    spreadsheetId,
    tabName,
  ).catch((error) => {
    operationLogSheetReady = null;
    throw error;
  });

  await operationLogSheetReady;
}

function readHeaderMemberRows(rows: string[][]) {
  const headerMatch = rows
    .slice(0, 20)
    .map((row, index) => {
      const nameIndex = findColumnIndex(row, [
        "이름",
        "학생이름",
        "학생명",
        "아이이름",
        "아동명",
        "이용자",
        "성명",
        "name",
      ]);
      const phoneIndex = findColumnIndex(row, [
        "보호자연락처",
        "보호자전화번호",
        "보호자휴대폰",
        "학부모연락처",
        "학부모전화번호",
        "연락처",
        "전화번호",
        "휴대폰",
        "휴대전화",
        "핸드폰",
        "phone",
      ]);

      return {
        row,
        index,
        nameIndex,
        phoneIndex,
      };
    })
    .find((match) => match.nameIndex >= 0 && match.phoneIndex >= 0);

  if (!headerMatch) {
    const fallbackMembers = rows
      .map(toAppendLayoutMember)
      .filter((member): member is KioskSheetMember => Boolean(member));

    if (rows.length > 0 && fallbackMembers.length === 0) {
      console.warn("사용자DB header mapping failed.", {
        firstRows: rows
          .slice(0, 5)
          .map((row) => row.map((value) => (value ? "[value]" : ""))),
        rowCount: rows.length,
      });
    }

    return fallbackMembers;
  }

  const headers = headerMatch.row;
  const bodyRows = rows.slice(headerMatch.index + 1);
  const nameIndex = findColumnIndex(headers, [
    "이름",
    "학생이름",
    "학생명",
    "아이이름",
    "아동명",
    "이용자",
    "성명",
    "name",
  ]);
  const phoneIndex = findColumnIndex(headers, [
    "보호자연락처",
    "보호자전화번호",
    "보호자휴대폰",
    "학부모연락처",
    "학부모전화번호",
    "연락처",
    "전화번호",
    "휴대폰",
    "휴대전화",
    "핸드폰",
    "phone",
  ]);

  const schoolIndex = findColumnIndex(headers, [
    "학교",
    "학교명",
    "소속",
    "school",
  ]);
  const birthDateIndex = findColumnIndex(headers, [
    "생년월일",
    "출생일",
    "생일",
    "birth",
  ]);
  const birthYearIndex = findColumnIndex(headers, [
    "출생연도",
    "생년",
    "나이",
    "학년/나이",
    "학년",
  ]);
  const genderIndex = findColumnIndex(headers, [
    "성별",
    "남여",
    "남녀",
    "gender",
  ]);

  return bodyRows
    .map((row, index): KioskSheetMember | null => {
      const name = cell(row, nameIndex);
      const guardianPhone = cell(row, phoneIndex);

      if (!name || !guardianPhone) {
        return null;
      }

      const birthDate =
        birthDateIndex >= 0 ? cell(row, birthDateIndex) : undefined;
      const gradeOrAge =
        toBirthYear(birthDate) ||
        (birthYearIndex >= 0 ? toBirthYear(cell(row, birthYearIndex)) : "");

      return {
        id: `member-${normalizePhone(guardianPhone) || index}-${normalizeSearch(name)}`,
        name,
        schoolName:
          schoolIndex >= 0 ? cell(row, schoolIndex) || undefined : undefined,
        birthDate: birthDate || undefined,
        gradeOrAge,
        gender: genderIndex >= 0 ? toGender(cell(row, genderIndex)) : undefined,
        guardianPhone,
      };
    })
    .filter((member): member is KioskSheetMember => Boolean(member));
}

function dedupeMembers(members: KioskSheetMember[]) {
  const deduped = new Map<string, KioskSheetMember>();

  members.forEach((member) => {
    const key = `${normalizeSearch(member.name)}:${normalizePhone(member.guardianPhone)}`;
    const previous = deduped.get(key);

    deduped.set(key, {
      ...previous,
      ...member,
      schoolName: member.schoolName || previous?.schoolName,
      birthDate: member.birthDate || previous?.birthDate,
      gradeOrAge: member.gradeOrAge || previous?.gradeOrAge || "",
      gender: member.gender || previous?.gender,
    });
  });

  return Array.from(deduped.values());
}

function filterMembers(
  members: KioskSheetMember[],
  query: string,
  limit: number,
) {
  const normalizedQuery = normalizeSearch(query);
  const normalizedPhoneQuery = normalizePhone(query);

  return members
    .filter((member) => {
      if (!normalizedQuery && !normalizedPhoneQuery) {
        return true;
      }

      return (
        normalizeSearch(member.name).includes(normalizedQuery) ||
        (normalizedPhoneQuery
          ? normalizePhone(member.guardianPhone).includes(normalizedPhoneQuery)
          : false) ||
        normalizeSearch(member.schoolName).includes(normalizedQuery) ||
        normalizeSearch(member.gradeOrAge).includes(normalizedQuery)
      );
    })
    .slice(0, limit);
}

export async function searchKioskMembersFromSheet(query = "", limit = 8) {
  const config = getSheetsConfig();

  if (!config) {
    return [];
  }

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const range =
    process.env.GOOGLE_SHEETS_MEMBER_RANGE?.trim() || "'사용자DB'!A:Z";
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
  });
  const rows = (response.data.values ?? []) as string[][];

  return filterMembers(dedupeMembers(readHeaderMemberRows(rows)), query, limit);
}

export async function appendKioskSubmissionToSheet(
  submission: KioskSheetSubmission,
  options: { pricingRules?: PricingRule[] } = {},
): Promise<KioskSheetWriteTarget | null> {
  const now = new Date();
  const writeRequest = buildKioskSubmissionWriteRequest(
    submission,
    now,
    options.pricingRules,
  );

  if (
    isGameResourceType(submission.resourceType) &&
    (!writeRequest.gameLimit ||
      writeRequest.gameLimit.requestedMinutes <= 0 ||
      writeRequest.gameLimit.pricingRules.length === 0)
  ) {
    throw new Error("게임 이용시간 정책 정보를 확인하지 못했습니다.");
  }

  const redisTarget = await appendKioskSubmissionThroughRedis(writeRequest);

  if (redisTarget) {
    return redisTarget;
  }

  const lockedTarget = await appendKioskSubmissionThroughLock(writeRequest);

  if (lockedTarget) {
    return lockedTarget;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();

  if (!spreadsheetId) {
    console.warn(
      "GOOGLE_SHEETS_SPREADSHEET_ID is missing. Skipping kiosk sheet append.",
    );
    return null;
  }

  throw new Error(
    "안전한 접수를 위한 Google Sheets 잠금 설정이 필요합니다.",
  );
}

async function appendKioskSubmissionThroughRedis(
  writeRequest: KioskSubmissionWriteRequest,
): Promise<KioskSheetWriteTarget | null> {
  const redis = getKioskRedis();
  const config = getSheetsConfig();

  if (!redis || !config) {
    return null;
  }

  const lockScope = isGameResourceType(writeRequest.resourceType)
    ? "game"
    : writeRequest.resourceType;

  return withKioskRedisLock(
    `autopan:kiosk:lock:${writeRequest.todayLabel}:${lockScope}`,
    async () => {
      const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      const sheets = google.sheets({ version: "v4", auth });

      if (writeRequest.gameLimit) {
        // Sheets remains the source of truth for game time because staff can
        // correct a child's time directly in the sheet during the day.
        const sheetUsage = await getDailyGameSheetUsage({
          member: {
            name: writeRequest.gameLimit.memberName,
            guardianPhone: writeRequest.gameLimit.guardianPhone,
          },
          pricingRules: writeRequest.gameLimit.pricingRules as PricingRule[],
        });
        const usedMinutes = sheetUsage?.minutes ?? 0;

        if (usedMinutes + writeRequest.gameLimit.requestedMinutes > 120) {
          throw new Error(
            formatDailyGameLimitMessage(Math.max(120 - usedMinutes, 0)),
          );
        }

      }

      const cursorKey = `autopan:kiosk:next-row:${writeRequest.todayLabel}:${writeRequest.resourceType}`;
      const segmentStartKey = `autopan:kiosk:segment-start:${writeRequest.todayLabel}:${writeRequest.resourceType}`;
      let rowNumber = await redis.get<number>(cursorKey);
      let segmentStartRow = await redis.get<number>(segmentStartKey);

      if (rowNumber === null || segmentStartRow === null) {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheetId,
          range: getSheetRange(writeRequest.tabName, "A:T"),
        });
        const rows = (response.data.values ?? []) as string[][];
        const bounds = findTodaySheetSegmentBounds(rows);

        if (!bounds) {
          throw new Error(`${writeRequest.todayLabel} 날짜 행을 찾을 수 없습니다.`);
        }

        rowNumber =
          findSheetInsertRowIndex(
            rows,
            writeRequest.resourceType,
          ) + 1;
        segmentStartRow = bounds.firstRowNumber;
        await redis.set(cursorKey, rowNumber, { ex: 36 * 60 * 60 });
        await redis.set(segmentStartKey, segmentStartRow, { ex: 36 * 60 * 60 });
      }

      // A staff member may delete a mistaken intake in the middle of today's
      // block. Read only the known daily block (not the full sheet) so that
      // the deleted row is reused before allocating a new one.
      const segmentResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: getSheetRange(
          writeRequest.tabName,
          `A${segmentStartRow}:R${rowNumber}`,
        ),
      });
      const segmentRows = (segmentResponse.data.values ?? []) as string[][];
      let reusableRowNumber: number | null = null;

      for (let index = 0; index <= rowNumber - segmentStartRow; index += 1) {
        const row = segmentRows[index] ?? [];
        const firstCell = cell(row, 0);

        if (
          index > 0 &&
          (firstCell.startsWith("마감") || isSheetDateLabel(firstCell))
        ) {
          break;
        }

        if (isWritableSubmissionRow(row, writeRequest.resourceType)) {
          reusableRowNumber = segmentStartRow + index;
          break;
        }
      }

      if (reusableRowNumber === null) {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheetId,
          range: getSheetRange(writeRequest.tabName, "A:T"),
        });
        rowNumber =
          findSheetInsertRowIndex(
            (response.data.values ?? []) as string[][],
            writeRequest.resourceType,
          ) + 1;
        await redis.set(cursorKey, rowNumber, { ex: 36 * 60 * 60 });
      } else {
        rowNumber = reusableRowNumber;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: getSheetRange(writeRequest.tabName, `B${rowNumber}:R${rowNumber}`),
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [writeRequest.row] },
      });

      const nextRowNumber = Math.max(
        (await redis.get<number>(cursorKey)) ?? rowNumber,
        rowNumber + 1,
      );
      await redis.set(cursorKey, nextRowNumber, { ex: 36 * 60 * 60 });
      console.info("Google Sheets Redis-reserved write target.", {
        tabName: writeRequest.tabName,
        row: rowNumber,
        resourceType: writeRequest.resourceType,
      });
      return { tabName: writeRequest.tabName, rowNumber, resourceType: writeRequest.resourceType };
    },
  );
}

async function appendKioskSubmissionThroughLock(
  writeRequest: KioskSubmissionWriteRequest,
): Promise<KioskSheetWriteTarget | null> {
  const lockConfig = getKioskLockConfig();

  if (!lockConfig) {
    return null;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is required.");
  }

  // ponytail: one spreadsheet-wide lock; split by tab only if lock waits become visible.
  const response = await fetch(lockConfig.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...writeRequest,
      spreadsheetId,
      secret: lockConfig.secret,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    tabName?: string;
    rowNumber?: number;
    timing?: unknown;
  };

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? "Google Sheets locked write failed.");
  }

  const rowNumber = Number(body.rowNumber);

  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    throw new Error("Google Sheets locked write returned an invalid row.");
  }

  console.info("Google Sheets kiosk locked write target.", {
    tabName: body.tabName ?? writeRequest.tabName,
    row: rowNumber,
    resourceType: writeRequest.resourceType,
    timing: normalizeKioskSheetLockTiming(body.timing),
  });

  return {
    tabName: body.tabName ?? writeRequest.tabName,
    rowNumber,
    resourceType: writeRequest.resourceType,
  };
}

export async function appendKioskOperationLogToSheet(
  entry: KioskOperationLogEntry,
) {
  const config = getSheetsConfig();

  if (!config) {
    console.warn(
      "Google Sheets env vars are missing. Skipping kiosk operation log append.",
    );
    return;
  }

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const tabName = getOperationLogTabName();

  await ensureOperationLogSheetOnce(sheets, config.spreadsheetId, tabName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: getSheetRange(tabName, "A:N"),
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [buildKioskOperationLogRow(entry)],
    },
  });
}

export async function appendKioskOperationLogSafely(
  entry: KioskOperationLogEntry,
) {
  try {
    await appendKioskOperationLogToSheet(entry);
  } catch (error) {
    console.error("Kiosk operation log append failed.", error);
  }
}

export async function getDailyGameSheetUsage({
  member,
  pricingRules,
  now = new Date(),
}: {
  member: Pick<Member, "name" | "guardianPhone">;
  pricingRules: PricingRule[];
  now?: Date;
}) {
  const config = getSheetsConfig();

  if (!config) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const dateColumnResponse = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.spreadsheetId,
    ranges: GAME_SHEET_RESOURCE_TYPES.map((resourceType) =>
      getSheetRange(getTabName(resourceType), "A:A"),
    ),
  });
  const segmentTargets = GAME_SHEET_RESOURCE_TYPES.flatMap(
    (resourceType, index) => {
      const dateRows = (dateColumnResponse.data.valueRanges?.[index]?.values ??
        []) as string[][];
      const target = getTodaySheetSegmentRangeTarget(
        resourceType,
        dateRows,
        now,
      );

      return target ? [target] : [];
    },
  );
  const segmentResponse =
    segmentTargets.length > 0
      ? await sheets.spreadsheets.values.batchGet({
          spreadsheetId: config.spreadsheetId,
          ranges: segmentTargets.map((target) => target.range),
        })
      : null;
  const rowsByResourceType: Partial<
    Record<(typeof GAME_SHEET_RESOURCE_TYPES)[number], string[][]>
  > = {};
  const firstRowNumbersByResourceType: Partial<
    Record<(typeof GAME_SHEET_RESOURCE_TYPES)[number], number>
  > = {};

  segmentTargets.forEach((target, index) => {
    rowsByResourceType[target.resourceType] = (segmentResponse?.data.valueRanges?.[
      index
    ]?.values ?? []) as string[][];
    firstRowNumbersByResourceType[target.resourceType] = target.firstRowNumber;
  });

  return getDailyGameSheetUsageFromRows({
    rowsByResourceType,
    firstRowNumbersByResourceType,
    member,
    pricingRules,
    now,
  });
}
