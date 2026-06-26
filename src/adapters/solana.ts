import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";
import { solanaNetworkConfigs, type SolanaNetworkId } from "../config/networks.js";
import type {
  AdapterBroadcastInput,
  AdapterBroadcastResult,
  AdapterBuildResult,
  BuildTxRequest,
  ChainAdapter,
  NetworkId,
} from "../types/transactions.js";
import { invariant } from "../types/errors.js";

type SolanaContext = {
  payer: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  messageBase64: string;
  unsignedTransactionBase64: string;
  expectedSigners: string[];
};

const isSolanaNetwork = (network: NetworkId): network is SolanaNetworkId =>
  network in solanaNetworkConfigs;

const bytesFromEncoded = (value: string, encoding: "hex" | "base64" | "base58"): Uint8Array => {
  if (encoding === "base64") return Buffer.from(value, "base64");
  if (encoding === "base58") return bs58.decode(value);
  return Buffer.from(value.replace(/^0x/, ""), "hex");
};

export class SolanaAdapter implements ChainAdapter {
  readonly chain = "solana" as const;

  supports(network: NetworkId): boolean {
    return isSolanaNetwork(network);
  }

  async build(input: BuildTxRequest): Promise<AdapterBuildResult> {
    invariant(isSolanaNetwork(input.network), "UNSUPPORTED_NETWORK", "Unsupported Solana network");
    const config = solanaNetworkConfigs[input.network];
    const connection = new Connection(config.rpcUrl, "confirmed");
    const payer = new PublicKey(input.from);
    const recipient = new PublicKey(input.to);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    const instructions = [];
    if (input.asset.type === "native") {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: recipient,
          lamports: BigInt(input.amount),
        }),
      );
    } else {
      const mint = new PublicKey(input.asset.address);
      const sourceAta = await getAssociatedTokenAddress(mint, payer);
      const destinationAta = await getAssociatedTokenAddress(mint, recipient);
      const destinationAccount = await connection.getAccountInfo(destinationAta);
      if (!destinationAccount) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            payer,
            destinationAta,
            recipient,
            mint,
          ),
        );
      }
      instructions.push(
        createTransferCheckedInstruction(
          sourceAta,
          mint,
          destinationAta,
          payer,
          BigInt(input.amount),
          input.asset.decimals ?? 0,
        ),
      );
    }

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    const messageBase64 = Buffer.from(transaction.message.serialize()).toString(
      "base64",
    );
    const unsignedTransactionBase64 = Buffer.from(transaction.serialize()).toString(
      "base64",
    );

    const context: SolanaContext = {
      payer: payer.toBase58(),
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      messageBase64,
      unsignedTransactionBase64,
      expectedSigners: [payer.toBase58()],
    };

    return {
      chain: this.chain,
      signingPayloads: [
        {
          id: "payload_0",
          payload: messageBase64,
          encoding: "base64",
        },
      ],
      signingInstructions: [
        {
          payloadId: "payload_0",
          signer: payer.toBase58(),
          algorithm: "ed25519",
          payloadType: "solana_message",
          encoding: "base64",
        },
      ],
      adapterContext: context,
      display: {
        from: input.from,
        to: input.to,
        amount: input.amount,
        asset: input.asset,
      },
    };
  }

  async broadcast(input: AdapterBroadcastInput): Promise<AdapterBroadcastResult> {
    invariant(isSolanaNetwork(input.session.network), "UNSUPPORTED_NETWORK", "Unsupported Solana network");
    const config = solanaNetworkConfigs[input.session.network];
    const connection = new Connection(config.rpcUrl, "confirmed");
    const context = input.session.adapterContext as SolanaContext;
    const storedTxBytes = Buffer.from(context.unsignedTransactionBase64, "base64");
    const transaction = VersionedTransaction.deserialize(storedTxBytes);

    if ("signedTransaction" in input.request) {
      const signedBytes = bytesFromEncoded(
        input.request.signedTransaction,
        input.request.encoding,
      );
      const signed = VersionedTransaction.deserialize(signedBytes);
      const signedMessage = Buffer.from(signed.message.serialize()).toString(
        "base64",
      );
      invariant(signedMessage === context.messageBase64, "TX_MISMATCH", "Signed Solana message mismatch");
      transaction.signatures = signed.signatures;
    } else {
      const signatureInput = input.request.signatures.find(
        (signature) => signature.payloadId === "payload_0",
      );
      invariant(signatureInput, "MISSING_SIGNATURE", "Missing Solana signature");
      const signatureBytes = bytesFromEncoded(
        signatureInput.signature,
        signatureInput.encoding,
      );
      invariant(signatureBytes.length === 64, "INVALID_SIGNATURE", "Solana signatures must be 64 bytes");
      transaction.addSignature(new PublicKey(context.payer), signatureBytes);
    }

    invariant(transaction.signatures.some((signature) => signature.some(Boolean)), "INVALID_SIGNATURE", "Solana transaction is unsigned");

    const currentBlockHeight = await connection.getBlockHeight("confirmed");
    invariant(
      currentBlockHeight <= context.lastValidBlockHeight,
      "TX_EXPIRED",
      "Solana blockhash expired; rebuild required",
      410,
    );

    const txHash = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    return { txHash };
  }
}
