import assert from "node:assert/strict";
import test from "node:test";

import {
  createId,
  moveActiveSessionResource,
  seedState,
} from "@/lib/server/state";

test("moveActiveSessionResource moves an active session to a free same-type resource", () => {
  const state = seedState(new Date("2026-05-11T00:00:00.000Z"));

  const result = moveActiveSessionResource(
    state,
    {
      sessionId: createId("session", 1),
      resourceId: createId("resource", 2),
      staffName: "김선생",
    },
    new Date("2026-05-11T00:10:00.000Z"),
  );

  const session = state.sessions.find((item) => item.id === createId("session", 1));
  const log = state.staffActivityLogs[0];

  assert.equal(result.changed, true);
  assert.equal(session?.resourceId, createId("resource", 2));
  assert.equal(log?.action, "move_session");
  assert.equal(log?.metadata?.previousResourceId, createId("resource", 1));
  assert.equal(log?.metadata?.nextResourceId, createId("resource", 2));
});

test("moveActiveSessionResource rejects occupied resources", () => {
  const state = seedState(new Date("2026-05-11T00:00:00.000Z"));

  assert.throws(
    () =>
      moveActiveSessionResource(
        state,
        {
          sessionId: createId("session", 1),
          resourceId: createId("resource", 7),
          staffName: "김선생",
        },
        new Date("2026-05-11T00:10:00.000Z"),
      ),
    /같은 자원 종류의 자리로만 이동할 수 있습니다|이미 사용 중인 자리입니다/,
  );
});
