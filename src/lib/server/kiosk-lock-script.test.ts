import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { resolve } from "node:path";

type RangeCall = [row: number, column: number, rowCount: number, columnCount: number];

type NamedRangeCall = {
  tabName: string;
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
};

type GameResourceType = "pc" | "nintendo" | "playstation";

type GameSegmentCursor = {
  version: 1;
  todayLabel: string;
  savedAtMs: number;
  segments: Record<
    GameResourceType,
    {
      todayRowNumber: number;
      segmentEndRowNumber: number;
      lastRow: number;
    }
  >;
};

type KioskLockPayload = {
  secret: string;
  spreadsheetId: string;
  tabName: string;
  todayLabel: string;
  resourceType: string;
  row: unknown[];
  gameLimit?: {
    memberName: string;
    guardianPhone: string;
    requestedMinutes: number;
    pricingRules: Array<{
      resourceType: string;
      amount: number;
      minutes: number;
    }>;
  };
};

function loadLockScript(globals: Record<string, unknown> = {}) {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/google-sheets-kiosk-lock.gs"),
    "utf8",
  );
  const context = vm.createContext({ console, ...globals });

  vm.runInContext(source, context);
  return context as typeof context & {
    findSheetInsertRowIndexFromSheet_?: (
      sheet: {
        getLastRow: () => number;
        getRange: (
          row: number,
          column: number,
          rowCount: number,
          columnCount: number,
        ) => { getDisplayValues: () => string[][] };
      },
      resourceType: string,
      todayLabel: string,
    ) => number;
    mergeSubmissionRow_?: (
      currentValues: unknown[],
      currentFormulas: string[],
      submittedValues: unknown[],
    ) => unknown[];
    getDailyGameMinutesFromSegments_?: (
      segmentsByResourceType: Record<string, { intakeRows: string[][] }>,
      gameLimit: {
        memberName: string;
        guardianPhone: string;
        pricingRules: Array<{
          resourceType: string;
          amount: number;
          minutes: number;
        }>;
      },
    ) => number;
    writeKioskSubmission_?: (
      payload: KioskLockPayload,
      timing: Record<string, number>,
    ) => { rowNumber: number };
    writeSubmissionRow_?: (
      range: {
        getValues: () => unknown[][];
        getFormulas: () => string[][];
        setValues: (values: unknown[][]) => void;
      },
      submittedValues: unknown[],
    ) => void;
  };
}

function buildGameRow({
  name = "",
  phone = "",
  pcAmount = "",
  rentalAmount = "",
}: {
  name?: string;
  phone?: string;
  pcAmount?: string;
  rentalAmount?: string;
} = {}) {
  const values = Array.from({ length: 17 }, () => "");
  values[1] = name;
  values[13] = phone;
  values[15] = pcAmount;
  values[16] = rentalAmount;
  return values;
}

function buildSpaceRow(name = "") {
  const values = Array.from({ length: 17 }, () => "");
  values[1] = name;
  values[14] = "공간이용";
  return values;
}

function createLockedGameWriteHarness() {
  const state = {
    lockHeld: false,
    lockRequests: 0,
    lockWaits: 0,
    lockReleases: 0,
    openCalls: 0,
    writes: [] as Array<{ tabName: string; row: number; values: unknown[] }>,
    readTabs: new Set<string>(),
  };
  const dateRows = [["7/10"], [""], ["마감"]];
  const rowsByTab: Record<string, string[][]> = {
    "컴퓨터": [
      buildGameRow({
        name: "김 테스트",
        phone: "010-1234-5678",
        pcAmount: "500",
      }),
      buildGameRow(),
      buildGameRow(),
    ],
    "닌텐도": [
      buildGameRow({
        name: "김테스트",
        phone: "01012345678",
        rentalAmount: "1,000",
      }),
      buildGameRow(),
      buildGameRow(),
    ],
    "플스": [buildGameRow(), buildGameRow(), buildGameRow()],
  };
  const assertLocked = (operation: string) => {
    assert.equal(state.lockHeld, true, `${operation} must run while locked`);
  };
  const sheets = Object.fromEntries(
    Object.entries(rowsByTab).map(([tabName, sheetRows]) => [
      tabName,
      {
        getLastRow: () => {
          assertLocked(`${tabName} getLastRow`);
          return dateRows.length;
        },
        getRange: (
          row: number,
          column: number,
          rowCount: number,
          columnCount: number,
        ) => {
          if (column === 1) {
            return {
              getDisplayValues: () => {
                assertLocked(`${tabName} column A read`);
                return dateRows.slice(row - 1, row - 1 + rowCount);
              },
            };
          }

          if (column === 2 && rowCount === 1 && columnCount === 17) {
            return {
              getValues: () => {
                assertLocked(`${tabName} target value read`);
                return [sheetRows[row - 1] ?? buildGameRow()];
              },
              getFormulas: () => {
                assertLocked(`${tabName} target formula read`);
                return [Array.from({ length: 17 }, () => "")];
              },
              setValues: (values: unknown[][]) => {
                assertLocked(`${tabName} target write`);
                const writtenRow = Array.from(values[0] ?? []);
                state.writes.push({ tabName, row, values: writtenRow });
                sheetRows[row - 1] = writtenRow.map((value) =>
                  value == null ? "" : String(value),
                );
              },
            };
          }

          return {
            getDisplayValues: () => {
              assertLocked(`${tabName} B:R read`);
              state.readTabs.add(tabName);
              return sheetRows.slice(row - 1, row - 1 + rowCount);
            },
          };
        },
      },
    ]),
  );
  const lock = {
    waitLock: (timeoutMs: number) => {
      assert.equal(timeoutMs, 20_000);
      assert.equal(state.lockHeld, false);
      state.lockWaits += 1;
      state.lockHeld = true;
    },
    releaseLock: () => {
      assert.equal(state.lockHeld, true);
      state.lockReleases += 1;
      state.lockHeld = false;
    },
  };
  const globals = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name: string) =>
          ({
            KIOSK_APPEND_SECRET: "test-secret",
            KIOSK_SPREADSHEET_ID: "sheet-1",
          })[name] ?? "",
      }),
    },
    SpreadsheetApp: {
      openById: (spreadsheetId: string) => {
        state.openCalls += 1;
        assert.equal(spreadsheetId, "sheet-1");
        return {
          getSheetByName: (tabName: string) => sheets[tabName] ?? null,
        };
      },
    },
    LockService: {
      getDocumentLock: () => {
        state.lockRequests += 1;
        return lock;
      },
      getScriptLock: () => {
        state.lockRequests += 1;
        return lock;
      },
    },
  };

  return { context: loadLockScript(globals), state };
}

