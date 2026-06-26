import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { AppError } from "../types/errors.js";

const releaseLockScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export class RedisLock {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<string> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (result !== "OK") {
      throw new AppError("LOCK_BUSY", "Resource is currently locked", 423);
    }
    return token;
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(releaseLockScript, 1, key, token);
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const token = await this.acquire(key, ttlMs);
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}
