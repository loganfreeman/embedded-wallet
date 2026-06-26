import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, sepolia } from "viem/chains";
import type { Chain, NetworkId } from "../types/transactions.js";
import { env } from "./env.js";

export type NetworkConfig = {
  id: NetworkId;
  chain: Chain;
  rpcUrl?: string;
};

export const evmNetworkConfigs = {
  base: {
    id: "base",
    viemChain: base,
    rpcUrl: env.baseRpcUrl,
  },
  "base-sepolia": {
    id: "base-sepolia",
    viemChain: baseSepolia,
    rpcUrl: env.baseSepoliaRpcUrl,
  },
  ethereum: {
    id: "ethereum",
    viemChain: mainnet,
    rpcUrl: env.ethereumRpcUrl,
  },
  "ethereum-sepolia": {
    id: "ethereum-sepolia",
    viemChain: sepolia,
    rpcUrl: env.ethereumSepoliaRpcUrl,
  },
  "arbitrum-one": {
    id: "arbitrum-one",
    viemChain: arbitrum,
    rpcUrl: process.env.ARBITRUM_RPC_URL,
  },
  "arbitrum-sepolia": {
    id: "arbitrum-sepolia",
    viemChain: arbitrumSepolia,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
  },
} as const;

export type EvmNetworkId = keyof typeof evmNetworkConfigs;

export const solanaNetworkConfigs = {
  solana: {
    id: "solana",
    rpcUrl: env.solanaRpcUrl,
  },
  "solana-devnet": {
    id: "solana-devnet",
    rpcUrl: env.solanaDevnetRpcUrl,
  },
} as const;

export type SolanaNetworkId = keyof typeof solanaNetworkConfigs;

export const bitcoinNetworkConfigs = {
  bitcoin: {
    id: "bitcoin",
    network: "bitcoin",
    mempoolApiUrl: env.bitcoinMempoolApiUrl,
  },
  "bitcoin-signet": {
    id: "bitcoin-signet",
    network: "testnet",
    mempoolApiUrl: env.bitcoinSignetMempoolApiUrl,
  },
} as const;

export type BitcoinNetworkId = keyof typeof bitcoinNetworkConfigs;