function buildGameSegmentCursor({
  todayLabel = "7/10",
  savedAtMs = Date.now(),
  segmentEndRowNumber = 7,
  lastRow = 7,
}: {
  todayLabel?: string;
  savedAtMs?: number;
  segmentEndRowNumber?: number;
  lastRow?: number;
} = {}): GameSegmentCursor {
  const segment = {
    todayRowNumber: 4,
    segmentEndRowNumber,
    lastRow,
  };

  return {
    version: 1,
    todayLabel,
    savedAtMs,
    segments: {
      pc: { ...segment },
      nintendo: { ...segment },
      playstation: { ...segment },
    },
  };
}

function createGameSegmentCursorHarness({
  cursor,
  usageByResourceType = {},
}: {
  cursor?: GameSegmentCursor | string | null;
  usageByResourceType?: Partial<
    Record<GameResourceType, { pcAmount?: string; rentalAmount?: string }>
  >;
} = {}) {
  const resourceTypes: GameResourceType[] = [
    "pc",
    "nintendo",
    "playstation",
  ];
  const tabByResourceType: Record<GameResourceType, string> = {
    pc: "컴퓨터",
    nintendo: "닌텐도",
    playstation: "플스",
  };
  const resourceTypeByTab = Object.fromEntries(
    Object.entries(tabByResourceType).map(([resourceType, tabName]) => [
      tabName,
      resourceType,
    ]),
  ) as Record<string, GameResourceType>;
  const properties: Record<string, string> = {
    KIOSK_APPEND_SECRET: "test-secret",
    KIOSK_SPREADSHEET_ID: "sheet-1",
  };

  if (cursor !== undefined && cursor !== null) {
    properties.KIOSK_GAME_TODAY_SEGMENTS =
      typeof cursor === "string" ? cursor : JSON.stringify(cursor);
  }

  const dateLabelsByResourceType: Record<GameResourceType, string[]> = {
    pc: ["7/9", "", "마감", "7/10", "", "", "마감"],
    nintendo: ["7/9", "", "마감", "7/10", "", "", "마감"],
    playstation: ["7/9", "", "마감", "7/10", "", "", "마감"],
  };
  const rowsByResourceType = Object.fromEntries(
    resourceTypes.map((resourceType) => {
      const usage = usageByResourceType[resourceType];
      const rows = Array.from({ length: 7 }, () => buildGameRow());

      if (usage) {
        rows[3] = buildGameRow({
          name: "김 테스트",
          phone: "010-1234-5678",
          pcAmount: usage.pcAmount,
          rentalAmount: usage.rentalAmount,
        });
      }

      return [resourceType, rows];
    }),
  ) as Record<GameResourceType, string[][]>;
  const state = {
    lockHeld: false,
    lockWaits: 0,
    lockReleases: 0,
    getLastRowCalls: [] as string[],
    rangeCalls: [] as NamedRangeCall[],
    propertyWrites: [] as Array<{ name: string; value: string }>,
    writes: [] as Array<{ tabName: string; row: number; values: unknown[] }>,
  };
  const assertLocked = (operation: string) => {
    assert.equal(state.lockHeld, true, `${operation} must run while locked`);
  };
  const sheets = Object.fromEntries(
    resourceTypes.map((resourceType) => {
      const tabName = tabByResourceType[resourceType];
      const dateLabels = dateLabelsByResourceType[resourceType];
      const rows = rowsByResourceType[resourceType];

      return [
        tabName,
        {
          getLastRow: () => {
            assertLocked(`${tabName} getLastRow`);
            state.getLastRowCalls.push(tabName);
            return dateLabels.length;
          },
          getRange: (
            row: number,
            column: number,
            rowCount: number,
            columnCount: number,
          ) => {
            state.rangeCalls.push({
              tabName,
              row,
              column,
              rowCount,
              columnCount,
            });

            if (column === 1) {
              return {
                getDisplayValues: () => {
                  assertLocked(`${tabName} column A read`);

                  if (columnCount === 18) {
                    return dateLabels
                      .slice(row - 1, row - 1 + rowCount)
                      .map((label, offset) => [
                        label,
                        ...(rows[row - 1 + offset] ?? buildGameRow()),
                      ]);
                  }

                  return dateLabels
                    .slice(row - 1, row - 1 + rowCount)
                    .map((label) => [label]);
                },
              };
            }

            if (column === 2 && rowCount === 1 && columnCount === 17) {
              return {
                getValues: () => {
                  assertLocked(`${tabName} target value read`);
                  return [rows[row - 1] ?? buildGameRow()];
                },
                getFormulas: () => {
                  assertLocked(`${tabName} target formula read`);
                  return [Array.from({ length: 17 }, () => "")];
                },
                setValues: (values: unknown[][]) => {
                  assertLocked(`${tabName} target write`);
                  const writtenValues = Array.from(values[0] ?? []);
                  state.writes.push({ tabName, row, values: writtenValues });
                  rows[row - 1] = writtenValues.map((value) =>
                    value == null ? "" : String(value),
                  );
                },
              };
            }

            return {
              getDisplayValues: () => {
                assertLocked(`${tabName} B:R read`);
                return rows.slice(row - 1, row - 1 + rowCount);
              },
            };
          },
        },
      ];
    }),
  );
  const lock = {
    waitLock: (timeoutMs: number) => {
      assert.equal(timeoutMs, 20_000);
      assert.equal(state.lockHeld, false);
      state.lockWaits += 1;
      state.lockHeld = true;
    },
    releaseLock: () => {
      assert.equal(state.lockHeld, true);
      state.lockReleases += 1;
      state.lockHeld = false;
    },
  };
  const scriptProperties = {
    getProperty: (name: string) => properties[name] ?? "",
    setProperty: (name: string, value: string) => {
      assertLocked("game segment cursor update");
      properties[name] = value;
      state.propertyWrites.push({ name, value });
    },
  };
  const globals = {
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
    },
    SpreadsheetApp: {
      openById: (spreadsheetId: string) => {
        assert.equal(spreadsheetId, "sheet-1");
        return {
          getSheetByName: (tabName: string) => sheets[tabName] ?? null,
        };
      },
    },
    LockService: {
      getDocumentLock: () => lock,
      getScriptLock: () => lock,
    },
  };

  return {
    context: loadLockScript(globals),
    dateLabelsByResourceType,
    properties,
    resourceTypeByTab,
    rowsByResourceType,
    state,
  };
}

