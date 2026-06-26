import {
  createPublicClient,
  encodeFunctionData,
  hexToSignature,
  http,
  isAddress,
  keccak256,
  parseTransaction,
  serializeTransaction,
  type Hex,
} from "viem";
import type { ChainAdapter, BuildTxRequest, AdapterBuildResult, AdapterBroadcastInput, AdapterBroadcastResult, NetworkId } from "../types/transactions.js";
import { AppError, invariant } from "../types/errors.js";
import { evmNetworkConfigs, type EvmNetworkId } from "../config/networks.js";

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type EvmContext = {
  chainId: number;
  nonce: number;
  to: Hex;
  value: string;
  data: Hex;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  serializedUnsignedTx: Hex;
  signingHash: Hex;
};

const isEvmNetwork = (network: NetworkId): network is EvmNetworkId =>
  network in evmNetworkConfigs;

const normalizeHex = (value?: string | null): string | undefined =>
  value?.toLowerCase();

export class EvmAdapter implements ChainAdapter {
  readonly chain = "evm" as const;

  supports(network: NetworkId): boolean {
    return isEvmNetwork(network);
  }

  async build(input: BuildTxRequest): Promise<AdapterBuildResult> {
    invariant(isEvmNetwork(input.network), "UNSUPPORTED_NETWORK", "Unsupported EVM network");
    const config = evmNetworkConfigs[input.network];
    invariant(config.rpcUrl, "MISSING_RPC_URL", `Missing RPC URL for ${input.network}`, 500);
    invariant(isAddress(input.from), "INVALID_FROM", "Invalid EVM from address");
    invariant(isAddress(input.to), "INVALID_TO", "Invalid EVM to address");

    const client = createPublicClient({
      chain: config.viemChain,
      transport: http(config.rpcUrl),
    });

    const value =
      input.asset.type === "native" ? BigInt(input.amount) : 0n;
    const to =
      input.asset.type === "native"
        ? (input.to as Hex)
        : (input.asset.address as Hex);
    const data =
      input.asset.type === "native"
        ? "0x"
        : encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [input.to as Hex, BigInt(input.amount)],
          });

    if (input.asset.type === "token") {
      invariant(isAddress(input.asset.address), "INVALID_TOKEN", "Invalid token contract address");
    }

    const [nonce, feeData, gas] = await Promise.all([
      client.getTransactionCount({
        address: input.from as Hex,
        blockTag: "pending",
      }),
      client.estimateFeesPerGas(),
      client.estimateGas({
        account: input.from as Hex,
        to,
        value,
        data,
      }),
    ]);

    const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
    const maxPriorityFeePerGas =
      feeData.maxPriorityFeePerGas ?? feeData.gasPrice;
    invariant(maxFeePerGas, "FEE_UNAVAILABLE", "Unable to estimate max fee per gas", 502);
    invariant(
      maxPriorityFeePerGas,
      "FEE_UNAVAILABLE",
      "Unable to estimate max priority fee per gas",
      502,
    );

    const tx = {
      chainId: config.viemChain.id,
      type: "eip1559" as const,
      nonce,
      to,
      value,
      data,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    const serializedUnsignedTx = serializeTransaction(tx);
    const signingHash = keccak256(serializedUnsignedTx);
    const context: EvmContext = {
      chainId: config.viemChain.id,
      nonce,
      to,
      value: value.toString(),
      data,
      gas: gas.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      serializedUnsignedTx,
      signingHash,
    };

    return {
      chain: this.chain,
      signingPayloads: [
        {
          id: "payload_0",
          payload: signingHash,
          encoding: "hex",
        },
      ],
      signingInstructions: [
        {
          payloadId: "payload_0",
          signer: input.from,
          algorithm: "secp256k1",
          payloadType: "evm_transaction_hash",
          encoding: "hex",
        },
      ],
      adapterContext: context,
      display: {
        from: input.from,
        to: input.to,
        amount: input.amount,
        asset: input.asset,
        estimatedFee: (gas * maxFeePerGas).toString(),
      },
    };
  }

  async broadcast(input: AdapterBroadcastInput): Promise<AdapterBroadcastResult> {
    invariant(isEvmNetwork(input.session.network), "UNSUPPORTED_NETWORK", "Unsupported EVM network");
    const config = evmNetworkConfigs[input.session.network];
    invariant(config.rpcUrl, "MISSING_RPC_URL", `Missing RPC URL for ${input.session.network}`, 500);
    const context = input.session.adapterContext as EvmContext;

    let signedTransaction: Hex;
    if ("signedTransaction" in input.request) {
      signedTransaction = input.request.signedTransaction as Hex;
    } else {
      const signatureInput = input.request.signatures.find(
        (signature) => signature.payloadId === "payload_0",
      );
      invariant(signatureInput, "MISSING_SIGNATURE", "Missing EVM transaction signature");
      invariant(signatureInput.encoding === "hex", "INVALID_SIGNATURE_ENCODING", "EVM signature must be hex");
      const signature = hexToSignature(signatureInput.signature as Hex);
      signedTransaction = serializeTransaction(
        {
          chainId: context.chainId,
          type: "eip1559",
          nonce: context.nonce,
          to: context.to,
          value: BigInt(context.value),
          data: context.data,
          gas: BigInt(context.gas),
          maxFeePerGas: BigInt(context.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(context.maxPriorityFeePerGas),
        },
        signature,
      );
    }

    const parsed = parseTransaction(signedTransaction);
    invariant(parsed.chainId === context.chainId, "TX_MISMATCH", "Signed transaction chainId mismatch");
    invariant(parsed.nonce === context.nonce, "TX_MISMATCH", "Signed transaction nonce mismatch");
    invariant(normalizeHex(parsed.to) === normalizeHex(context.to), "TX_MISMATCH", "Signed transaction recipient mismatch");
    invariant((parsed.value ?? 0n) === BigInt(context.value), "TX_MISMATCH", "Signed transaction value mismatch");
    invariant(normalizeHex(parsed.data) === normalizeHex(context.data), "TX_MISMATCH", "Signed transaction data mismatch");
    invariant((parsed.gas ?? 0n) === BigInt(context.gas), "TX_MISMATCH", "Signed transaction gas mismatch");
    invariant(parsed.maxFeePerGas === BigInt(context.maxFeePerGas), "TX_MISMATCH", "Signed transaction maxFeePerGas mismatch");
    invariant(parsed.maxPriorityFeePerGas === BigInt(context.maxPriorityFeePerGas), "TX_MISMATCH", "Signed transaction maxPriorityFeePerGas mismatch");

    const client = createPublicClient({
      chain: config.viemChain,
      transport: http(config.rpcUrl),
    });
    const txHash = await client.sendRawTransaction({
      serializedTransaction: signedTransaction,
    });
    return { txHash };
  }
}
