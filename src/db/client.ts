import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __autopanPostgresClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__autopanPostgresClient ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "development" ? 1 : 10,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.__autopanPostgresClient = client;
}

export const db = drizzle(client, { schema });
