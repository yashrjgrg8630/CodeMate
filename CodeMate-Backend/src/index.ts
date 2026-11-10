import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { createPrisma } from "./lib/prisma.js";
import { AIService } from "./services/ai/ai-service.js";
import { createTransport } from "./services/ai/transport.js";

const env = loadEnv();
const db = createPrisma(env.DATABASE_URL);
const ai = new AIService(env, createTransport(env), db);
const app = createApp({ env, db, ai });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("server.listening", { port: info.port, model: env.GEMINI_MODEL });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("server.shutdown", { signal });
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
