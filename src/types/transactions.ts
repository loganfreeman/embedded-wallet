export type Chain = "evm" | "solana" | "bitcoin";

export type NetworkId =
  | "base"
  | "base-sepolia"
  | "arbitrum-one"
  | "arbitrum-sepolia"
  | "ethereum"
  | "ethereum-sepolia"
  | "solana"
  | "solana-devnet"
  | "bitcoin"
  | "bitcoin-signet";

export type Asset =
  | {
      type: "native";
    }
  | {
      type: "token";
      address: string;
      decimals?: number;
    };

export type BuildTxRequest = {
  idempotency_key: string;
  network: NetworkId;
  from: string;
  to: string;
  amount: string;
  asset: Asset;
  feePreference?: "low" | "medium" | "high";
};

export type SigningPayload = {
  id: string;
  payload: string;
  encoding: "hex" | "base64" | "base58";
};

export type SigningInstruction = {
  payloadId: string;
  signer: string;
  algorithm: "secp256k1" | "ed25519";
  payloadType:
    | "evm_transaction_hash"
    | "solana_message"
    | "bitcoin_psbt";
  encoding: "hex" | "base64" | "base58";
};

export type BuildTxResponse = {
  txId: string;
  network: NetworkId;
  status: "requires_signature";
  expiresAt: string;
  signingPayloads: SigningPayload[];
  signingInstructions: SigningInstruction[];
  display: {
    from: string;
    to: string;
    amount: string;
    asset: Asset;
    estimatedFee?: string;
  };
};

export type SignatureInput = {
  payloadId: string;
  signature: string;
  encoding: "hex" | "base64" | "base58";
  publicKey?: string;
};

export type BroadcastTxRequest =
  | {
      txId: string;
      signatures: SignatureInput[];
    }
  | {
      txId: string;
      signedTransaction: string;
      encoding: "hex" | "base64";
    };

export type BroadcastTxResponse = {
  txId: string;
  status: "broadcasted";
  txHash: string;
};

export type CachedTxSession = {
  txId: string;
  network: NetworkId;
  chain: Chain;
  from: string;
  to: string;
  amount: string;
  asset: Asset;
  status: "built";
  signingPayloads: SigningPayload[];
  signingInstructions: SigningInstruction[];
  adapterContext: unknown;
  createdAt: string;
  expiresAt: string;
};

export type AdapterBuildResult = {
  chain: Chain;
  signingPayloads: SigningPayload[];
  signingInstructions: SigningInstruction[];
  adapterContext: unknown;
  display: BuildTxResponse["display"];
};

export type AdapterBroadcastInput = {
  session: CachedTxSession;
  request: BroadcastTxRequest;
};

export type AdapterBroadcastResult = {
  txHash: string;
};

export interface ChainAdapter {
  readonly chain: Chain;
  supports(network: NetworkId): boolean;
  build(input: BuildTxRequest): Promise<AdapterBuildResult>;
  broadcast(input: AdapterBroadcastInput): Promise<AdapterBroadcastResult>;
}
