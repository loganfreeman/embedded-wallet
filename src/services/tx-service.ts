import { randomUUID } from "node:crypto";
import type { RedisLock } from "../storage/locks.js";
import { hashRequest, type TxCache } from "../storage/tx-cache.js";
import type {
  BroadcastTxRequest,
  BroadcastTxResponse,
  BuildTxRequest,
  BuildTxResponse,
  CachedTxSession,
} from "../types/transactions.js";
import { AppError, invariant } from "../types/errors.js";
import { adapterForNetwork } from "../adapters/index.js";
import { env } from "../config/env.js";

const nowIso = (): string => new Date().toISOString();

const expiresAtIso = (ttlSeconds: number): string =>
  new Date(Date.now() + ttlSeconds * 1000).toISOString();

export class TxService {
  constructor(
    private readonly cache: TxCache,
    private readonly lock: RedisLock,
  ) {}

  async build(clientId: string, request: BuildTxRequest): Promise<BuildTxResponse> {
    const requestHash = hashRequest(request);
    const expiresAt = expiresAtIso(env.txSessionTtlSeconds);
    const created = await this.cache.createBuildingRecord(
      clientId,
      request.idempotency_key,
      {
        status: "building",
        requestHash,
        createdAt: nowIso(),
        expiresAt,
      },
      env.txSessionTtlSeconds,
    );

    if (!created) {
      const existing = await this.cache.getIdempotencyRecord(
        clientId,
        request.idempotency_key,
      );
      invariant(existing, "IDEMPOTENCY_CONFLICT", "Idempotency record disappeared", 409);
      invariant(
        existing.requestHash === requestHash,
        "IDEMPOTENCY_KEY_REUSED",
        "idempotency_key was already used with different transaction details",
        409,
      );
      if (existing.status === "built") {
        return existing.response;
      }
      if (existing.status === "building") {
        throw new AppError("BUILD_IN_PROGRESS", "Transaction build is in progress", 409);
      }
      throw new AppError("PREVIOUS_BUILD_FAILED", existing.error, 409);
    }

    const walletLockKey = `tx:lock:build:${request.network}:${request.from.toLowerCase()}`;
    try {
      return await this.lock.withLock(walletLockKey, env.buildLockTtlMs, async () => {
        const adapter = adapterForNetwork(request.network);
        const adapterResult = await adapter.build(request);
        const txId = randomUUID();
        const response: BuildTxResponse = {
          txId,
          network: request.network,
          status: "requires_signature",
          expiresAt,
          signingPayloads: adapterResult.signingPayloads,
          signingInstructions: adapterResult.signingInstructions,
          display: adapterResult.display,
        };
        const session: CachedTxSession = {
          txId,
          network: request.network,
          chain: adapterResult.chain,
          from: request.from,
          to: request.to,
          amount: request.amount,
          asset: request.asset,
          status: "built",
          signingPayloads: adapterResult.signingPayloads,
          signingInstructions: adapterResult.signingInstructions,
          adapterContext: adapterResult.adapterContext,
          createdAt: nowIso(),
          expiresAt,
        };
        await this.cache.setSession(session, env.txSessionTtlSeconds);
        await this.cache.setIdempotencyRecord(
          clientId,
          request.idempotency_key,
          {
            status: "built",
            requestHash,
            txId,
            response,
            createdAt: nowIso(),
            expiresAt,
          },
          env.txSessionTtlSeconds,
        );
        return response;
      });
    } catch (error) {
      await this.cache.setIdempotencyRecord(
        clientId,
        request.idempotency_key,
        {
          status: "failed",
          requestHash,
          error: error instanceof Error ? error.message : "Unknown build error",
          createdAt: nowIso(),
          expiresAt,
        },
        env.txSessionTtlSeconds,
      );
      throw error;
    }
  }

  async broadcast(request: BroadcastTxRequest): Promise<BroadcastTxResponse> {
    const existing = await this.cache.getBroadcastResult<BroadcastTxResponse>(
      request.txId,
    );
    if (existing) return existing;

    const session = await this.cache.getSession(request.txId);
    invariant(session, "TX_EXPIRED", "Transaction session expired or not found", 410);
    invariant(Date.parse(session.expiresAt) > Date.now(), "TX_EXPIRED", "Transaction session expired", 410);

    const lockKey = `tx:lock:broadcast:${request.txId}`;
    return await this.lock.withLock(lockKey, env.broadcastLockTtlMs, async () => {
      const raced = await this.cache.getBroadcastResult<BroadcastTxResponse>(
        request.txId,
      );
      if (raced) return raced;
      const adapter = adapterForNetwork(session.network);
      const result = await adapter.broadcast({ session, request });
      const response: BroadcastTxResponse = {
        txId: request.txId,
        status: "broadcasted",
        txHash: result.txHash,
      };
      await this.cache.setBroadcastResult(request.txId, response, 86_400);
      return response;
    });
  }
}