function buildPcWritePayload(requestedMinutes: number): KioskLockPayload {
  return {
    secret: "test-secret",
    spreadsheetId: "sheet-1",
    tabName: "컴퓨터",
    todayLabel: "7/10",
    resourceType: "pc",
    row: [
      "12:00",
      "김 테스트",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "010-1234-5678",
      null,
      500,
      null,
    ],
    gameLimit: {
      memberName: "김 테스트",
      guardianPhone: "010-1234-5678",
      requestedMinutes,
      pricingRules: [
        { resourceType: "pc", amount: 500, minutes: 30 },
        { resourceType: "nintendo", amount: 1_000, minutes: 60 },
        { resourceType: "playstation", amount: 1_500, minutes: 90 },
      ],
    },
  };
}

function buildSpaceWritePayload(): KioskLockPayload {
  return {
    secret: "test-secret",
    spreadsheetId: "sheet-1",
    tabName: "무료콘텐츠",
    todayLabel: "7/10",
    resourceType: "space",
    row: [
      "12:00",
      "김 테스트",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "010-1234-5678",
      "공간이용",
      null,
      null,
    ],
  };
}

function createLockedSpaceCursorHarness({
  cursor = { todayLabel: "7/10", todayRowNumber: 1, rowNumber: 2 },
  dateLabels = ["7/10", "", "", "마감"],
  occupiedRows = [1],
  writeFails = false,
  propertyWriteFails = false,
}: {
  cursor?: {
    todayLabel: string;
    todayRowNumber?: number;
    rowNumber: number;
  } | null;
  dateLabels?: string[];
  occupiedRows?: number[];
  writeFails?: boolean;
  propertyWriteFails?: boolean;
} = {}) {
  const properties: Record<string, string> = {
    KIOSK_APPEND_SECRET: "test-secret",
    KIOSK_SPREADSHEET_ID: "sheet-1",
  };

  if (cursor) {
    properties.KIOSK_NEXT_ROW_SPACE = JSON.stringify(cursor);
  }

  const dateRows = dateLabels.map((label) => [label]);
  const rows = Array.from({ length: dateRows.length }, () => buildSpaceRow());

  occupiedRows.forEach((rowNumber) => {
    rows[rowNumber - 1] = buildSpaceRow(`기존 접수 ${rowNumber}`);
  });

  const state = {
    lockHeld: false,
    lockWaits: 0,
    lockReleases: 0,
    getLastRowCalls: 0,
    requestedTabs: [] as string[],
    rangeCalls: [] as RangeCall[],
    propertyWrites: [] as Array<{ name: string; value: string }>,
    writes: [] as Array<{ row: number; values: unknown[] }>,
  };
  const assertLocked = (operation: string) => {
    assert.equal(state.lockHeld, true, `${operation} must run while locked`);
  };
  const sheet = {
    getLastRow: () => {
      assertLocked("space getLastRow");
      state.getLastRowCalls += 1;
      return dateRows.length;
    },
    getRange: (
      row: number,
      column: number,
      rowCount: number,
      columnCount: number,
    ) => {
      state.rangeCalls.push([row, column, rowCount, columnCount]);

      if (column === 1 && rowCount === 1 && columnCount === 18) {
        return {
          getDisplayValues: () => {
            assertLocked("space cursor row read");
            return [[dateRows[row - 1]?.[0] ?? "", ...(rows[row - 1] ?? buildSpaceRow())]];
          },
        };
      }

      if (column === 1) {
        return {
          getDisplayValues: () => {
            assertLocked("space column A read");
            return dateRows.slice(row - 1, row - 1 + rowCount);
          },
        };
      }

      if (column === 2 && rowCount === 1 && columnCount === 17) {
        return {
          getDisplayValues: () => {
            assertLocked("space B:R segment read");
            return [rows[row - 1] ?? buildSpaceRow()];
          },
          getValues: () => {
            assertLocked("space target value read");
            return [rows[row - 1] ?? buildSpaceRow()];
          },
          getFormulas: () => {
            assertLocked("space target formula read");
            return [Array.from({ length: 17 }, () => "")];
          },
          setValues: (values: unknown[][]) => {
            assertLocked("space target write");

            if (writeFails) {
              throw new Error("simulated sheet write failure");
            }

            const writtenValues = Array.from(values[0] ?? []);
            state.writes.push({ row, values: writtenValues });
            rows[row - 1] = writtenValues.map((value) =>
              value == null ? "" : String(value),
            );
          },
        };
      }

      return {
        getDisplayValues: () => {
          assertLocked("space B:R segment read");
          return rows.slice(row - 1, row - 1 + rowCount);
        },
      };
    },
  };
  const lock = {
    waitLock: (timeoutMs: number) => {
      assert.equal(timeoutMs, 20_000);
      assert.equal(state.lockHeld, false);
      state.lockWaits += 1;
      state.lockHeld = true;
    },
    releaseLock: () => {
      assert.equal(state.lockHeld, true);
      state.lockReleases += 1;
      state.lockHeld = false;
    },
  };
  const globals = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name: string) => properties[name] ?? "",
        setProperty: (name: string, value: string) => {
          assertLocked("next-row cursor update");

          if (propertyWriteFails) {
            throw new Error("simulated property write failure");
          }

          properties[name] = value;
          state.propertyWrites.push({ name, value });
        },
      }),
    },
    SpreadsheetApp: {
      openById: (spreadsheetId: string) => {
        assert.equal(spreadsheetId, "sheet-1");
        return {
          getSheetByName: (tabName: string) => {
            state.requestedTabs.push(tabName);
            return tabName === "무료콘텐츠" ? sheet : null;
          },
        };
      },
    },
    LockService: {
      getDocumentLock: () => lock,
      getScriptLock: () => lock,
    },
  };

  return { context: loadLockScript(globals), properties, state };
}

