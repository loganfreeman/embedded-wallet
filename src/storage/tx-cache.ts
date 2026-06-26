import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { BuildTxResponse, CachedTxSession } from "../types/transactions.js";

export type IdempotencyRecord =
  | {
      status: "building";
      requestHash: string;
      createdAt: string;
      expiresAt: string;
    }
  | {
      status: "built";
      requestHash: string;
      txId: string;
      response: BuildTxResponse;
      createdAt: string;
      expiresAt: string;
    }
  | {
      status: "failed";
      requestHash: string;
      error: string;
      createdAt: string;
      expiresAt: string;
    };

export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const hashRequest = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");

export class TxCache {
  constructor(private readonly redis: Redis) {}

  txKey(txId: string): string {
    return `tx:build:${txId}`;
  }

  idempotencyKey(clientId: string, idempotencyKey: string): string {
    return `tx:idempotency:${clientId}:${idempotencyKey}`;
  }

  broadcastKey(txId: string): string {
    return `tx:broadcast:${txId}`;
  }

  async getSession(txId: string): Promise<CachedTxSession | null> {
    const raw = await this.redis.get(this.txKey(txId));
    return raw ? (JSON.parse(raw) as CachedTxSession) : null;
  }

  async setSession(session: CachedTxSession, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      this.txKey(session.txId),
      JSON.stringify(session),
      "EX",
      ttlSeconds,
    );
  }

  async getIdempotencyRecord(
    clientId: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.get(this.idempotencyKey(clientId, key));
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
  }

  async createBuildingRecord(
    clientId: string,
    key: string,
    record: IdempotencyRecord,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.idempotencyKey(clientId, key),
      JSON.stringify(record),
      "EX",
      ttlSeconds,
      "NX",
    );
    return result === "OK";
  }

  async setIdempotencyRecord(
    clientId: string,
    key: string,
    record: IdempotencyRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      this.idempotencyKey(clientId, key),
      JSON.stringify(record),
      "EX",
      ttlSeconds,
    );
  }

  async getBroadcastResult<T>(txId: string): Promise<T | null> {
    const raw = await this.redis.get(this.broadcastKey(txId));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setBroadcastResult<T>(
    txId: string,
    result: T,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      this.broadcastKey(txId),
      JSON.stringify(result),
      "EX",
      ttlSeconds,
    );
  }
}
