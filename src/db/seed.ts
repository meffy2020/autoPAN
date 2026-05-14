import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { env } from "@/lib/env";

const client = postgres(env.DATABASE_URL, {
  max: 1,
});

async function main() {
  const seedPath = path.join(process.cwd(), "db", "seed.sql");
  const seedSql = await readFile(seedPath, "utf8");

  await client.begin(async (tx) => {
    await tx.unsafe(seedSql);
  });

  await client.end({ timeout: 5 });
  console.log(`Seeded database from ${seedPath}`);
}

main().catch(async (error) => {
  console.error(error);
  await client.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});

