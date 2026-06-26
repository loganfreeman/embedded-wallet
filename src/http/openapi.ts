import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import type { OpenAPIV3_1 } from "openapi-types";

const assetSchema: OpenAPIV3_1.SchemaObject = {
  oneOf: [
    {
      type: "object",
      required: ["type"],
      properties: {
        type: { const: "native" },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["type", "address"],
      properties: {
        type: { const: "token" },
        address: { type: "string" },
        decimals: { type: "integer", minimum: 0, maximum: 255 },
      },
      additionalProperties: false,
    },
  ],
};

const signingPayloadSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["id", "payload", "encoding"],
  properties: {
    id: { type: "string" },
    payload: { type: "string" },
    encoding: { enum: ["hex", "base64", "base58"] },
  },
};

const signingInstructionSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["payloadId", "signer", "algorithm", "payloadType", "encoding"],
  properties: {
    payloadId: { type: "string" },
    signer: { type: "string" },
    algorithm: { enum: ["secp256k1", "ed25519"] },
    payloadType: {
      enum: ["evm_transaction_hash", "solana_message", "bitcoin_psbt"],
    },
    encoding: { enum: ["hex", "base64", "base58"] },
  },
};

const errorResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
};

const buildTxRequestSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: [
    "idempotency_key",
    "network",
    "from",
    "to",
    "amount",
    "asset",
  ],
  properties: {
    idempotency_key: {
      type: "string",
      minLength: 8,
      maxLength: 200,
    },
    network: {
      enum: [
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
      ],
    },
    from: { type: "string" },
    to: { type: "string" },
    amount: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "Integer base unit amount, for example wei, lamports, token base units, or sats.",
    },
    asset: assetSchema,
    feePreference: { enum: ["low", "medium", "high"] },
  },
  additionalProperties: false,
};

const buildTxResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: [
    "txId",
    "network",
    "status",
    "expiresAt",
    "signingPayloads",
    "signingInstructions",
    "display",
  ],
  properties: {
    txId: { type: "string", format: "uuid" },
    network: { type: "string" },
    status: { const: "requires_signature" },
    expiresAt: { type: "string", format: "date-time" },
    signingPayloads: {
      type: "array",
      items: signingPayloadSchema,
    },
    signingInstructions: {
      type: "array",
      items: signingInstructionSchema,
    },
    display: {
      type: "object",
      required: ["from", "to", "amount", "asset"],
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        amount: { type: "string" },
        asset: assetSchema,
        estimatedFee: { type: "string" },
      },
    },
  },
};

const broadcastTxRequestSchema: OpenAPIV3_1.SchemaObject = {
  oneOf: [
    {
      type: "object",
      required: ["txId", "signatures"],
      properties: {
        txId: { type: "string", format: "uuid" },
        signatures: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["payloadId", "signature", "encoding"],
            properties: {
              payloadId: { type: "string" },
              signature: { type: "string" },
              encoding: { enum: ["hex", "base64", "base58"] },
              publicKey: { type: "string" },
            },
          },
        },
      },
      additionalProperties: false,
    },
    {
      type: "object",
      required: ["txId", "signedTransaction", "encoding"],
      properties: {
        txId: { type: "string", format: "uuid" },
        signedTransaction: { type: "string" },
        encoding: { enum: ["hex", "base64"] },
      },
      additionalProperties: false,
    },
  ],
};

const broadcastTxResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["txId", "status", "txHash"],
  properties: {
    txId: { type: "string", format: "uuid" },
    status: { const: "broadcasted" },
    txHash: { type: "string" },
  },
};

const txStatusResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["network", "status", "updatedAt"],
  properties: {
    txId: { type: "string", format: "uuid" },
    network: { type: "string" },
    status: {
      enum: [
        "requires_signature",
        "broadcasted",
        "pending",
        "confirmed",
        "failed",
        "expired",
        "unknown",
      ],
    },
    txHash: { type: "string" },
    confirmations: { type: "integer" },
    blockNumber: { type: "string" },
    explorerUrl: { type: "string" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const balanceItemSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["asset", "balance"],
  properties: {
    asset: assetSchema,
    symbol: { type: "string" },
    decimals: { type: "integer" },
    balance: { type: "string" },
  },
};

const balancesResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["address", "network", "balances"],
  properties: {
    address: { type: "string" },
    network: { type: "string" },
    balances: {
      type: "array",
      items: balanceItemSchema,
    },
  },
};

const quoteTxResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["network", "warnings"],
  properties: {
    network: { type: "string" },
    estimatedFee: { type: "string" },
    feeAsset: { type: "string" },
    gas: { type: "string" },
    feePreference: { enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const simulateTxResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["ok", "network"],
  properties: {
    ok: { type: "boolean" },
    network: { type: "string" },
    reason: { type: "string" },
    message: { type: "string" },
    quote: quoteTxResponseSchema,
  },
};

const addressMetadataResponseSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["network", "address", "valid", "warnings"],
  properties: {
    network: { type: "string" },
    address: { type: "string" },
    valid: { type: "boolean" },
    normalizedAddress: { type: "string" },
    type: { enum: ["wallet", "contract", "token_account", "unknown"] },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const networkMetadataSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  required: ["id", "chain", "displayName", "nativeCurrency", "features"],
  properties: {
    id: { type: "string" },
    chain: { enum: ["evm", "solana", "bitcoin"] },
    displayName: { type: "string" },
    nativeCurrency: {
      type: "object",
      required: ["name", "symbol", "decimals"],
      properties: {
        name: { type: "string" },
        symbol: { type: "string" },
        decimals: { type: "integer" },
      },
    },
    features: {
      type: "object",
      additionalProperties: { type: "boolean" },
    },
  },
};

export const openApiOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: "Embedded Wallet API",
      version: "0.1.0",
      description:
        "Non-custodial API for building unsigned crypto send transactions, returning signing payloads, and broadcasting signed transactions.",
    },
    tags: [
      { name: "System" },
      { name: "Transactions" },
      { name: "Networks" },
    ],
    components: {
      securitySchemes: {
        clientId: {
          type: "apiKey",
          in: "header",
          name: "x-client-id",
          description:
            "Client scope used for idempotency keys. Replace with authenticated tenant identity in production.",
        },
      },
      schemas: {
        Asset: assetSchema,
        SigningPayload: signingPayloadSchema,
        SigningInstruction: signingInstructionSchema,
        ErrorResponse: errorResponseSchema,
        BuildTxRequest: buildTxRequestSchema,
        BuildTxResponse: buildTxResponseSchema,
        BroadcastTxRequest: broadcastTxRequestSchema,
        BroadcastTxResponse: broadcastTxResponseSchema,
        TxStatusResponse: txStatusResponseSchema,
        BalancesResponse: balancesResponseSchema,
        QuoteTxResponse: quoteTxResponseSchema,
        SimulateTxResponse: simulateTxResponseSchema,
        AddressMetadataResponse: addressMetadataResponseSchema,
        NetworkMetadata: networkMetadataSchema,
      },
    },
  },
};

export const routeSchemas = {
  health: {
    tags: ["System"],
    response: {
      200: {
        type: "object",
        required: ["status"],
        properties: {
          status: { const: "ok" },
        },
      },
    },
  },
  networks: {
    tags: ["Networks"],
    response: {
      200: {
        type: "object",
        required: ["networks", "metadata", "adapters"],
        properties: {
          networks: { type: "array", items: { type: "string" } },
          metadata: { type: "array", items: networkMetadataSchema },
          adapters: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  network: {
    tags: ["Networks"],
    params: {
      type: "object",
      required: ["network"],
      properties: {
        network: { type: "string" },
      },
    },
    response: {
      200: {
        type: "object",
        required: ["network"],
        properties: {
          network: networkMetadataSchema,
        },
      },
    },
  },
  buildTx: {
    tags: ["Transactions"],
    security: [{ clientId: [] }],
    body: buildTxRequestSchema,
    response: {
      201: buildTxResponseSchema,
      400: errorResponseSchema,
      409: errorResponseSchema,
      423: errorResponseSchema,
    },
  },
  broadcastTx: {
    tags: ["Transactions"],
    body: broadcastTxRequestSchema,
    response: {
      200: broadcastTxResponseSchema,
      400: errorResponseSchema,
      410: errorResponseSchema,
      423: errorResponseSchema,
      502: errorResponseSchema,
    },
  },
  txStatus: {
    tags: ["Transactions"],
    params: {
      type: "object",
      required: ["txId"],
      properties: {
        txId: { type: "string", format: "uuid" },
      },
    },
    response: {
      200: txStatusResponseSchema,
      404: errorResponseSchema,
      410: errorResponseSchema,
    },
  },
  txStatusByHash: {
    tags: ["Transactions"],
    params: {
      type: "object",
      required: ["network", "txHash"],
      properties: {
        network: { type: "string" },
        txHash: { type: "string" },
      },
    },
    response: {
      200: txStatusResponseSchema,
      400: errorResponseSchema,
    },
  },
  balances: {
    tags: ["Wallets"],
    params: {
      type: "object",
      required: ["address"],
      properties: {
        address: { type: "string" },
      },
    },
    querystring: {
      type: "object",
      required: ["network"],
      properties: {
        network: { type: "string" },
        assets: {
          type: "string",
          description:
            "Comma-separated asset list. Use native for the native coin, or token mint/contract addresses.",
        },
      },
    },
    response: {
      200: balancesResponseSchema,
      400: errorResponseSchema,
    },
  },
  quoteTx: {
    tags: ["Transactions"],
    body: buildTxRequestSchema,
    response: {
      200: quoteTxResponseSchema,
      400: errorResponseSchema,
      502: errorResponseSchema,
    },
  },
  simulateTx: {
    tags: ["Transactions"],
    body: buildTxRequestSchema,
    response: {
      200: simulateTxResponseSchema,
      400: errorResponseSchema,
      502: errorResponseSchema,
    },
  },
  addressMetadata: {
    tags: ["Addresses"],
    params: {
      type: "object",
      required: ["network", "address"],
      properties: {
        network: { type: "string" },
        address: { type: "string" },
      },
    },
    response: {
      200: addressMetadataResponseSchema,
      400: errorResponseSchema,
    },
  },
} as const;
