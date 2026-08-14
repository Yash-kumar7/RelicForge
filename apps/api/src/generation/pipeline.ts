import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildRelicDNA,
  compileRelicPrompt,
  composeRelicName,
  configForMode,
  relicCacheKey,
  type CombatTelemetry,
  type GenerationMode,
} from "@relic/core";
import { env } from "../env.js";
import { fetchBuffer, fetchBytes } from "../lib/fetchBytes.js";
import { MeshyError } from "../lib/errors.js";
import { createConceptImage } from "../services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../services/meshy/meshy.tasks.js";
import { optimizeGlb } from "./optimizeGlb.js";
import { assertBudget, conceptOp, meshOp } from "./credits.js";
import { emitRelicEvent } from "./events.js";
import {
  findArchetypeFallback,
  findByCacheKey,
  patchRelic,
  putRelic,
  type RelicRecord,
} from "../cache/fileCache.js";
import { pickBestConcept } from "./conceptSelect.js";

export interface StartRelicInput {
  boss: string;
  telemetry: CombatTelemetry;
  mode?: GenerationMode;
  /**
   * Dev-only: forces the pipeline to fail after the DNA stage.
   *
   * The failure path, the retry and the archetype fallback are the parts of
   * this system most likely to be broken and least likely to be noticed, since
   * they only run when something has already gone wrong. This makes them
   * reachable without unplugging the network mid-forge.
   */
  forceFail?: boolean;
}

export interface StartRelicResult {
  record: RelicRecord;
  /** True when served straight from cache — no Meshy call, no credits. */
  cacheHit: boolean;
}

/**
 * Creates the relic record and, on a cache miss, kicks off generation in the
 * background. Returns immediately either way so the client can open its event
 * stream before the slow work starts.
 */
export async function startRelic(input: StartRelicInput): Promise<StartRelicResult> {
  const mode = input.mode ?? "hero";
  const config = configForMode(mode);
  const dna = buildRelicDNA(input.telemetry, input.boss);
  const name = composeRelicName(dna);
  const prompt = compileRelicPrompt(dna);
  const cacheKey = relicCacheKey(dna, config);

  const hit = await findByCacheKey(cacheKey);
  if (hit) {
    // The cache is what makes the demo recordable while the live path stays
    // honest: identical DNA resolves instantly and spends nothing.
    return { record: { ...hit, cached: true }, cacheHit: true };
  }

  const record = await putRelic({
    relicId: randomUUID(),
    cacheKey,
    name,
    dna,
    status: "DNA_READY",
    prompt,
    generationMode: mode,
    cached: false,
    createdAt: Date.now(),
  });

  void runGeneration(record, input.forceFail === true).catch(() => {
    /* runGeneration owns its own error handling */
  });

  return { record, cacheHit: false };
}

