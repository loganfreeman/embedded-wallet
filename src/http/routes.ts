import type { FastifyInstance } from "fastify";
import { buildTxSchema, broadcastTxSchema } from "./schemas.js";
import { routeSchemas } from "./openapi.js";
import type { TxService } from "../services/tx-service.js";
import { adapters } from "../adapters/index.js";

const clientIdFromRequest = (headers: Record<string, unknown>): string => {
  const header = headers["x-client-id"];
  return typeof header === "string" && header.length > 0 ? header : "anonymous";
};

export const registerRoutes = async (
  app: FastifyInstance,
  txService: TxService,
): Promise<void> => {
  app.get("/health", { schema: routeSchemas.health }, async () => ({
    status: "ok",
  }));

  app.get("/networks", { schema: routeSchemas.networks }, async () => ({
    networks: [
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
    adapters: adapters.map((adapter) => adapter.chain),
  }));

  app.post("/tx/build", { schema: routeSchemas.buildTx }, async (request, reply) => {
    const body = buildTxSchema.parse(request.body);
    const clientId = clientIdFromRequest(request.headers);
    const response = await txService.build(clientId, body);
    return reply.code(201).send(response);
  });

  app.post("/tx/broadcast", { schema: routeSchemas.broadcastTx }, async (request) => {
    const body = broadcastTxSchema.parse(request.body);
    return txService.broadcast(body);
  });
};