test("Apps Script scans column A and only today's B:R segment while holding the lock", () => {
  const context = loadLockScript();
  const findRow = context.findSheetInsertRowIndexFromSheet_;

  assert.equal(typeof findRow, "function");

  const columnA = Array.from({ length: 5_000 }, () => [""]);
  columnA[4_899] = ["7/10"];
  columnA[4_999] = ["마감"];

  const intakeRows = Array.from({ length: 100 }, () =>
    Array.from({ length: 17 }, () => ""),
  );
  intakeRows[0][0] = "이미 접수";
  const calls: RangeCall[] = [];
  const sheet = {
    getLastRow: () => columnA.length,
    getRange: (
      row: number,
      column: number,
      rowCount: number,
      columnCount: number,
    ) => {
      calls.push([row, column, rowCount, columnCount]);
      return {
        getDisplayValues: () => {
          if (column === 1) {
            return columnA;
          }

          return intakeRows;
        },
      };
    },
  };

  assert.equal(findRow?.(sheet, "space", "7/10"), 4_900);
  assert.deepEqual(calls, [
    [1, 1, 5_000, 1],
    [4_900, 2, 100, 17],
  ]);
  assert.equal(calls.some((call) => call[3] === 20), false);
});

test("space intake uses the saved next row without scanning or game policy reads", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness();
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  const result = writeSubmission?.(buildSpaceWritePayload(), {});

  assert.equal(result?.rowNumber, 2);
  assert.equal(state.getLastRowCalls, 0);
  assert.deepEqual(state.requestedTabs, ["무료콘텐츠"]);
  assert.deepEqual(state.rangeCalls, [
    [1, 1, 2, 1],
    [2, 2, 1, 17],
  ]);
  assert.equal(state.writes.length, 1);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 3,
  });
});

test("occupied space cursor falls back to one full scan and repairs the next row", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness({
    occupiedRows: [1, 2],
  });
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  const result = writeSubmission?.(buildSpaceWritePayload(), {});

  assert.equal(result?.rowNumber, 3);
  assert.equal(state.getLastRowCalls, 1);
  assert.deepEqual(state.rangeCalls, [
    [1, 1, 2, 1],
    [2, 2, 1, 17],
    [1, 1, 4, 1],
    [1, 2, 3, 17],
    [3, 2, 1, 17],
  ]);
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 4,
  });
});

