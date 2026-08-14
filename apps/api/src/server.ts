import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { getBalance } from "./services/meshy/meshy.balance.js";
import { relicRoutes } from "./routes/relics.js";
import { reapInterruptedRelics } from "./cache/fileCache.js";

const isProd = process.env.NODE_ENV === "production";
const here = path.dirname(fileURLToPath(import.meta.url));

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

const reaped = await reapInterruptedRelics();
if (reaped > 0) app.log.warn(`Failed ${reaped} relic(s) left in flight by a previous run`);

/**
 * In production the API also serves the built client, so RelicForge deploys as
 * one surface on one origin: no CORS config, one dashboard, one failure mode.
 * In dev this is skipped because Vite owns the browser and proxies here.
 */
if (isProd) {
  const clientDir = path.resolve(here, "../../web/dist");
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: "/",
      decorateReply: false,
    });
    // Hash routing means every unknown path is still the SPA shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/assets")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html", clientDir);
    });
    app.log.info(`Serving client from ${clientDir}`);
  } else {
    app.log.warn(`No client build at ${clientDir} — run pnpm build first`);
  }
}

const port = env.PORT;
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`RelicForge API on :${port}`);
