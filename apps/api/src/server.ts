import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { mkdir } from "node:fs/promises";
import { env } from "./env.js";
import { getBalance } from "./services/meshy/meshy.balance.js";
import { relicRoutes } from "./routes/relics.js";

const isProd = process.env.NODE_ENV === "production";

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    // Spread rather than assign undefined — exactOptionalPropertyTypes treats
    // "present but undefined" as a different thing from "absent".
    ...(isProd
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }),
  },
});

await mkdir(env.storageDir, { recursive: true });
await mkdir(env.cacheDir, { recursive: true });

// Generated assets are downloaded locally and served from here — Meshy asset
// URLs expire, and a demo that 404s on replay is worse than no demo.
await app.register(fastifyStatic, {
  root: env.storageDir,
  prefix: "/assets/",
  decorateReply: false,
});

app.get("/api/health", async () => {
  const balance = await getBalance().catch(() => null);
  return { ok: true, balance };
});

await app.register(relicRoutes);

const port = env.PORT;
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`RelicForge API on :${port}`);
