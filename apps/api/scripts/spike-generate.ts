/**
 * Gate 0 spike generator.
 *
 * Runs the real hero pipeline (nano-banana-pro concept → meshy-7 + ultra mesh)
 * against a fixed corpus of deliberately varied weapon shapes, and writes the
 * results to storage/spike/ for the /lab harness to score.
 *
 * Topology parity is the point: validating the normalizer against meshy-t2
 * output would mean validating it against geometry that never ships.
 *
 *   pnpm spike -- --wave 0     3 shapes, Gate 0A: can a GLB load at all
 *   pnpm spike -- --wave 1     6 shapes, core corpus
 *   pnpm spike -- --wave 2     6 more, completes core + adds stress cases
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/env.js";
import { HERO_GENERATION_CONFIG } from "@relic/core";
import { getBalance } from "../src/services/meshy/meshy.balance.js";
import { createConceptImage } from "../src/services/meshy/meshy.image.js";
import { createMeshFromConceptTask } from "../src/services/meshy/meshy.imageTo3d.js";
import { waitForTask } from "../src/services/meshy/meshy.tasks.js";

type Corpus = "core" | "stress";

interface SpikeShape {
  slug: string;
  wave: 0 | 1 | 2;
  corpus: Corpus;
  why: string;
  subject: string;
}

/**
 * The composition contract below is identical to the one compileRelicPrompt
 * will emit. Gate 0B's raw-angle number is only meaningful if the spike images
 * are framed exactly the way production images will be.
 */
const COMPOSITION = [
  "Designed as a functional fantasy game weapon.",
  "Single isolated weapon, full object visible, vertical orientation,",
  "tip pointing up, pommel down, three-quarter view, centered composition.",
  "No character. No hands. No environment. Neutral background.",
  "Strong readable silhouette. Production-quality game concept art.",
].join(" ");

const SHAPES: SpikeShape[] = [
  // Wave 0 — Gate 0A. Can a meshy-7 GLB load in R3F at all?
  {
    slug: "greatsword",
    wave: 0,
    corpus: "core",
    why: "baseline",
    subject: "a legendary two-handed greatsword, straight broad blade, dark steel",
  },
  {
    slug: "spear",
    wave: 0,
    corpus: "core",
    why: "extreme aspect ratio",
    subject: "a legendary spear, long slender shaft, narrow leaf-shaped point",
  },
  {
    slug: "warhammer",
    wave: 0,
    corpus: "core",
    why: "mass at one end, weak axis dominance",
    subject: "a legendary warhammer, heavy squared head, short thick haft",
  },

  // Wave 1 — completes the viability read.
  {
    slug: "curved-saber",
    wave: 1,
    corpus: "core",
    why: "principal axis diverges from visual axis",
    subject: "a legendary curved saber, deeply curved single-edged blade",
  },
  {
    slug: "asymmetric-axe",
    wave: 1,
    corpus: "core",
    why: "off-axis mass",
    subject: "a legendary battle axe with one large asymmetric bearded blade",
  },
  {
    slug: "glaive",
    wave: 1,
    corpus: "core",
    why: "blade at the end of a long shaft",
    subject: "a legendary glaive, long pole with a broad blade at one end",
  },

  // Wave 2 — completes core, then probes the boundary.
  {
    slug: "dagger",
    wave: 2,
    corpus: "core",
    why: "small scale, weak profile signal",
    subject: "a legendary dagger, short tapered blade, ornate crossguard",
  },
  {
    slug: "ornate-longsword",
    wave: 2,
    corpus: "core",
    why: "vertex-density trap — heavy detail concentrated in the pommel",
    subject:
      "a legendary longsword with an extremely ornate filigreed pommel and decorated crossguard",
  },
  {
    slug: "twin-maul",
    wave: 2,
    corpus: "stress",
    why: "symmetric — no tip taper at either end",
    subject: "a legendary twin-headed maul, identical heavy heads at both ends of the haft",
  },
  {
    slug: "crystal-shard-blade",
    wave: 2,
    corpus: "stress",
    why: "irregular protrusions confuse the radius profile",
    subject: "a legendary jagged crystalline shard blade with irregular protruding facets",
  },
  {
    slug: "ringed-staff",
    wave: 2,
    corpus: "stress",
    why: "mass ring at the top inverts the guard heuristic",
    subject: "a legendary ringed staff, heavy ornamental ring mounted at the top of a long shaft",
  },
  {
    slug: "chained-flail",
    wave: 2,
    corpus: "stress",
    why: "disconnected components after merge — never P0, boundary probe only",
    subject: "a legendary chained flail, spiked ball connected by chain links to a handle",
  },
];

function promptFor(shape: SpikeShape): string {
  return `${shape.subject}. ${COMPOSITION}`;
}

