import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CombatTelemetrySchema, OrientationHintSchema } from "@relic/core";
import { getRelic, listRelics, patchRelic } from "../cache/fileCache.js";
import { onRelicEvent, type RelicEvent } from "../generation/events.js";
import { retryRelic, startRelic } from "../generation/pipeline.js";
import { currentBalance } from "../generation/credits.js";

const CreateRelicSchema = z.object({
  boss: z.string().min(1).default("the Ashen Warden"),
  telemetry: CombatTelemetrySchema,
  mode: z.enum(["dev", "hero"]).optional(),
});

/** Public shape — the browser never learns Meshy's endpoint structure. */
function toPublic(record: NonNullable<Awaited<ReturnType<typeof getRelic>>>) {
  return {
    relicId: record.relicId,
    name: record.name,
    dna: record.dna,
    status: record.status,
    conceptUrl: record.conceptUrl ?? null,
    modelUrl: record.modelUrl ?? null,
    transform: record.transform ?? null,
    totalMs: record.totalMs ?? null,
    cached: record.cached,
  };
}

export async function relicRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/relics", async (request, reply) => {
    const parsed = CreateRelicSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid telemetry", issues: parsed.error.issues });
    }

    // exactOptionalPropertyTypes distinguishes an absent key from an explicit
    // undefined, so an optional field has to be spread in rather than assigned.
    const { boss, telemetry, mode } = parsed.data;
    const { record, cacheHit } = await startRelic({
      boss,
      telemetry,
      ...(mode ? { mode } : {}),
    });
    // 200 means "already exists, nothing spent"; 202 means work has started.
    return reply.status(cacheHit ? 200 : 202).send(toPublic(record));
  });

  app.get<{ Params: { id: string } }>("/api/relics/:id", async (request, reply) => {
    const record = await getRelic(request.params.id);
    if (!record) return reply.status(404).send({ error: "No such relic" });
    return toPublic(record);
  });

  /**
   * Stores the client-computed canonical transform (and any hint used) so a
   * re-equip is stable across reloads rather than recomputed each time.
   */
  app.post<{ Params: { id: string } }>("/api/relics/:id/transform", async (request, reply) => {
    const body = z
      .object({ transform: z.unknown(), hint: OrientationHintSchema.nullish() })
      .safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid transform" });

    const updated = await patchRelic(request.params.id, {
      transform: body.data.transform as never,
      hint: body.data.hint ?? null,
    });
    if (!updated) return reply.status(404).send({ error: "No such relic" });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/relics/:id/retry", async (request, reply) => {
    const record = await getRelic(request.params.id);
    if (!record) return reply.status(404).send({ error: "No such relic" });
    if (record.status !== "FAILED") {
      return reply.status(409).send({ error: `Relic is ${record.status}, not FAILED` });
    }
    await retryRelic(record);
    return reply.status(202).send(toPublic(record));
  });

  /**
   * SSE. Meshy's own per-task streams are consumed server-side and re-emitted
   * here as domain events, which is why there is no webhook receiver and no
   * public tunnel in local development.
   */
  app.get<{ Params: { id: string } }>("/api/relics/:id/events", async (request, reply) => {
    const record = await getRelic(request.params.id);
    if (!record) return reply.status(404).send({ error: "No such relic" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: RelicEvent) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // Replay current state so a client that connects late — or reconnects —
    // is never stuck waiting for an event that already fired.
    send({ type: "dna.ready", dna: record.dna, name: record.name });
    if (record.conceptUrl) {
      send({ type: "concept.ready", conceptUrl: record.conceptUrl, ms: record.conceptMs ?? 0 });
    }
    if (record.status === "COMPLETE" && record.modelUrl) {
      send({
        type: "relic.complete",
        relicId: record.relicId,
        name: record.name,
        dna: record.dna,
        conceptUrl: record.conceptUrl ?? null,
        modelUrl: record.modelUrl,
        transform: record.transform ?? null,
        totalMs: record.totalMs ?? 0,
        cached: record.cached,
      });
      reply.raw.end();
      return reply;
    }

    const unsubscribe = onRelicEvent(record.relicId, (event) => {
      send(event);
      if (event.type === "relic.complete" || event.type === "relic.failed") {
        clearInterval(heartbeat);
        unsubscribe();
        reply.raw.end();
      }
    });

    // Proxies drop idle connections; a forge can legitimately be silent for
    // stretches of a multi-minute mesh generation.
    const heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    return reply;
  });

  /** Dev-only diagnostics: prompts, task ids, timings, cache hits, raw errors. */
  app.get("/api/debug/relics", async () => {
    const relics = await listRelics();
    return {
      balance: await currentBalance(),
      count: relics.length,
      relics: relics.map((r) => ({
        relicId: r.relicId,
        name: r.name,
        status: r.status,
        mode: r.generationMode,
        cacheKey: r.cacheKey,
        dna: r.dna,
        prompt: r.prompt,
        conceptTaskId: r.conceptTaskId ?? null,
        meshTaskId: r.meshTaskId ?? null,
        conceptMs: r.conceptMs ?? null,
        meshMs: r.meshMs ?? null,
        optimizeMs: r.optimizeMs ?? null,
        totalMs: r.totalMs ?? null,
        glbBytes: r.glbBytes ?? null,
        rawGlbBytes: r.rawGlbBytes ?? null,
        error: r.error ?? null,
      })),
    };
  });
}
