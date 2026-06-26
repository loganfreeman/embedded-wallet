import * as bitcoin from "bitcoinjs-lib";
import type {
  AddressMetadataResponse,
  AdapterBroadcastInput,
  AdapterBroadcastResult,
  AdapterBuildResult,
  BalancesResponse,
  BuildTxRequest,
  ChainAdapter,
  NetworkId,
  QuoteTxResponse,
  SimulateTxResponse,
  TxStatusResponse,
} from "../types/transactions.js";
import { bitcoinNetworkConfigs, type BitcoinNetworkId } from "../config/networks.js";
import { invariant } from "../types/errors.js";

type BitcoinContext = {
  network: "bitcoin" | "testnet";
  psbtBase64: string;
  selectedUtxos: Utxo[];
  feeSats: string;
  changeSats: string;
};

type Utxo = {
  txid: string;
  vout: number;
  value: number;
  status?: {
    confirmed: boolean;
  };
};

type AddressInfo = {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
};

type TxInfo = {
  status: {
    confirmed: boolean;
    block_height?: number;
  };
};

const isBitcoinNetwork = (network: NetworkId): network is BitcoinNetworkId =>
  network in bitcoinNetworkConfigs;

const networkFromConfig = (network: "bitcoin" | "testnet"): bitcoin.Network =>
  network === "bitcoin" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

