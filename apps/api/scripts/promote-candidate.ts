/**
 * Promotes a hero candidate over the relic already cached for the same DNA.
 *
 * Candidates are generated outside the cache on purpose: choosing which weapon
 * reads best is a judgement about how it looks, and a heuristic should not make
 * it. Promotion is a file copy plus a metrics update, since the candidate shares
 * the winner's DNA and therefore its cache key.
 *
 * Costs nothing and spends nothing. The losing candidates stay on disk.
 *
 *   pnpm --filter @relic/api exec tsx scripts/promote-candidate.ts ember/1 frost/2
 */
import { copyFile, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { findByCacheKey, patchRelic } from "../src/cache/fileCache.js";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: promote-candidate.ts <run>/<attempt> [...]   e.g. ember/1 frost/2");
  process.exit(1);
}

interface CandidateMeta {
  cacheKey: string;
  name: string;
  conceptTaskId?: string;
  meshTaskId?: string;
}

async function readMeta(dir: string): Promise<CandidateMeta> {
  try {
    return JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as CandidateMeta;
  } catch {
    const run = path.dirname(dir);
    for (const sibling of await readdir(run)) {
      const candidate = path.join(run, sibling, "meta.json");
      try {
        const meta = JSON.parse(await readFile(candidate, "utf8")) as CandidateMeta;
        console.log(`  (no meta.json; using key from sibling ${sibling})`);
        return meta;
      } catch {
        continue;
      }
    }
    throw new Error("no meta.json in this candidate or any sibling");
  }
}

for (const target of targets) {
  const dir = path.join(env.storageDir, "candidates", target);
  try {
    /**
     * A candidate recovered from a dropped stream has a mesh but no meta.json,
     * since recovery restores the asset and not the bookkeeping. Every attempt
     * in a run shares the same DNA and therefore the same cache key, so a
     * sibling's metadata is not a guess: it is the same record.
     */
    const meta = await readMeta(dir);

    const cached = await findByCacheKey(meta.cacheKey);
    if (!cached) {
      console.error(`${target}: no cached relic for key ${meta.cacheKey}; run precache first`);
      continue;
    }

    const destDir = path.join(env.storageDir, "relics", cached.relicId);
    await copyFile(path.join(dir, "model.glb"), path.join(destDir, "model.glb"));
    await copyFile(path.join(dir, "concept.png"), path.join(destDir, "concept.png"));

    // The record's metrics describe the asset now on disk, so they follow it.
    const { size } = await stat(path.join(destDir, "model.glb"));
    await patchRelic(cached.relicId, {
      glbBytes: size,
      conceptTaskId: meta.conceptTaskId ?? cached.conceptTaskId ?? null,
      meshTaskId: meta.meshTaskId ?? cached.meshTaskId ?? null,
    });

    console.log(
      `${target} -> ${cached.name}  (${(size / 1048576).toFixed(2)} MB, key ${meta.cacheKey})`,
    );
  } catch (err) {
    console.error(`${target} FAILED: ${(err as Error).message}`);
  }
}
