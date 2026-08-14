/**
 * Rigs a generated character and downloads its free walking and running clips.
 *
 * Bosses and champions are static meshes moved by code, which is why they slide
 * rather than walk. Rigging costs 5 credits and includes both clips, so this is
 * the cheapest remaining quality lever by a wide margin.
 *
 * Meshy recommends t-pose input and ours were generated in a-pose, so this runs
 * one character first: 5 credits answers whether the whole cast can be rigged as
 * it stands, or whether it has to be regenerated in t-pose at roughly ten times
 * the cost.
 *
 *   pnpm --filter @relic/api exec tsx scripts/rig-characters.ts champions/ember [...]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { fetchBytes } from "../src/lib/fetchBytes.js";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createRig, waitForRig } from "../src/services/meshy/meshy.rig.js";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: rig-characters.ts <dir-under-storage> [...]");
  console.error("  e.g. champions/ember bosses/ashen-warden");
  process.exit(1);
}

const startBalance = await getBalance();
console.log(`\nRigging ${targets.length} character(s) - 5 credits each (balance ${startBalance})\n`);

for (const target of targets) {
  const dir = path.join(env.storageDir, target);
  try {
    // The mesh task id is the input: rigging chains by task exactly as
    // image-to-3d does, so nothing needs public hosting.
    const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as {
      meshTaskId?: string;
    };
    if (!meta.meshTaskId) throw new Error("meta.json has no meshTaskId");

    console.log(`${target} - rigging ${meta.meshTaskId}...`);
    // Height guides joint placement; ours are human-scale characters.
    const rigId = await createRig(meta.meshTaskId, { heightMeters: 1.8 });

    let last = -1;
    const task = await waitForRig(rigId, (t) => {
      const pct = Math.floor((t.progress ?? 0) / 25) * 25;
      if (pct > last) {
        last = pct;
        process.stdout.write(`  ${pct}%`);
      }
    });
    process.stdout.write("\n");

    const result = task.result;
    const rigged = result?.rigged_character_glb_url;
    const walking = result?.basic_animations?.walking_glb_url;
    const running = result?.basic_animations?.running_glb_url;
    if (!rigged) throw new Error("rig task returned no rigged glb");

    const rigDir = path.join(dir, "rig");
    await mkdir(rigDir, { recursive: true });

    // Deliberately not run through optimizeGlb: the optimizer welds and prunes,
    // which is exactly the kind of surgery that can break skinning and animation
    // channels. Rigged output ships as Meshy produced it.
    const saved: Record<string, number> = {};
    for (const [name, url] of [
      ["rigged.glb", rigged],
      ["walking.glb", walking],
      ["running.glb", running],
    ] as const) {
      if (!url) continue;
      const bytes = await fetchBytes(url);
      await writeFile(path.join(rigDir, name), Buffer.from(bytes));
      saved[name] = bytes.byteLength;
    }

    await writeFile(
      path.join(rigDir, "rig.json"),
      JSON.stringify({ target, rigTaskId: rigId, consumedCredits: task.consumed_credits, saved }, null, 2),
    );

    console.log(
      `${target} - ok: ` +
        Object.entries(saved)
          .map(([k, v]) => `${k} ${(v / 1048576).toFixed(2)} MB`)
          .join(", ") +
        "\n",
    );
  } catch (err) {
    console.error(`${target} FAILED: ${(err as Error).message}\n`);
  }
}

const endBalance = await getBalance();
console.log(`Spent ${startBalance - endBalance} credits (balance ${endBalance}).`);
