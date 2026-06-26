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
        required: ["networks", "adapters"],
        properties: {
          networks: { type: "array", items: { type: "string" } },
          adapters: { type: "array", items: { type: "string" } },
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
} as const;