test("a stale date cursor is ignored and rebuilt from today's segment", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness({
    cursor: { todayLabel: "7/9", rowNumber: 2 },
  });
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  const result = writeSubmission?.(buildSpaceWritePayload(), {});

  assert.equal(result?.rowNumber, 2);
  assert.equal(state.getLastRowCalls, 1);
  assert.deepEqual(state.rangeCalls, [
    [1, 1, 4, 1],
    [1, 2, 3, 17],
    [2, 2, 1, 17],
  ]);
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 3,
  });
});

test("a failed space write does not advance the saved next row", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness({
    writeFails: true,
  });
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.throws(
    () => writeSubmission?.(buildSpaceWritePayload(), {}),
    /simulated sheet write failure/,
  );
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 2,
  });
  assert.deepEqual(state.propertyWrites, []);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("a space cursor never writes past a newly inserted segment boundary", () => {
  const { context, state } = createLockedSpaceCursorHarness({
    cursor: { todayLabel: "7/10", todayRowNumber: 1, rowNumber: 3 },
    dateLabels: ["7/10", "마감", "", ""],
    occupiedRows: [1],
  });
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.throws(
    () => writeSubmission?.(buildSpaceWritePayload(), {}),
    /7\/10 segment has no writable kiosk row/,
  );
  assert.equal(state.getLastRowCalls, 1);
  assert.deepEqual(state.writes, []);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("two consecutive space intakes advance rows and the cursor one at a time", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness();
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildSpaceWritePayload(), {}).rowNumber, 2);
  assert.equal(writeSubmission?.(buildSpaceWritePayload(), {}).rowNumber, 3);
  assert.deepEqual(
    state.writes.map((write) => write.row),
    [2, 3],
  );
  assert.equal(state.getLastRowCalls, 0);
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 4,
  });
});

test("a cursor property failure does not turn a successful space write into a failure", () => {
  const { context, properties, state } = createLockedSpaceCursorHarness({
    propertyWriteFails: true,
  });
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildSpaceWritePayload(), {}).rowNumber, 2);
  assert.equal(state.writes.length, 1);
  assert.deepEqual(JSON.parse(properties.KIOSK_NEXT_ROW_SPACE ?? "{}"), {
    todayLabel: "7/10",
    todayRowNumber: 1,
    rowNumber: 2,
  });
  assert.deepEqual(state.propertyWrites, []);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("Apps Script preserves prepared values and formulas in skipped cells", () => {
  const context = loadLockScript();
  const mergeRow = context.mergeSubmissionRow_;

  assert.equal(typeof mergeRow, "function");
  assert.deepEqual(
    Array.from(
      mergeRow?.(
        ["", "", "학교 기본값", "", 0, "", "", "", "", "", "", "", "", "", "공간이용", "", ""],
        ["=NOW()", "", "", "=IF(A1=\"\",\"\",A1)", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ["12:00", "김테스트", null, null, null, null, null, null, null, null, null, null, null, "01012345678", null, 500, null],
      ) ?? [],
    ),
    [
      "12:00",
      "김테스트",
      "학교 기본값",
      '=IF(A1="","",A1)',
      0,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "01012345678",
      "공간이용",
      500,
      "",
    ],
  );
});

test("Apps Script range write preserves prepared cells through the full write helper", () => {
  const context = loadLockScript();
  const writeRow = context.writeSubmissionRow_;
  const operations: string[] = [];
  let writtenValues: unknown[][] = [];
  const currentValues = [
    "",
    "",
    "학교 기본값",
    "",
    0,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "공간이용",
    "",
    "",
  ];
  const currentFormulas = [
    "=NOW()",
    "",
    "",
    '=IF(A1="","",A1)',
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
  const submittedValues = [
    "12:00",
    "김테스트",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "01012345678",
    null,
    500,
    null,
  ];

  assert.equal(typeof writeRow, "function");
  writeRow?.(
    {
      getValues: () => {
        operations.push("getValues");
        return [currentValues];
      },
      getFormulas: () => {
        operations.push("getFormulas");
        return [currentFormulas];
      },
      setValues: (values) => {
        operations.push("setValues");
        writtenValues = values;
      },
    },
    submittedValues,
  );

  assert.deepEqual(operations, ["getValues", "getFormulas", "setValues"]);
  assert.deepEqual(Array.from(writtenValues[0] ?? []), [
    "12:00",
    "김테스트",
    "학교 기본값",
    '=IF(A1="","",A1)',
    0,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "01012345678",
    "공간이용",
    500,
    "",
  ]);
});

test("Apps Script totals all game tabs before accepting a locked write", () => {
  const context = loadLockScript();
  const getMinutes = context.getDailyGameMinutesFromSegments_;
  const row = ({
    name,
    phone,
    pcAmount,
    rentalAmount,
  }: {
    name: string;
    phone: string;
    pcAmount?: string;
    rentalAmount?: string;
  }) => {
    const values = Array.from({ length: 17 }, () => "");
    values[1] = name;
    values[13] = phone;
    values[15] = pcAmount ?? "";
    values[16] = rentalAmount ?? "";
    return values;
  };
  const gameLimit = {
    memberName: "김 테스트",
    guardianPhone: "010-1234-5678",
    pricingRules: [
      { resourceType: "pc", amount: 500, minutes: 30 },
      { resourceType: "nintendo", amount: 1_000, minutes: 60 },
      { resourceType: "playstation", amount: 1_500, minutes: 90 },
    ],
  };

  assert.equal(typeof getMinutes, "function");
  assert.equal(
    getMinutes?.(
      {
        pc: {
          intakeRows: [
            row({ name: "김테스트", phone: "01012345678", pcAmount: "500" }),
          ],
        },
        nintendo: {
          intakeRows: [
            row({
              name: "김 테스트",
              phone: "010-1234-5678",
              rentalAmount: "1,000",
            }),
          ],
        },
        playstation: {
          intakeRows: [
            row({
              name: "다른 이용자",
              phone: "01012345678",
              rentalAmount: "1,500",
            }),
          ],
        },
      },
      gameLimit,
    ),
    90,
  );
});

test("the first game intake scans all tabs and saves one fresh segment cursor", () => {
  const { context, properties, state } = createGameSegmentCursorHarness({
    usageByResourceType: {
      pc: { pcAmount: "500" },
      nintendo: { rentalAmount: "500" },
      playstation: { rentalAmount: "500" },
    },
  });
  const writeSubmission = context.writeKioskSubmission_;
  const timing: Record<string, number> = {};
  const beforeMs = Date.now();

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildPcWritePayload(30), timing).rowNumber, 5);
  const afterMs = Date.now();

  assert.equal(timing.gameSegmentCursorHits, 0);
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) =>
          call.row === 1 &&
          call.column === 1 &&
          call.rowCount === 7 &&
          call.columnCount === 1,
      )
      .map((call) => call.tabName)
      .sort(),
    ["닌텐도", "컴퓨터", "플스"],
  );
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) =>
          call.row === 4 &&
          call.column === 2 &&
          call.rowCount === 3 &&
          call.columnCount === 17,
      )
      .map((call) => call.tabName)
      .sort(),
    ["닌텐도", "컴퓨터", "플스"],
  );
  assert.deepEqual(state.propertyWrites.map((write) => write.name), [
    "KIOSK_GAME_TODAY_SEGMENTS",
  ]);

  const savedCursor = JSON.parse(
    properties.KIOSK_GAME_TODAY_SEGMENTS ?? "{}",
  ) as GameSegmentCursor;

  assert.equal(savedCursor.version, 1);
  assert.equal(savedCursor.todayLabel, "7/10");
  assert.ok(savedCursor.savedAtMs >= beforeMs);
  assert.ok(savedCursor.savedAtMs <= afterMs);
  assert.deepEqual(savedCursor.segments, {
    pc: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
    nintendo: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
    playstation: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
  });
  assert.deepEqual(state.writes.map((write) => write.row), [5]);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("a missing PlayStation date segment counts as zero and does not block PC intake", () => {
  const { context, dateLabelsByResourceType, properties, state } =
    createGameSegmentCursorHarness();
  const writeSubmission = context.writeKioskSubmission_;

  dateLabelsByResourceType.playstation.splice(
    0,
    dateLabelsByResourceType.playstation.length,
    "7/9",
    "",
    "마감",
  );

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildPcWritePayload(30), {}).rowNumber, 4);
  assert.deepEqual(state.writes.map((write) => write.tabName), ["컴퓨터"]);

  const savedCursor = JSON.parse(
    properties.KIOSK_GAME_TODAY_SEGMENTS ?? "{}",
  ) as GameSegmentCursor;

  assert.deepEqual(savedCursor.segments, {
    pc: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
    nintendo: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
  });
});

