import "server-only";

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

let client: Redis | null | undefined;

export function getKioskRedis() {
  if (client !== undefined) {
    return client;
  }

  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();

  if (!url || !token) {
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}

export async function withKioskRedisLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const redis = getKioskRedis();

  if (!redis) {
    return work();
  }

  const token = randomUUID();
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const locked = await redis.set(key, token, { nx: true, px: 20_000 });

    if (locked === "OK") {
      try {
        return await work();
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
          [key],
          [token],
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  throw new Error("접수가 몰려 잠시 처리하지 못했어요. 다시 눌러 주세요.");
}
