/**
 * Buys every rigged character a standing pose.
 *
 * Rigging ships walking and running free and nothing else, so a character that
 * is not moving had no clip to play. The arena worked around that by running the
 * walk at 18% speed, on the theory that a very slow walk reads as breathing. It
 * does not: it reads as a boss marching on the spot, which is exactly what it
 * is, and it is the first thing anyone notices about a fight where the boss
 * spends most of its time within reach of you and therefore standing still.
 *
 * Meshy's animation library has an Idle action, and applying one costs 3 credits
 * against a rig that already exists. Eight characters is 24 credits to replace
 * the single worst-looking thing in the game.
 *
 *   pnpm --filter @relic/api exec tsx scripts/animate-characters.ts
 *   pnpm --filter @relic/api exec tsx scripts/animate-characters.ts --only ember
 *   pnpm --filter @relic/api exec tsx scripts/animate-characters.ts --recover
 *
 * --recover downloads clips that were paid for and then dropped on the floor.
 * The first run of this script read the result under the wrong key, so eight
 * tasks succeeded, eight sets of credits were spent, and every one reported no
 * glb. Meshy keeps finished tasks, so they can be fetched rather than bought
 * twice.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createAnimation, waitForAnimation } from "../src/services/meshy/meshy.rig.js";
import { meshyJson } from "../src/services/meshy/meshy.client.js";
import { optimizeRiggedGlb } from "../src/generation/optimizeGlb.js";

/**
 * Action 0, Idle, from Meshy's animation library.
 *
 * Named here rather than passed in, because the whole point is that every
 * character stands the same way: five bosses idling differently would read as
 * five different games, and the one thing this clip has to do is be unremarkable.
 */
const IDLE_ACTION = 0;

const TARGETS = [
  { kind: "champions", slug: "ember" },
  { kind: "champions", slug: "frost" },
  { kind: "champions", slug: "storm" },
  { kind: "bosses", slug: "ashen-warden" },
  { kind: "bosses", slug: "drowned-choir" },
  { kind: "bosses", slug: "gilded-husk" },
  { kind: "bosses", slug: "rootbound-king" },
  { kind: "bosses", slug: "hollow-sovereign" },
] as const;

interface RigRecord {
  rigTaskId: string;
  idleTaskId?: string;
}

function rigPath(kind: string, slug: string): string {
  return path.join(env.storageDir, kind, slug, "rig", "rig.json");
}

/**
 * Saves a finished clip against a character.
 *
 * Shared by both paths, so a recovered clip lands exactly where a freshly
 * generated one would.
 */
async function save(file: string, record: RigRecord, taskId: string, url: string, slug: string) {
  /*
   * Textures only, like the rig clips.
   *
   * The standard optimizer welds and prunes, which is exactly the surgery that
   * breaks skin weights and animation channels, so a skinned GLB gets the
   * texture pass and nothing else.
   */
  const { data } = await optimizeRiggedGlb(await fetchBytes(url));
  await writeFile(path.join(path.dirname(file), "idle.glb"), data);
  await writeFile(file, JSON.stringify({ ...record, idleTaskId: taskId }, null, 2));
  console.log(`  ok  ${slug} - ${(data.byteLength / 1024 / 1024).toFixed(2)}MB`);
}

/**
 * Picks up tasks that were paid for and never downloaded.
 *
 * Matched by creation order rather than by id, because the ids were never
 * written down: the failure happened before the record was saved. The tasks were
 * created one per character in the order below, in a single run, so sorting the
 * recent animate tasks oldest-first lines them up. It checks the count before
 * trusting that.
 */
async function recover(): Promise<void> {
  const raw = await meshyJson<unknown>("/v1/animations?page_num=1&page_size=20", { method: "GET" });
  const tasks = (Array.isArray(raw) ? raw : []) as {
    id: string;
    status: string;
    created_at: number;
    result?: { animation_glb_url?: string | null } | null;
  }[];

  const done = tasks
    .filter((task) => task.status === "SUCCEEDED" && task.result?.animation_glb_url)
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-TARGETS.length);

  if (done.length !== TARGETS.length) {
    console.error(`Found ${done.length} finished animations, expected ${TARGETS.length}. Not guessing.`);
    return;
  }

  console.log(`\nRecovering ${done.length} idle clips already paid for. No credits.\n`);

  for (const [i, target] of TARGETS.entries()) {
    const task = done[i];
    const url = task?.result?.animation_glb_url;
    if (!task || !url) continue;

    const file = rigPath(target.kind, target.slug);
    try {
      const record = JSON.parse(await readFile(file, "utf8")) as RigRecord;
      await save(file, record, task.id, url, target.slug);
    } catch (err) {
      console.error(`  !!  ${target.slug}: ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--recover")) return recover();

  const onlyArg = process.argv.indexOf("--only");
  const only =
    onlyArg === -1 ? null : new Set((process.argv[onlyArg + 1] ?? "").split(",").filter(Boolean));
  const targets = only ? TARGETS.filter((t) => only.has(t.slug)) : TARGETS;

  const balance = await getBalance();
  console.log(`\nIdle clips for ${targets.length} characters`);
  console.log(`  ~${targets.length * 3} credits (balance ${balance})\n`);

  for (const target of targets) {
    const file = rigPath(target.kind, target.slug);
    let record: RigRecord;
    try {
      record = JSON.parse(await readFile(file, "utf8")) as RigRecord;
    } catch {
      console.log(`skip  ${target.slug} - no rig, run rig-characters.ts first`);
      continue;
    }

    // Idempotent: a rerun after one failure does not re-spend on the rest.
    if (record.idleTaskId) {
      console.log(`skip  ${target.slug} - idle already generated`);
      continue;
    }

    try {
      const taskId = await createAnimation(record.rigTaskId, IDLE_ACTION);
      const task = await waitForAnimation(taskId);
      const url = task.result?.animation_glb_url;
      if (!url) throw new Error("animation returned no glb");

      await save(file, record, taskId, url, target.slug);
    } catch (err) {
      console.error(`  !!  ${target.slug}: ${(err as Error).message}`);
    }
  }

  console.log(`\nSpent ${balance - (await getBalance())} credits.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