test("a PlayStation intake still requires its own date segment", () => {
  const { context, dateLabelsByResourceType, state } =
    createGameSegmentCursorHarness();
  const writeSubmission = context.writeKioskSubmission_;

  dateLabelsByResourceType.playstation.splice(
    0,
    dateLabelsByResourceType.playstation.length,
    "7/9",
    "",
    "마감",
  );

  assert.equal(typeof writeSubmission, "function");
  assert.throws(
    () =>
      writeSubmission?.({ ...buildPcWritePayload(30), resourceType: "playstation", tabName: "플스" }, {}),
    /7\/10 date row not found/,
  );
  assert.deepEqual(state.writes, []);
});

test("a same-day game intake validates narrow cached segments and sees newly occupied rows", () => {
  const { context, state } = createGameSegmentCursorHarness();
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildPcWritePayload(30), {}).rowNumber, 4);

  state.getLastRowCalls.length = 0;
  state.rangeCalls.length = 0;
  state.propertyWrites.length = 0;
  const timing: Record<string, number> = {};

  assert.equal(writeSubmission?.(buildPcWritePayload(30), timing).rowNumber, 5);
  assert.equal(timing.gameSegmentCursorHits, 3);
  assert.deepEqual([...state.getLastRowCalls].sort(), [
    "닌텐도",
    "컴퓨터",
    "플스",
  ]);
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) =>
          call.row === 4 &&
          call.column === 1 &&
          call.rowCount === 4 &&
          call.columnCount === 18,
      )
      .map((call) => call.tabName)
      .sort(),
    ["닌텐도", "컴퓨터", "플스"],
  );
  assert.equal(
    state.rangeCalls.some(
      (call) =>
        call.row === 1 && call.column === 1 && call.columnCount === 1,
    ),
    false,
  );
  assert.deepEqual(
    state.writes.map((write) => write.row),
    [4, 5],
  );
  assert.equal(state.lockWaits, 2);
  assert.equal(state.lockReleases, 2);
  assert.equal(state.lockHeld, false);
});

