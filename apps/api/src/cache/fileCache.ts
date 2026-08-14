import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import {
  RelicDNASchema,
  RelicStatusSchema,
  RelicTransformSchema,
  OrientationHintSchema,
} from "@relic/core";

/**
 * Persistent relic store, JSON on disk.
 *
 * A database would be premature while the shape is still moving; this is one
 * file, trivially inspectable, and swapping it for SQLite later is a change to
 * this module alone. The important property is the cache key, not the storage
 * engine.
 */

export const RelicRecordSchema = z.object({
  relicId: z.string(),
  cacheKey: z.string(),
  name: z.string(),
  dna: RelicDNASchema,
  status: RelicStatusSchema,
  prompt: z.string(),
  generationMode: z.enum(["dev", "hero"]),
  conceptUrl: z.string().nullish(),
  modelUrl: z.string().nullish(),
  transform: RelicTransformSchema.nullish(),
  hint: OrientationHintSchema.nullish(),
  /** Diagnostics for the debug route and the write-up numbers. */
  conceptTaskId: z.string().nullish(),
  meshTaskId: z.string().nullish(),
  conceptMs: z.number().nullish(),
  meshMs: z.number().nullish(),
  optimizeMs: z.number().nullish(),
  totalMs: z.number().nullish(),
  glbBytes: z.number().nullish(),
  rawGlbBytes: z.number().nullish(),
  creditsSpent: z.number().nullish(),
  cached: z.boolean().default(false),
  error: z.string().nullish(),
  createdAt: z.number(),
});
export type RelicRecord = z.infer<typeof RelicRecordSchema>;

const IndexSchema = z.object({
  version: z.literal(1),
  relics: z.record(z.string(), RelicRecordSchema),
  /** cacheKey → relicId. */
  byCacheKey: z.record(z.string(), z.string()),
});
type Index = z.infer<typeof IndexSchema>;

/**
 * A factory, not a constant. A shared constant would be shallow-copied by
 * spreading, leaving `relics` and `byCacheKey` pointing at the *same* inner
 * objects — so every write would mutate the shared default, and a recovered
 * index would silently resurrect relics that were supposed to be gone.
 */
function emptyIndex(): Index {
  return { version: 1, relics: {}, byCacheKey: {} };
}

let cache: Index | null = null;
let loadedMtimeMs = 0;
let writeChain: Promise<void> = Promise.resolve();

function indexPath(): string {
  return path.join(env.cacheDir, "index.json");
}

/**
 * Re-reads the index whenever the file on disk is newer than what we hold.
 *
 * The seeding script and the dev server are separate processes writing the same
 * index. Caching it in memory forever means a seeded relic is invisible to a
 * running server, and the server's next write silently discards it.
 */
async function load(): Promise<Index> {
  let mtimeMs = 0;
  try {
    mtimeMs = (await stat(indexPath())).mtimeMs;
  } catch {
    // No index yet: first run.
    if (cache) return cache;
  }

  if (cache && mtimeMs <= loadedMtimeMs) return cache;

  try {
    const parsed = IndexSchema.safeParse(JSON.parse(await readFile(indexPath(), "utf8")));
    // A corrupt or outdated index must not take the server down — the assets
    // are still on disk and regenerating costs credits, not correctness.
    cache = parsed.success ? parsed.data : emptyIndex();
    loadedMtimeMs = mtimeMs;
  } catch {
    cache = cache ?? emptyIndex();
  }
  return cache;
}

/** Serialized writes: concurrent generations otherwise clobber the index. */
async function persist(): Promise<void> {
  const snapshot = cache;
  if (!snapshot) return;
  writeChain = writeChain.then(async () => {
    await mkdir(env.cacheDir, { recursive: true });
    await writeFile(indexPath(), JSON.stringify(snapshot, null, 2));
    // Record our own write so the next read does not treat it as foreign and
    // reload needlessly.
    loadedMtimeMs = (await stat(indexPath())).mtimeMs;
  });
  return writeChain;
}

export async function findByCacheKey(cacheKey: string): Promise<RelicRecord | null> {
  const index = await load();
  const relicId = index.byCacheKey[cacheKey];
  if (!relicId) return null;
  const record = index.relics[relicId];
  // Only completed relics are servable; a failed one must not be replayed as
  // if it were a hit.
  return record && record.status === "COMPLETE" ? record : null;
}

export async function getRelic(relicId: string): Promise<RelicRecord | null> {
  return (await load()).relics[relicId] ?? null;
}

export async function putRelic(record: RelicRecord): Promise<RelicRecord> {
  const index = await load();
  index.relics[record.relicId] = record;
  if (record.status === "COMPLETE") index.byCacheKey[record.cacheKey] = record.relicId;
  await persist();
  return record;
}

export async function patchRelic(
  relicId: string,
  patch: Partial<RelicRecord>,
): Promise<RelicRecord | null> {
  const index = await load();
  const existing = index.relics[relicId];
  if (!existing) return null;
  const next = { ...existing, ...patch };
  index.relics[relicId] = next;
  if (next.status === "COMPLETE") index.byCacheKey[next.cacheKey] = relicId;
  await persist();
  return next;
}

export async function listRelics(): Promise<RelicRecord[]> {
  const index = await load();
  return Object.values(index.relics).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Archetype fallback: when generation fails outright, a previously completed
 * relic of the same weapon class and element keeps the cinematic intact.
 * The player never sees a stack trace inside the reveal.
 */
export async function findArchetypeFallback(
  weaponClass: string,
  element: string,
): Promise<RelicRecord | null> {
  const all = await listRelics();
  return (
    all.find(
      (r) =>
        r.status === "COMPLETE" &&
        r.dna.weaponClass === weaponClass &&
        r.dna.element === element,
    ) ??
    all.find((r) => r.status === "COMPLETE" && r.dna.weaponClass === weaponClass) ??
    null
  );
}

/**
 * Marks relics that were mid-generation when the process died.
 *
 * Generation state lives in memory, so a restart orphans anything in flight:
 * the record sits in a non-terminal status forever and a client streaming it
 * waits for events that will never arrive. Failing them at boot makes the
 * situation visible and retryable instead of silent.
 */
export async function reapInterruptedRelics(): Promise<number> {
  const index = await load();
  let reaped = 0;

  for (const record of Object.values(index.relics)) {
    if (record.status === "COMPLETE" || record.status === "FAILED") continue;
    index.relics[record.relicId] = {
      ...record,
      status: "FAILED",
      error: "Interrupted by a server restart",
    };
    reaped++;
  }

  if (reaped > 0) await persist();
  return reaped;
}

/** Test seam. */
export function __resetCache(): void {
  cache = null;
  loadedMtimeMs = 0;
}
