import "server-only";

import type { StoreState } from "@/lib/server/state";
import { reconcileState, seedState } from "@/lib/server/state";
import {
  getDefaultSqlitePath,
  SQLiteStateStore,
} from "@/lib/server/sqlite-state-store";

export interface StoreRepository {
  read(now?: Date): StoreState;
  mutate<T>(mutator: (state: StoreState, now: Date) => T, now?: Date): T;
  reset(now?: Date): void;
}

export type StoreRepositoryMode = "demo" | "local-sqlite";

export type StoreRepositoryStatus = {
  mode: StoreRepositoryMode;
  storage: "memory" | "sqlite";
  hasDatabaseUrl: boolean;
  sqlitePath?: string;
};

const globalStore = globalThis as typeof globalThis & {
  __autopanStore?: StoreState;
  __autopanRepository?: StoreRepository;
};

function ensureState(now = new Date()) {
  if (!globalStore.__autopanStore) {
    globalStore.__autopanStore = seedState(now);
    reconcileState(globalStore.__autopanStore, now);
  }

  return globalStore.__autopanStore;
}

export function createDemoRepository(): StoreRepository {
  return {
    read(now = new Date()) {
      return structuredClone(ensureState(now)) as StoreState;
    },
    mutate<T>(mutator: (state: StoreState, now: Date) => T, now = new Date()) {
      const state = ensureState(now);
      return mutator(state, now);
    },
    reset(now = new Date()) {
      globalStore.__autopanStore = seedState(now);
      reconcileState(globalStore.__autopanStore, now);
    },
  };
}

export function createSqliteRepository(databasePath = getDefaultSqlitePath()): StoreRepository {
  const store = new SQLiteStateStore(databasePath);

  return {
    read(now = new Date()) {
      const state = store.read(now);
      reconcileState(state, now);
      store.write(state, now);
      return structuredClone(state) as StoreState;
    },
    mutate<T>(mutator: (state: StoreState, now: Date) => T, now = new Date()) {
      const state = store.read(now);
      const result = mutator(state, now);
      store.write(state, now);
      return result;
    },
    reset(now = new Date()) {
      const state = store.reset(now);
      reconcileState(state, now);
      store.write(state, now);
    },
  };
}

function resolveRepositoryStatus(): StoreRepositoryStatus {
  const explicitMode = process.env.AUTOPAN_STORAGE_MODE;
  const shouldUseSqlite =
    explicitMode === "sqlite" ||
    Boolean(process.env.AUTOPAN_SQLITE_PATH) ||
    (!explicitMode && process.env.NODE_ENV === "production");

  if (shouldUseSqlite) {
    return {
      mode: "local-sqlite",
      storage: "sqlite",
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      sqlitePath: getDefaultSqlitePath(),
    };
  }

  return {
    mode: "demo",
    storage: "memory",
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  };
}

function createDefaultRepository() {
  const status = resolveRepositoryStatus();
  return status.storage === "sqlite"
    ? createSqliteRepository(status.sqlitePath)
    : createDemoRepository();
}

export function getStoreRepository() {
  if (!globalStore.__autopanRepository) {
    globalStore.__autopanRepository = createDefaultRepository();
  }

  return globalStore.__autopanRepository;
}

export function getStoreRepositoryStatus() {
  return resolveRepositoryStatus();
}
