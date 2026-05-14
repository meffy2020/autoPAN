import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { StoreState } from "@/lib/server/state";
import { seedState } from "@/lib/server/state";

type SQLiteStatement = {
  get: (...parameters: unknown[]) => unknown;
  run: (...parameters: unknown[]) => unknown;
};

type SQLiteDatabase = {
  close: () => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => SQLiteStatement;
};

type SQLiteModule = {
  DatabaseSync: new (path: string) => SQLiteDatabase;
};

const STATE_ROW_ID = "current";

type StateRow = {
  payload: string;
};

function loadSQLiteModule() {
  const getBuiltinModule = (
    process as typeof process & {
      getBuiltinModule?: (moduleName: string) => unknown;
    }
  ).getBuiltinModule;

  if (!getBuiltinModule) {
    throw new Error("현재 Node.js 런타임에서 node:sqlite를 사용할 수 없습니다.");
  }

  return getBuiltinModule("node:sqlite") as SQLiteModule;
}

export function getDefaultSqlitePath() {
  if (process.env.AUTOPAN_SQLITE_PATH) {
    return process.env.AUTOPAN_SQLITE_PATH;
  }

  if (process.platform === "win32") {
    const programData = process.env.ProgramData ?? "C:\\ProgramData";
    return join(programData, "autoPAN", "autopan.sqlite");
  }

  return join(process.cwd(), ".autopan", "autopan.sqlite");
}

export class SQLiteStateStore {
  private readonly db: SQLiteDatabase;

  constructor(private readonly databasePath = getDefaultSqlitePath()) {
    const { DatabaseSync } = loadSQLiteModule();

    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  get path() {
    return this.databasePath;
  }

  close() {
    this.db.close();
  }

  read(now = new Date()) {
    const row = this.db
      .prepare("SELECT payload FROM app_state WHERE id = ?")
      .get(STATE_ROW_ID) as StateRow | undefined;

    if (!row) {
      const seeded = seedState(now);
      this.write(seeded, now);
      return seeded;
    }

    return JSON.parse(row.payload) as StoreState;
  }

  write(state: StoreState, now = new Date()) {
    this.db
      .prepare(`
        INSERT INTO app_state (id, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `)
      .run(STATE_ROW_ID, JSON.stringify(state), now.toISOString());
  }

  reset(now = new Date()) {
    const seeded = seedState(now);
    this.write(seeded, now);
    return seeded;
  }
}
