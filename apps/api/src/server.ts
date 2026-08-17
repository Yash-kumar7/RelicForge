import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
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
    // Spread rather than assign undefined, exactOptionalPropertyTypes treats
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

/*
 * Cross-origin access, only when the client is hosted elsewhere.
 *
 * Registered before anything it has to cover, and skipped entirely in the
 * single-origin deployment this was built around, where there is no cross-origin
 * request to permit.
 *
 * One named origin, never a wildcard. This API spends credits, so anything that
 * can reach it can spend them, and an open CORS policy on a metered endpoint is
 * a bill waiting to happen.
 */
if (env.CLIENT_ORIGIN) {
  await app.register(fastifyCors, {
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  });
  app.log.info({ origin: env.CLIENT_ORIGIN }, "cross-origin client allowed");
}

await mkdir(env.storageDir, { recursive: true });
await mkdir(env.cacheDir, { recursive: true });

/**
 * Two roots behind one path, bundle first.
 *
 * Generated assets are downloaded locally rather than linked, because Meshy
 * asset URLs expire and a demo that 404s on replay is worse than no demo. That
 * left every character, boss and arena living only in storage, which is four
 * hundred megabytes and not in the repository — so a fresh clone had the whole
 * game missing, and so would any deploy that did not carry storage with it.
 *
 * assets/ is the committed answer: the forty-odd files the game actually
 * requests, re-encoded small enough to belong in git. It is checked first, so a
 * clone and a deploy both have everything they need with no setup at all.
 *
 * storage/ stays behind it and still serves what only exists at runtime — every
 * relic the forge produces, which by definition cannot be committed, since it
 * did not exist until somebody won a fight.
 */
const bundledAssets = path.resolve(here, "../../../assets");
await app.register(fastifyStatic, {
  root: existsSync(bundledAssets) ? [bundledAssets, env.storageDir] : env.storageDir,
  prefix: "/assets/",
  decorateReply: false,
});
if (!existsSync(bundledAssets)) {
  app.log.warn(
    `No asset bundle at ${bundledAssets}. Characters and arenas will fall back to primitives; run "pnpm --filter @relic/api assets:bundle" to build it.`,
  );
}

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
    app.log.warn(`No client build at ${clientDir}, run pnpm build first`);
  }
}

const port = env.PORT;
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`RelicForge API on :${port}`);
