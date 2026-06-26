import "dotenv/config";

const numberFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
};

export const env = {
  port: numberFromEnv("PORT", 3000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  txSessionTtlSeconds: numberFromEnv("TX_SESSION_TTL_SECONDS", 300),
  buildLockTtlMs: numberFromEnv("BUILD_LOCK_TTL_MS", 10_000),
  broadcastLockTtlMs: numberFromEnv("BROADCAST_LOCK_TTL_MS", 30_000),
  baseRpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  baseSepoliaRpcUrl:
    process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
  ethereumSepoliaRpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL,
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  solanaDevnetRpcUrl:
    process.env.SOLANA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
  bitcoinMempoolApiUrl:
    process.env.BITCOIN_MEMPOOL_API_URL ?? "https://mempool.space/api",
  bitcoinSignetMempoolApiUrl:
    process.env.BITCOIN_SIGNET_MEMPOOL_API_URL ??
    "https://mempool.space/signet/api",
};
