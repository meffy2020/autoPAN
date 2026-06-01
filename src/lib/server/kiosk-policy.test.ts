import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailyGamePlannedMinutes,
  getElementaryEntryBirthYear,
  getKoreaBusinessDateKey,
  isElementaryGradeOneOrOlderBirthYear,
} from "@/lib/kiosk-policy";
import { createId, seedState } from "@/lib/server/state";
import {
  enqueueVisit,
  getSnapshot,
  registerSpaceVisit,
  resetDemoState,
} from "@/lib/server/store";

function emptyPolicyState(now = new Date("2026-06-01T03:00:00.000Z")) {
  const state = seedState(now);
  state.members = [];
  state.visits = [];
  state.sessions = [];
  state.queueEntries = [];
  state.payments = [];
  state.staffActivityLogs = [];
  state.ttsEvents = [];
  state.dailyReports = [];
  return state;
}

function pricingRuleId(
  state: ReturnType<typeof emptyPolicyState>,
  resourceType = "pc",
  minutes = 30,
) {
  const rule = state.pricingRules.find(
    (item) =>
      item.resourceType === resourceType &&
      item.minutes === minutes &&
      !item.isExtension,
  );

  assert.ok(rule, `${resourceType} ${minutes}분 요금제가 필요합니다.`);
  return rule.id;
}

test("elementary school-year threshold allows 2019 and blocks 2020 in 2026", () => {
  const now = new Date("2026-06-01T03:00:00.000Z");

  assert.equal(getElementaryEntryBirthYear(now), 2019);
  assert.equal(isElementaryGradeOneOrOlderBirthYear("2019", now), true);
  assert.equal(isElementaryGradeOneOrOlderBirthYear("2020", now), false);
});

