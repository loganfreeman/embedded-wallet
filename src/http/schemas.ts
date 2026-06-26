import { z } from "zod";

export const assetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("native"),
  }),
  z.object({
    type: z.literal("token"),
    address: z.string().min(1),
    decimals: z.number().int().min(0).max(255).optional(),
  }),
]);

export const networkSchema = z.enum([
  "base",
  "base-sepolia",
  "arbitrum-one",
  "arbitrum-sepolia",
  "ethereum",
  "ethereum-sepolia",
  "solana",
  "solana-devnet",
  "bitcoin",
  "bitcoin-signet",
]);

export const buildTxSchema = z.object({
  idempotency_key: z.string().min(8).max(200),
  network: networkSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.string().regex(/^[0-9]+$/),
  asset: assetSchema,
  feePreference: z.enum(["low", "medium", "high"]).optional(),
});

export const signatureSchema = z.object({
  payloadId: z.string().min(1),
  signature: z.string().min(1),
  encoding: z.enum(["hex", "base64", "base58"]),
  publicKey: z.string().optional(),
});

export const broadcastTxSchema = z.union([
  z.object({
    txId: z.string().uuid(),
    signatures: z.array(signatureSchema).min(1),
  }),
  z.object({
    txId: z.string().uuid(),
    signedTransaction: z.string().min(1),
    encoding: z.enum(["hex", "base64"]),
  }),
]);