const invalidGameSegmentCursors: Array<{
  name: string;
  cursor: GameSegmentCursor | string;
  expectedCursorHits: number;
  expectedFullScanTabs: string[];
}> = [
  {
    name: "a different M/d label",
    cursor: buildGameSegmentCursor({ todayLabel: "7/9" }),
    expectedCursorHits: 0,
    expectedFullScanTabs: ["닌텐도", "컴퓨터", "플스"],
  },
  {
    name: "a cache older than 36 hours",
    cursor: buildGameSegmentCursor({
      savedAtMs: Date.now() - 36 * 60 * 60 * 1_000 - 1,
    }),
    expectedCursorHits: 0,
    expectedFullScanTabs: ["닌텐도", "컴퓨터", "플스"],
  },
  {
    name: "a materially future timestamp",
    cursor: buildGameSegmentCursor({
      savedAtMs: Date.now() + 10 * 60 * 1_000,
    }),
    expectedCursorHits: 0,
    expectedFullScanTabs: ["닌텐도", "컴퓨터", "플스"],
  },
  {
    name: "invalid row coordinates",
    cursor: {
      ...buildGameSegmentCursor(),
      segments: {
        ...buildGameSegmentCursor().segments,
        pc: {
          todayRowNumber: 4,
          segmentEndRowNumber: 4,
          lastRow: 7,
        },
      },
    },
    expectedCursorHits: 2,
    expectedFullScanTabs: ["컴퓨터"],
  },
  {
    name: "malformed JSON",
    cursor: "{not-json",
    expectedCursorHits: 0,
    expectedFullScanTabs: ["닌텐도", "컴퓨터", "플스"],
  },
];

invalidGameSegmentCursors.forEach(
  ({ name, cursor, expectedCursorHits, expectedFullScanTabs }) => {
  test(`an invalid game segment cursor (${name}) falls back and repairs the cache`, () => {
    const { context, properties, state } = createGameSegmentCursorHarness({
      cursor,
    });
    const writeSubmission = context.writeKioskSubmission_;
    const timing: Record<string, number> = {};

    assert.equal(typeof writeSubmission, "function");
    assert.equal(writeSubmission?.(buildPcWritePayload(30), timing).rowNumber, 4);
    assert.equal(timing.gameSegmentCursorHits, expectedCursorHits);
    assert.deepEqual(
      state.rangeCalls
        .filter(
          (call) =>
            call.row === 1 &&
            call.column === 1 &&
            call.rowCount === 7 &&
            call.columnCount === 1,
        )
        .map((call) => call.tabName)
        .sort(),
      [...expectedFullScanTabs].sort(),
    );
    assert.deepEqual(state.propertyWrites.map((write) => write.name), [
      "KIOSK_GAME_TODAY_SEGMENTS",
    ]);

    const repairedCursor = JSON.parse(
      properties.KIOSK_GAME_TODAY_SEGMENTS ?? "{}",
    ) as GameSegmentCursor;

    assert.equal(repairedCursor.version, 1);
    assert.equal(repairedCursor.todayLabel, "7/10");
    assert.ok(Date.now() - repairedCursor.savedAtMs < 1_000);
    assert.deepEqual(repairedCursor.segments, {
      pc: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
      nintendo: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
      playstation: { todayRowNumber: 4, segmentEndRowNumber: 7, lastRow: 7 },
    });
    assert.equal(state.lockReleases, 1);
    assert.equal(state.lockHeld, false);
  });
  },
);