test("daily game planned minutes count each game visit once and exclude space/no-show", () => {
  const now = new Date("2026-06-01T03:00:00.000Z");
  const state = emptyPolicyState(now);

  state.members.push({
    id: createId("member", 1),
    name: "김테스트",
    gradeOrAge: "2016",
    guardianPhone: "01012345678",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  state.visits.push(
    {
      id: createId("visit", 1),
      memberId: createId("member", 1),
      ticketNumber: "0601-001",
      resourceType: "pc",
      pricingRuleId: pricingRuleId(state, "pc", 30),
      status: "queued",
      createdAt: now.toISOString(),
    },
    {
      id: createId("visit", 2),
      memberId: createId("member", 1),
      ticketNumber: "0601-002",
      resourceType: "nintendo",
      pricingRuleId: pricingRuleId(state, "nintendo", 60),
      status: "completed",
      createdAt: now.toISOString(),
    },
    {
      id: createId("visit", 3),
      memberId: createId("member", 1),
      ticketNumber: "0601-003",
      resourceType: "space",
      pricingRuleId: "",
      status: "completed",
      createdAt: now.toISOString(),
    },
    {
      id: createId("visit", 4),
      memberId: createId("member", 1),
      ticketNumber: "0601-004",
      resourceType: "playstation",
      pricingRuleId: pricingRuleId(state, "playstation", 120),
      status: "no_show",
      createdAt: now.toISOString(),
    },
    {
      id: createId("visit", 5),
      memberId: createId("member", 1),
      ticketNumber: "0601-005",
      resourceType: "pc",
      pricingRuleId: pricingRuleId(state, "pc", 120),
      status: "canceled",
      createdAt: now.toISOString(),
    },
  );
  state.sessions.push({
    id: createId("session", 1),
    visitId: createId("visit", 2),
    resourceId: createId("resource", 1),
    resourceType: "nintendo",
    pricingRuleId: pricingRuleId(state, "nintendo", 60),
    plannedMinutes: 60,
    extensionMinutes: 30,
    startsAt: now.toISOString(),
    endsAt: now.toISOString(),
    status: "ended",
  });
  state.queueEntries.push({
    id: createId("queue", 1),
    visitId: createId("visit", 1),
    resourceType: "pc",
    status: "waiting",
    position: 1,
    createdAt: now.toISOString(),
  });

  assert.equal(
    getDailyGamePlannedMinutes(
      state,
      { member: { name: "김 테스트", guardianPhone: "010-1234-5678" } },
      now,
    ),
    120,
  );
  assert.equal(
    getDailyGamePlannedMinutes(
      state,
      {
        memberId: "member-01012345678-sheet-synthetic",
        member: { name: "김 테스트", guardianPhone: "010-1234-5678" },
      },
      now,
    ),
    120,
  );
});

test("Korea business-day helper uses Korea-local date boundaries", () => {
  assert.equal(
    getKoreaBusinessDateKey(new Date("2026-05-31T14:59:59.000Z")),
    "2026-05-31",
  );
  assert.equal(
    getKoreaBusinessDateKey(new Date("2026-05-31T15:00:00.000Z")),
    "2026-06-01",
  );

  const now = new Date("2026-05-31T15:30:00.000Z");
  const state = emptyPolicyState(now);

  state.members.push({
    id: createId("member", 1),
    name: "날짜테스트",
    gradeOrAge: "2016",
    guardianPhone: "01011112222",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  state.visits.push(
    {
      id: createId("visit", 1),
      memberId: createId("member", 1),
      ticketNumber: "0531-001",
      resourceType: "pc",
      pricingRuleId: pricingRuleId(state, "pc", 60),
      status: "completed",
      createdAt: "2026-05-31T14:59:59.000Z",
    },
    {
      id: createId("visit", 2),
      memberId: createId("member", 1),
      ticketNumber: "0601-001",
      resourceType: "pc",
      pricingRuleId: pricingRuleId(state, "pc", 30),
      status: "completed",
      createdAt: "2026-05-31T15:00:00.000Z",
    },
  );

  assert.equal(
    getDailyGamePlannedMinutes(
      state,
      { member: { name: "날짜테스트", guardianPhone: "01011112222" } },
      now,
    ),
    30,
  );
});

test("enqueueVisit allows exactly 120 minutes and rejects over-limit without side effects", () => {
  resetDemoState();

  const firstSnapshot = getSnapshot();
  const pc90 = firstSnapshot.pricingRules.find(
    (rule) =>
      rule.resourceType === "pc" && rule.minutes === 90 && !rule.isExtension,
  );
  const pc30 = firstSnapshot.pricingRules.find(
    (rule) =>
      rule.resourceType === "pc" && rule.minutes === 30 && !rule.isExtension,
  );
  const pc60 = firstSnapshot.pricingRules.find(
    (rule) =>
      rule.resourceType === "pc" && rule.minutes === 60 && !rule.isExtension,
  );

  assert.ok(pc90);
  assert.ok(pc30);
  assert.ok(pc60);

  const member = {
    name: "정책테스트",
    gradeOrAge: "2015",
    guardianPhone: "01099998888",
  };

  enqueueVisit({ member, resourceType: "pc", pricingRuleId: pc90.id });
  enqueueVisit({ member, resourceType: "pc", pricingRuleId: pc30.id });

  const beforeRejected = getSnapshot();
  const existingMember = beforeRejected.members.find(
    (item) => item.name === member.name,
  );
  assert.ok(existingMember);

  assert.throws(
    () =>
      enqueueVisit({
        member: { ...member, gradeOrAge: "2014" },
        resourceType: "pc",
        pricingRuleId: pc60.id,
      }),
    /하루 2시간|2시간을 모두 이용/,
  );

  const afterRejected = getSnapshot();
  const afterMember = afterRejected.members.find(
    (item) => item.id === existingMember.id,
  );

  assert.equal(afterRejected.members.length, beforeRejected.members.length);
  assert.equal(afterRejected.visits.length, beforeRejected.visits.length);
  assert.equal(
    afterRejected.queueEntries.length,
    beforeRejected.queueEntries.length,
  );
  assert.equal(afterMember?.gradeOrAge, existingMember.gradeOrAge);
});

test("space visits remain allowed even after game-device limit is full", () => {
  resetDemoState();

  const snapshot = getSnapshot();
  const pc120 = snapshot.pricingRules.find(
    (rule) =>
      rule.resourceType === "pc" && rule.minutes === 120 && !rule.isExtension,
  );
  assert.ok(pc120);

  const member = {
    name: "공간테스트",
    gradeOrAge: "2015",
    guardianPhone: "01088887777",
  };

  enqueueVisit({ member, resourceType: "pc", pricingRuleId: pc120.id });

  const beforeSpace = getSnapshot();
  registerSpaceVisit({ member, note: "공간이용" });
  const afterSpace = getSnapshot();

  assert.equal(afterSpace.visits.length, beforeSpace.visits.length + 1);
  assert.equal(afterSpace.visits[0]?.resourceType, "space");
});

test("daily game sheet usage reads only today's Korea-date segment and game tabs", async () => {
  const { getDailyGameSheetUsageFromRows } =
    await import("@/lib/server/google-sheets");
  const now = new Date("2026-06-01T03:00:00.000Z");
  const state = emptyPolicyState(now);
  const sheetRow = ({
    date = "",
    name = "",
    phone = "",
    pcAmount = "",
    rentalAmount = "",
  }: {
    date?: string;
    name?: string;
    phone?: string;
    pcAmount?: string;
    rentalAmount?: string;
  }) => {
    const row = Array.from({ length: 18 }, () => "");
    row[0] = date;
    row[2] = name;
    row[14] = phone;
    row[16] = pcAmount;
    row[17] = rentalAmount;
    return row;
  };

  const usage = getDailyGameSheetUsageFromRows({
    rowsByResourceType: {
      pc: [
        sheetRow({
          date: "5/31",
          name: "김테스트",
          phone: "010-1234-5678",
          pcAmount: "2,000",
        }),
        sheetRow({
          date: "6/1",
          name: "김 테스트",
          phone: "01012345678",
          pcAmount: "500",
        }),
        sheetRow({ name: "다른아이", phone: "01012345678", pcAmount: "2,000" }),
        sheetRow({
          date: "6/2",
          name: "김테스트",
          phone: "01012345678",
          pcAmount: "2,000",
        }),
      ],
      nintendo: [
        sheetRow({
          date: "6/1",
          name: "김테스트",
          phone: "010-1234-5678",
          rentalAmount: "1,500",
        }),
        sheetRow({
          date: "마감",
          name: "김테스트",
          phone: "01012345678",
          rentalAmount: "2,000",
        }),
      ],
      playstation: [
        sheetRow({
          date: "6/1",
          name: "김테스트",
          phone: "01099998888",
          rentalAmount: "2,000",
        }),
      ],
    },
    member: { name: "김 테스트", guardianPhone: "010-1234-5678" },
    pricingRules: state.pricingRules,
    now,
  });

  assert.equal(usage.minutes, 120);
  assert.deepEqual(
    usage.rows.map((row) => [row.resourceType, row.amount, row.minutes]),
    [
      ["pc", 500, 30],
      ["nintendo", 1500, 90],
    ],
  );
});
