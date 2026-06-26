import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { RedisLock } from "./storage/locks.js";
import { redis } from "./storage/redis.js";
import { TxCache } from "./storage/tx-cache.js";
import { TxService } from "./services/tx-service.js";
import { registerRoutes } from "./http/routes.js";
import { AppError } from "./types/errors.js";
import { env } from "./config/env.js";

export const buildServer = async () => {
  const app = Fastify({
    logger: true,
  });
  await app.register(sensible);

  const txService = new TxService(new TxCache(redis), new RedisLock(redis));
  await registerRoutes(app, txService);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        issues: error.issues,
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: "INTERNAL_ERROR",
      message: "Unexpected server error",
    });
  });

  return app;
};

const app = await buildServer();
await app.listen({ port: env.port, host: "0.0.0.0" });