test("a shifted cached boundary scans only its tab and repairs the combined cache", () => {
  const {
    context,
    dateLabelsByResourceType,
    properties,
    state,
  } = createGameSegmentCursorHarness({ cursor: buildGameSegmentCursor() });
  const writeSubmission = context.writeKioskSubmission_;
  const timing: Record<string, number> = {};

  dateLabelsByResourceType.nintendo[5] = "7/11";

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildPcWritePayload(30), timing).rowNumber, 4);
  assert.equal(timing.gameSegmentCursorHits, 2);
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) =>
          call.row === 1 &&
          call.column === 1 &&
          call.columnCount === 1,
      )
      .map((call) => call.tabName)
      .sort(),
    ["닌텐도"],
  );

  const repairedCursor = JSON.parse(
    properties.KIOSK_GAME_TODAY_SEGMENTS ?? "{}",
  ) as GameSegmentCursor;

  assert.deepEqual(repairedCursor.segments.nintendo, {
    todayRowNumber: 4,
    segmentEndRowNumber: 6,
    lastRow: 7,
  });
  assert.deepEqual(repairedCursor.segments.pc, {
    todayRowNumber: 4,
    segmentEndRowNumber: 7,
    lastRow: 7,
  });
  assert.deepEqual(state.propertyWrites.map((write) => write.name), [
    "KIOSK_GAME_TODAY_SEGMENTS",
  ]);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("a last-row mismatch scans only its tab and repairs the combined cache", () => {
  const {
    context,
    dateLabelsByResourceType,
    properties,
    rowsByResourceType,
    state,
  } = createGameSegmentCursorHarness({ cursor: buildGameSegmentCursor() });
  const writeSubmission = context.writeKioskSubmission_;
  const timing: Record<string, number> = {};

  dateLabelsByResourceType.pc.push("");
  rowsByResourceType.pc.push(buildGameRow());

  assert.equal(typeof writeSubmission, "function");
  assert.equal(writeSubmission?.(buildPcWritePayload(30), timing).rowNumber, 4);
  assert.equal(timing.gameSegmentCursorHits, 2);
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) => call.row === 1 && call.column === 1 && call.columnCount === 1,
      )
      .map((call) => call.tabName)
      .sort(),
    ["컴퓨터"],
  );

  const repairedCursor = JSON.parse(
    properties.KIOSK_GAME_TODAY_SEGMENTS ?? "{}",
  ) as GameSegmentCursor;

  assert.deepEqual(repairedCursor.segments.pc, {
    todayRowNumber: 4,
    segmentEndRowNumber: 7,
    lastRow: 8,
  });
  assert.deepEqual(state.propertyWrites.map((write) => write.name), [
    "KIOSK_GAME_TODAY_SEGMENTS",
  ]);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("a cached three-tab total still rejects over-limit writes inside the same lock", () => {
  const { context, state } = createGameSegmentCursorHarness({
    cursor: buildGameSegmentCursor(),
    usageByResourceType: {
      pc: { pcAmount: "500" },
      nintendo: { rentalAmount: "500" },
      playstation: { rentalAmount: "500" },
    },
  });
  const writeSubmission = context.writeKioskSubmission_;
  const timing: Record<string, number> = {};

  assert.equal(typeof writeSubmission, "function");
  assert.throws(
    () => writeSubmission?.(buildPcWritePayload(60), timing),
    /오늘 남은 시간은 30분/,
  );
  assert.equal(timing.gameSegmentCursorHits, 3);
  assert.deepEqual(
    state.rangeCalls
      .filter(
        (call) =>
          call.row === 4 &&
          call.column === 1 &&
          call.rowCount === 4 &&
          call.columnCount === 18,
      )
      .map((call) => call.tabName)
      .sort(),
    ["닌텐도", "컴퓨터", "플스"],
  );
  assert.equal(
    state.rangeCalls.some(
      (call) =>
        call.row === 1 && call.column === 1 && call.columnCount === 1,
    ),
    false,
  );
  assert.deepEqual(state.writes, []);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("Apps Script reads all game tabs and writes 90 plus 30 minutes while locked", () => {
  const { context, state } = createLockedGameWriteHarness();
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  const result = writeSubmission?.(buildPcWritePayload(30), {});

  assert.equal(result?.rowNumber, 2);
  assert.deepEqual(Array.from(state.readTabs).sort(), [
    "닌텐도",
    "컴퓨터",
    "플스",
  ]);
  assert.equal(state.openCalls, 1);
  assert.equal(state.lockRequests, 1);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0]?.tabName, "컴퓨터");
  assert.equal(state.writes[0]?.row, 2);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("Apps Script rejects an over-limit game write without writing and releases the lock", () => {
  const { context, state } = createLockedGameWriteHarness();
  const writeSubmission = context.writeKioskSubmission_;

  assert.equal(typeof writeSubmission, "function");
  assert.throws(
    () => writeSubmission?.(buildPcWritePayload(60), {}),
    /오늘 남은 시간은 30분/,
  );
  assert.deepEqual(Array.from(state.readTabs).sort(), [
    "닌텐도",
    "컴퓨터",
    "플스",
  ]);
  assert.equal(state.openCalls, 1);
  assert.equal(state.lockRequests, 1);
  assert.equal(state.lockWaits, 1);
  assert.equal(state.writes.length, 0);
  assert.equal(state.lockReleases, 1);
  assert.equal(state.lockHeld, false);
});

test("Apps Script rejects invalid write targets before opening or locking a sheet", () => {
  const invalidCases: Array<{
    name: string;
    payload: KioskLockPayload;
    expectedError: RegExp;
  }> = [
    {
      name: "spreadsheet id",
      payload: { ...buildPcWritePayload(30), spreadsheetId: "other-sheet" },
      expectedError: /Invalid kiosk sheet write target/,
    },
    {
      name: "resource tab",
      payload: { ...buildPcWritePayload(30), tabName: "닌텐도" },
      expectedError: /Invalid kiosk resource tab/,
    },
    {
      name: "resource type",
      payload: { ...buildPcWritePayload(30), resourceType: "unknown" },
      expectedError: /Invalid kiosk resource tab/,
    },
  ];

  invalidCases.forEach(({ name, payload, expectedError }) => {
    const { context, state } = createLockedGameWriteHarness();
    const writeSubmission = context.writeKioskSubmission_;

    assert.equal(typeof writeSubmission, "function", name);
    assert.throws(() => writeSubmission?.(payload, {}), expectedError, name);
    assert.equal(state.openCalls, 0, name);
    assert.equal(state.lockRequests, 0, name);
    assert.equal(state.lockWaits, 0, name);
    assert.equal(state.writes.length, 0, name);
  });
});

test("Apps Script keeps the game limit check inside the same lock as the write", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/google-sheets-kiosk-lock.gs"),
    "utf8",
  );
  const lockIndex = source.indexOf("lock.waitLock");
  const policyIndex = source.indexOf("readDailyGameUsageInsideLock_");
  const writeIndex = source.indexOf("writeSubmissionRow_");
  const releaseIndex = source.indexOf("lock.releaseLock");

  assert.ok(lockIndex >= 0);
  assert.ok(policyIndex > lockIndex);
  assert.ok(writeIndex > policyIndex);
  assert.ok(releaseIndex > writeIndex);
});
