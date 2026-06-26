import type { FastifyInstance } from "fastify";
import {
  addressParamsSchema,
  balancesQuerySchema,
  buildTxSchema,
  broadcastTxSchema,
  networkParamSchema,
  txHashParamsSchema,
  txIdParamSchema,
} from "./schemas.js";
import { routeSchemas } from "./openapi.js";
import type { TxService } from "../services/tx-service.js";
import { adapters } from "../adapters/index.js";
import { allNetworkIds, metadataForNetwork, networkMetadata } from "../config/networks.js";
import type { Asset } from "../types/transactions.js";

const clientIdFromRequest = (headers: Record<string, unknown>): string => {
  const header = headers["x-client-id"];
  return typeof header === "string" && header.length > 0 ? header : "anonymous";
};

const assetsFromQuery = (assets?: string[]): Asset[] | undefined => {
  if (!assets || assets.length === 0) return undefined;
  return assets.map((asset) =>
    asset === "native" ? { type: "native" } : { type: "token", address: asset },
  );
};

export const registerRoutes = async (
  app: FastifyInstance,
  txService: TxService,
): Promise<void> => {
  app.get("/health", { schema: routeSchemas.health }, async () => ({
    status: "ok",
  }));

  app.get("/networks", { schema: routeSchemas.networks }, async () => ({
    networks: allNetworkIds,
    metadata: networkMetadata,
    adapters: adapters.map((adapter) => adapter.chain),
  }));

  app.get("/networks/:network", { schema: routeSchemas.network }, async (request) => {
    const { network } = networkParamSchema.parse(request.params);
    return { network: metadataForNetwork(network) };
  });

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

  app.get("/tx/:txId", { schema: routeSchemas.txStatus }, async (request) => {
    const { txId } = txIdParamSchema.parse(request.params);
    return txService.getTxStatus(txId);
  });

  app.get(
    "/tx/hash/:network/:txHash",
    { schema: routeSchemas.txStatusByHash },
    async (request) => {
      const { network, txHash } = txHashParamsSchema.parse(request.params);
      return txService.getTxStatusByHash(network, txHash);
    },
  );

  app.get(
    "/wallets/:address/balances",
    { schema: routeSchemas.balances },
    async (request) => {
      const params = addressParamsSchema.pick({ address: true }).parse(request.params);
      const query = balancesQuerySchema.parse(request.query);
      return txService.getBalances(
        query.network,
        params.address,
        assetsFromQuery(query.assets),
      );
    },
  );

  app.post("/tx/quote", { schema: routeSchemas.quoteTx }, async (request) => {
    const body = buildTxSchema.parse(request.body);
    return txService.quote(body);
  });

  app.post("/tx/simulate", { schema: routeSchemas.simulateTx }, async (request) => {
    const body = buildTxSchema.parse(request.body);
    return txService.simulate(body);
  });

  app.get(
    "/addresses/:network/:address",
    { schema: routeSchemas.addressMetadata },
    async (request) => {
      const { network, address } = addressParamsSchema.parse(request.params);
      return txService.getAddressMetadata(network, address);
    },
  );
};
