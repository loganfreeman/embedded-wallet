import { BitcoinAdapter } from "./bitcoin.js";
import { EvmAdapter } from "./evm.js";
import { SolanaAdapter } from "./solana.js";
import type { ChainAdapter, NetworkId } from "../types/transactions.js";
import { AppError } from "../types/errors.js";

export const adapters: ChainAdapter[] = [
  new EvmAdapter(),
  new SolanaAdapter(),
  new BitcoinAdapter(),
];

export const adapterForNetwork = (network: NetworkId): ChainAdapter => {
  const adapter = adapters.find((candidate) => candidate.supports(network));
  if (!adapter) {
    throw new AppError("UNSUPPORTED_NETWORK", `Unsupported network: ${network}`);
  }
  return adapter;
};