const dustThresholdSats = 546;

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`);
  }
  return (await response.json()) as T;
};

export class BitcoinAdapter implements ChainAdapter {
  readonly chain = "bitcoin" as const;

  supports(network: NetworkId): boolean {
    return isBitcoinNetwork(network);
  }

  async build(input: BuildTxRequest): Promise<AdapterBuildResult> {
    invariant(isBitcoinNetwork(input.network), "UNSUPPORTED_NETWORK", "Unsupported Bitcoin network");
    invariant(input.asset.type === "native", "UNSUPPORTED_ASSET", "Bitcoin adapter only supports native BTC");
    const config = bitcoinNetworkConfigs[input.network];
    const btcNetwork = networkFromConfig(config.network);
    bitcoin.address.toOutputScript(input.from, btcNetwork);
    bitcoin.address.toOutputScript(input.to, btcNetwork);

    const amountSats = Number(input.amount);
    invariant(Number.isSafeInteger(amountSats) && amountSats > 0, "INVALID_AMOUNT", "Bitcoin amount must be a positive integer in sats");

    const [utxos, feeEstimates] = await Promise.all([
      fetchJson<Utxo[]>(`${config.mempoolApiUrl}/address/${input.from}/utxo`),
      fetchJson<Record<string, number>>(`${config.mempoolApiUrl}/v1/fees/recommended`),
    ]);
    const feeRate = Math.max(1, Math.ceil(feeEstimates.fastestFee ?? 5));
    const selectedUtxos: Utxo[] = [];
    let selectedValue = 0;
    for (const utxo of utxos.sort((a, b) => b.value - a.value)) {
      selectedUtxos.push(utxo);
      selectedValue += utxo.value;
      const estimatedVbytes = 10 + selectedUtxos.length * 68 + 2 * 31;
      const fee = estimatedVbytes * feeRate;
      if (selectedValue >= amountSats + fee) break;
    }

    const estimatedVbytes = 10 + selectedUtxos.length * 68 + 2 * 31;
    const feeSats = estimatedVbytes * feeRate;
    const changeSats = selectedValue - amountSats - feeSats;
    invariant(changeSats >= 0, "INSUFFICIENT_FUNDS", "Insufficient BTC balance");

    const psbt = new bitcoin.Psbt({ network: btcNetwork });
    const fromScript = bitcoin.address.toOutputScript(input.from, btcNetwork);
    for (const utxo of selectedUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: fromScript,
          value: utxo.value,
        },
      });
    }
    psbt.addOutput({
      address: input.to,
      value: amountSats,
    });
    if (changeSats > dustThresholdSats) {
      psbt.addOutput({
        address: input.from,
        value: changeSats,
      });
    }

    const psbtBase64 = psbt.toBase64();
    const context: BitcoinContext = {
      network: config.network,
      psbtBase64,
      selectedUtxos,
      feeSats: feeSats.toString(),
      changeSats: Math.max(0, changeSats).toString(),
    };

    return {
      chain: this.chain,
      signingPayloads: [
        {
          id: "payload_0",
          payload: psbtBase64,
          encoding: "base64",
        },
      ],
      signingInstructions: [
        {
          payloadId: "payload_0",
          signer: input.from,
          algorithm: "secp256k1",
          payloadType: "bitcoin_psbt",
          encoding: "base64",
        },
      ],
      adapterContext: context,
      display: {
        from: input.from,
        to: input.to,
        amount: input.amount,
        asset: input.asset,
        estimatedFee: feeSats.toString(),
      },
    };
  }

  async broadcast(input: AdapterBroadcastInput): Promise<AdapterBroadcastResult> {
    invariant(isBitcoinNetwork(input.session.network), "UNSUPPORTED_NETWORK", "Unsupported Bitcoin network");
    const config = bitcoinNetworkConfigs[input.session.network];
    const context = input.session.adapterContext as BitcoinContext;

    invariant("signedTransaction" in input.request, "UNSUPPORTED_BROADCAST_INPUT", "Bitcoin broadcast expects a signed finalized tx or signed PSBT");
    if (input.request.encoding === "hex") {
      const txHash = await this.broadcastHex(config.mempoolApiUrl, input.request.signedTransaction);
      return { txHash };
    }

    const signedPsbt = bitcoin.Psbt.fromBase64(input.request.signedTransaction, {
      network: networkFromConfig(context.network),
    });
    const originalPsbt = bitcoin.Psbt.fromBase64(context.psbtBase64, {
      network: networkFromConfig(context.network),
    });
    invariant(signedPsbt.inputCount === originalPsbt.inputCount, "TX_MISMATCH", "Signed PSBT input count mismatch");
    invariant(signedPsbt.txOutputs.length === originalPsbt.txOutputs.length, "TX_MISMATCH", "Signed PSBT output count mismatch");
    for (let index = 0; index < originalPsbt.txOutputs.length; index += 1) {
      const expected = originalPsbt.txOutputs[index];
      const actual = signedPsbt.txOutputs[index];
      invariant(actual.value === expected.value && actual.script.equals(expected.script), "TX_MISMATCH", "Signed PSBT outputs mismatch");
    }
    signedPsbt.finalizeAllInputs();
    const rawTx = signedPsbt.extractTransaction().toHex();
    const txHash = await this.broadcastHex(config.mempoolApiUrl, rawTx);
    return { txHash };
  }

  private async broadcastHex(apiUrl: string, rawTx: string): Promise<string> {
    const response = await fetch(`${apiUrl}/tx`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: rawTx,
    });
    const text = await response.text();
    invariant(response.ok, "BROADCAST_FAILED", text, 502);
    return text;
  }

  async getTxStatus(
    network: NetworkId,
    txHash: string,
    txId?: string,
  ): Promise<TxStatusResponse> {
    invariant(isBitcoinNetwork(network), "UNSUPPORTED_NETWORK", "Unsupported Bitcoin network");
    const config = bitcoinNetworkConfigs[network];
    try {
      const tx = await fetchJson<TxInfo>(`${config.mempoolApiUrl}/tx/${txHash}`);
      return {
        txId,
        network,
        status: tx.status.confirmed ? "confirmed" : "pending",
        txHash,
        blockNumber: tx.status.block_height?.toString(),
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return {
        txId,
        network,
        status: "unknown",
        txHash,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async getBalances(
    network: NetworkId,
    address: string,
  ): Promise<BalancesResponse> {
    invariant(isBitcoinNetwork(network), "UNSUPPORTED_NETWORK", "Unsupported Bitcoin network");
    const config = bitcoinNetworkConfigs[network];
    bitcoin.address.toOutputScript(address, networkFromConfig(config.network));
    const info = await fetchJson<AddressInfo>(
      `${config.mempoolApiUrl}/address/${address}`,
    );
    const confirmed =
      info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
    const mempool =
      info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
    return {
      address,
      network,
      balances: [
        {
          asset: { type: "native" },
          symbol: "BTC",
          decimals: 8,
          balance: (confirmed + mempool).toString(),
        },
      ],
    };
  }

  async quote(input: BuildTxRequest): Promise<QuoteTxResponse> {
    const result = await this.build(input);
    return {
      network: input.network,
      estimatedFee: result.display.estimatedFee,
      feeAsset: "BTC",
      feePreference: input.feePreference,
      warnings: [],
    };
  }

  async simulate(input: BuildTxRequest): Promise<SimulateTxResponse> {
    try {
      const quote = await this.quote(input);
      return { ok: true, network: input.network, quote };
    } catch (error) {
      return {
        ok: false,
        network: input.network,
        reason: "SIMULATION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Unable to simulate transaction",
      };
    }
  }

  async getAddressMetadata(
    network: NetworkId,
    address: string,
  ): Promise<AddressMetadataResponse> {
    invariant(isBitcoinNetwork(network), "UNSUPPORTED_NETWORK", "Unsupported Bitcoin network");
    const config = bitcoinNetworkConfigs[network];
    try {
      bitcoin.address.toOutputScript(address, networkFromConfig(config.network));
      return {
        network,
        address,
        valid: true,
        normalizedAddress: address,
        type: "wallet",
        warnings: [],
      };
    } catch {
      return { network, address, valid: false, warnings: ["Invalid Bitcoin address"] };
    }
  }
}