async function runGeneration(initial: RelicRecord, forceFail = false): Promise<void> {
  const relicId = initial.relicId;
  const config = configForMode(initial.generationMode);
  const startedAt = Date.now();
  const dir = path.join(env.storageDir, "relics", relicId);
  await mkdir(dir, { recursive: true });

  emitRelicEvent(relicId, { type: "dna.ready", dna: initial.dna, name: initial.name });

  try {
    /* ------------------------------------------------------------ concept */
    await patchRelic(relicId, { status: "GENERATING_CONCEPT" });

    if (forceFail) {
      throw new MeshyError("Forced failure (dev seam) before any credits were spent");
    }

    const conceptStart = Date.now();
    const candidates: { taskId: string; url: string }[] = [];

    // Concepts are 3–9 credits against a 30–35 credit mesh, and mesh quality is
    // dominated by concept quality, so hero mode buys several and picks.
    for (let i = 0; i < config.conceptCandidates; i++) {
      await assertBudget(conceptOp(config.imageModel));
      const taskId = await createConceptImage(initial.prompt, { imageModel: config.imageModel });
      if (i === 0) emitRelicEvent(relicId, { type: "concept.generating", taskId });
      const task = await waitForTask("text-to-image", taskId);
      const url = task.image_urls[0];
      if (url) candidates.push({ taskId, url });
    }

    if (candidates.length === 0) throw new MeshyError("No concept candidates were produced");

    const chosen = await pickBestConcept(candidates);
    const conceptMs = Date.now() - conceptStart;

    const conceptBytes = await fetchBuffer(chosen.url);
    await writeFile(path.join(dir, "concept.png"), conceptBytes);
    const conceptUrl = `/assets/relics/${relicId}/concept.png`;

    await patchRelic(relicId, {
      status: "CONCEPT_READY",
      conceptUrl,
      conceptTaskId: chosen.taskId,
      conceptMs,
    });
    emitRelicEvent(relicId, { type: "concept.ready", conceptUrl, ms: conceptMs });

    /* --------------------------------------------------------------- mesh */
    await patchRelic(relicId, { status: "FORGING_3D" });
    await assertBudget(meshOp(config.ultraMode));

    const meshStart = Date.now();
    // Chained by task id, not image url — Meshy reads the concept straight from
    // the completed text-to-image task, so nothing needs public hosting.
    const meshTaskId = await createMeshFromConceptTask(chosen.taskId, {
      meshyModel: config.meshyModel,
      ultraMode: config.ultraMode,
      targetPolycount: config.targetPolycount,
      enablePbr: config.enablePbr,
      targetFormats: config.targetFormats,
      shouldRemesh: config.shouldRemesh,
    });
    emitRelicEvent(relicId, { type: "mesh.generating", taskId: meshTaskId });

    let lastPercent = -1;
    const mesh = await waitForTask("image-to-3d", meshTaskId, (task) => {
      const percent = Math.round(task.progress ?? 0);
      if (percent > lastPercent) {
        lastPercent = percent;
        emitRelicEvent(relicId, { type: "mesh.progress", percent });
      }
    });

    const glbUrl = mesh.model_urls.glb;
    if (!glbUrl) throw new MeshyError("Mesh task completed without a GLB");
    const meshMs = Date.now() - meshStart;

    /* ----------------------------------------------------------- optimize */
    const raw = await fetchBytes(glbUrl);
    const { data, stats } = await optimizeGlb(raw);
    await writeFile(path.join(dir, "model.glb"), data);
    const modelUrl = `/assets/relics/${relicId}/model.glb`;

    await patchRelic(relicId, {
      status: "MODEL_READY",
      modelUrl,
      meshTaskId,
      meshMs,
      optimizeMs: stats.ms,
      glbBytes: stats.bytesAfter,
      rawGlbBytes: stats.bytesBefore,
    });
    emitRelicEvent(relicId, {
      type: "mesh.ready",
      modelUrl,
      ms: meshMs,
      bytes: stats.bytesAfter,
    });

    /* ----------------------------------------------------------- complete */
    const totalMs = Date.now() - startedAt;
    const complete = await patchRelic(relicId, { status: "COMPLETE", totalMs });

    emitRelicEvent(relicId, {
      type: "relic.complete",
      relicId,
      name: initial.name,
      dna: initial.dna,
      conceptUrl,
      modelUrl,
      transform: complete?.transform ?? null,
      totalMs,
      cached: false,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof MeshyError ? err.retryable : false;

    // The experience never breaks. A same-archetype relic keeps the reveal
    // intact; the raw error is confined to the debug route.
    const fallback = await findArchetypeFallback(initial.dna.weaponClass, initial.dna.element);
    await patchRelic(relicId, { status: "FAILED", error });

    emitRelicEvent(relicId, {
      type: "relic.failed",
      stage: "FORGING_3D",
      retryable,
      ...(fallback ? { fallbackRelicId: fallback.relicId } : {}),
    });
  }
}

/** Re-runs a failed relic from the top, reusing its DNA and prompt. */
export async function retryRelic(record: RelicRecord): Promise<void> {
  await patchRelic(record.relicId, { status: "DNA_READY", error: null });
  void runGeneration(record).catch(() => {});
}
