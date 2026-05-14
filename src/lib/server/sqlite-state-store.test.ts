import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createId } from "@/lib/server/state";
import { SQLiteStateStore } from "@/lib/server/sqlite-state-store";

test("SQLiteStateStore persists state across store instances", () => {
  const directory = mkdtempSync(join(tmpdir(), "autopan-sqlite-"));
  const databasePath = join(directory, "autopan.sqlite");

  try {
    const firstStore = new SQLiteStateStore(databasePath);
    const firstState = firstStore.read(new Date("2026-05-11T00:00:00.000Z"));
    firstState.members.unshift({
      id: createId("member", 999),
      name: "테스트학생",
      gradeOrAge: "초4",
      guardianPhone: "01055556666",
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    });
    firstStore.write(firstState, new Date("2026-05-11T00:01:00.000Z"));
    firstStore.close();

    const secondStore = new SQLiteStateStore(databasePath);
    const secondState = secondStore.read(new Date("2026-05-11T00:02:00.000Z"));
    secondStore.close();

    assert.equal(secondState.members[0]?.name, "테스트학생");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("SQLiteStateStore reset replaces persisted state with seeded state", () => {
  const directory = mkdtempSync(join(tmpdir(), "autopan-sqlite-"));
  const databasePath = join(directory, "autopan.sqlite");

  try {
    const store = new SQLiteStateStore(databasePath);
    const state = store.read(new Date("2026-05-11T00:00:00.000Z"));
    state.members = [];
    store.write(state, new Date("2026-05-11T00:01:00.000Z"));

    const resetState = store.reset(new Date("2026-05-11T00:02:00.000Z"));
    store.close();

    assert.ok(resetState.members.length > 0);
    assert.equal(resetState.members[0]?.name, "김하늘");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
