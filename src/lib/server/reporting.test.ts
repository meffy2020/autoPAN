import assert from "node:assert/strict";
import test from "node:test";

import { buildReportsOverview } from "@/lib/reporting";
import { buildDailyReport, createId, reconcileState, seedState } from "@/lib/server/state";

test("buildDailyReport counts unique visitors once per day", () => {
  const now = new Date("2026-05-11T12:00:00.000Z");
  const state = seedState(now);

  state.visits.push({
    id: createId("visit", 999),
    memberId: createId("member", 1),
    ticketNumber: "0511-999",
    resourceType: "pc",
    pricingRuleId: createId("price", 1),
    status: "completed",
    createdAt: now.toISOString(),
  });

  const report = buildDailyReport(state, now);

  assert.equal(report.totalVisits, 6);
  assert.equal(report.uniqueVisitors, 5);
});

test("reconcileState backfills extension pricing and keeps one daily record per date", () => {
  const now = new Date("2026-05-11T12:00:00.000Z");
  const state = seedState(now);

  state.pricingRules = state.pricingRules.filter(
    (rule) => !rule.isExtension || rule.minutes === 30,
  );

  reconcileState(state, now);
  reconcileState(state, new Date("2026-05-11T12:05:00.000Z"));

  for (const resourceType of ["pc", "nintendo", "playstation"] as const) {
    assert.deepEqual(
      state.pricingRules
        .filter((rule) => rule.resourceType === resourceType && rule.isExtension)
        .map((rule) => rule.minutes),
      [30, 60, 90],
    );
  }

  assert.equal(
    state.dailyReports.filter((report) => report.date === "2026-05-11").length,
    1,
  );
  assert.equal(state.dailyReports[0]?.uniqueVisitors, 5);
});

test("buildReportsOverview groups history by day, month, hour, resource, and member", () => {
  const now = new Date("2026-05-11T12:00:00.000Z");
  const state = seedState(now);
  reconcileState(state, now);

  const overview = buildReportsOverview({
    generatedAt: now.toISOString(),
    members: state.members,
    resources: state.resources,
    pricingRules: state.pricingRules,
    visits: state.visits,
    queueEntries: state.queueEntries,
    sessions: state.sessions,
    payments: state.payments,
    ttsEvents: state.ttsEvents,
    staffActivityLogs: state.staffActivityLogs,
    dailyReports: state.dailyReports,
    settings: state.settings,
    report: buildDailyReport(state, now),
  });

  assert.equal(overview.totalUniqueVisitors, 5);
  assert.equal(overview.dailyRows[0]?.uniqueVisitors, 5);
  assert.ok(overview.monthlyRows.length >= 1);
  assert.ok(overview.yearlyRows.length >= 1);
  assert.ok(overview.hourlyRows.length >= 1);
  assert.ok(overview.resourceRows.some((row) => row.totalRevenue > 0));
  assert.equal(overview.topMembers[0]?.visitCount, 1);
});