async function main() {
  const waveArg = process.argv.indexOf("--wave");
  const wave = waveArg === -1 ? 0 : Number(process.argv[waveArg + 1]);
  const shapes = SHAPES.filter((s) => s.wave === wave);

  if (shapes.length === 0) {
    console.error(`No shapes for wave ${wave}. Use --wave 0, 1, or 2.`);
    process.exit(1);
  }

  const cfg = HERO_GENERATION_CONFIG;
  const perModel = (cfg.imageModel === "nano-banana-pro" ? 9 : 3) + (cfg.ultraMode ? 35 : 30);
  const startBalance = await getBalance();

  console.log(`\nGate 0 spike — wave ${wave}`);
  console.log(`  shapes:   ${shapes.length} (${shapes.map((s) => s.slug).join(", ")})`);
  console.log(`  config:   ${cfg.imageModel} → ${cfg.meshyModel}${cfg.ultraMode ? " + ultra" : ""}`);
  console.log(`  estimate: ~${perModel * shapes.length} credits`);
  console.log(`  balance:  ${startBalance}\n`);

  if (startBalance - perModel * shapes.length < env.CREDIT_FLOOR) {
    console.error(`Refusing: would drop below CREDIT_FLOOR (${env.CREDIT_FLOOR}).`);
    process.exit(1);
  }

  const outRoot = path.join(env.storageDir, "spike");
  await mkdir(outRoot, { recursive: true });

  const results: Record<string, unknown>[] = [];

  // Sequential on purpose: a spike that half-fails should fail early and
  // cheaply, and the logs stay readable.
  for (const [i, shape] of shapes.entries()) {
    const label = `[${i + 1}/${shapes.length}] ${shape.slug}`;
    const dir = path.join(outRoot, shape.slug);
    await mkdir(dir, { recursive: true });
    const startedAt = Date.now();

    try {
      console.log(`${label} concept…`);
      const conceptTaskId = await createConceptImage(promptFor(shape), {
        imageModel: cfg.imageModel,
      });
      const concept = await waitForTask("text-to-image", conceptTaskId);
      const conceptUrl = concept.image_urls[0];
      if (!conceptUrl) throw new Error("concept task returned no image");
      const conceptMs = Date.now() - startedAt;

      console.log(`${label} concept ok (${(conceptMs / 1000).toFixed(1)}s) → mesh…`);
      const meshStartedAt = Date.now();
      const meshTaskId = await createMeshFromConceptTask(conceptTaskId, {
        meshyModel: cfg.meshyModel,
        ultraMode: cfg.ultraMode,
        targetPolycount: cfg.targetPolycount,
        enablePbr: cfg.enablePbr,
        targetFormats: cfg.targetFormats,
      });

      let lastPct = -1;
      const mesh = await waitForTask("image-to-3d", meshTaskId, (t) => {
        const pct = Math.floor((t.progress ?? 0) / 10) * 10;
        if (pct > lastPct) {
          lastPct = pct;
          process.stdout.write(`  ${pct}% `);
        }
      });
      process.stdout.write("\n");

      const glbUrl = mesh.model_urls.glb;
      if (!glbUrl) throw new Error("mesh task returned no glb url");
      const meshMs = Date.now() - meshStartedAt;

      // Download rather than link: Meshy asset URLs expire, and a demo that
      // 404s on replay is worse than no demo.
      const [conceptBytes, glbBytes] = await Promise.all([
        fetch(conceptUrl).then((r) => r.arrayBuffer()),
        fetch(glbUrl).then((r) => r.arrayBuffer()),
      ]);
      await writeFile(path.join(dir, "concept.png"), Buffer.from(conceptBytes));
      await writeFile(path.join(dir, "model.glb"), Buffer.from(glbBytes));

      const meta = {
        slug: shape.slug,
        corpus: shape.corpus,
        why: shape.why,
        prompt: promptFor(shape),
        conceptTaskId,
        meshTaskId,
        conceptMs,
        meshMs,
        glbBytes: glbBytes.byteLength,
        config: cfg,
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
      results.push(meta);

      console.log(
        `${label} done — mesh ${(meshMs / 1000).toFixed(1)}s, ` +
          `${(glbBytes.byteLength / 1024 / 1024).toFixed(2)} MB\n`,
      );
    } catch (err) {
      console.error(`${label} FAILED: ${(err as Error).message}\n`);
      results.push({ slug: shape.slug, error: (err as Error).message });
    }
  }

  await writeFile(
    path.join(outRoot, `wave-${wave}.json`),
    JSON.stringify({ wave, results }, null, 2),
  );

  const endBalance = await getBalance();
  const ok = results.filter((r) => !("error" in r)).length;
  console.log(`Wave ${wave}: ${ok}/${shapes.length} succeeded.`);
  console.log(`Credits spent: ${startBalance - endBalance} (balance ${endBalance})`);
  console.log(`Output: ${outRoot}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
