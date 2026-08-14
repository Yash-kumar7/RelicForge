import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The cache is what makes the demo recordable, so its failure modes matter as
 * much as the pipeline's. These tests exercise the two that actually bit:
 * a stale in-memory index, and relics orphaned by a restart.
 */

// The module reads env at import time, so the temp dirs must exist first.
const dir = await mkdtemp(path.join(tmpdir(), "relic-cache-"));
process.env.MESHY_API_KEY = "msy_test_key_not_real";
process.env.CACHE_DIR = path.join(dir, "cache");
process.env.STORAGE_DIR = path.join(dir, "storage");

const {
  __resetCache,
  findByCacheKey,
  findArchetypeFallback,
  getRelic,
  listRelics,
  patchRelic,
  putRelic,
  reapInterruptedRelics,
} = await import("../src/cache/fileCache.js");
const { env } = await import("../src/env.js");

const baseRelic = (over: Record<string, unknown> = {}) => ({
  relicId: "relic-1",
  cacheKey: "key-1",
  name: "Emberruin",
  dna: {
    weaponClass: "greatsword" as const,
    element: "fire" as const,
    temperament: "brutal" as const,
    condition: "shattered" as const,
    bossInfluence: "the Ashen Warden",
    rarity: "legendary" as const,
  },
  status: "COMPLETE" as const,
  prompt: "a legendary greatsword",
  generationMode: "hero" as const,
  cached: false,
  createdAt: Date.now(),
  ...over,
});

beforeEach(async () => {
  __resetCache();
  await rm(env.cacheDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe("relic store", () => {
  it("round-trips a relic", async () => {
    await putRelic(baseRelic());
    expect((await getRelic("relic-1"))?.name).toBe("Emberruin");
  });

  it("only serves completed relics from the cache key index", async () => {
    // A failed relic replayed as a hit would show the player a broken forge.
    await putRelic(baseRelic({ status: "FAILED" }));
    expect(await findByCacheKey("key-1")).toBeNull();

    await patchRelic("relic-1", { status: "COMPLETE" });
    expect((await findByCacheKey("key-1"))?.relicId).toBe("relic-1");
  });

  it("reloads when another process rewrites the index", async () => {
    // The seeding script and the dev server are separate processes. Holding the
    // index in memory forever made seeded relics invisible to a running server.
    await putRelic(baseRelic());

    const indexPath = path.join(env.cacheDir, "index.json");
    const raw = JSON.parse(await readFile(indexPath, "utf8"));
    raw.relics["relic-2"] = baseRelic({ relicId: "relic-2", cacheKey: "key-2", name: "Foreign" });
    raw.byCacheKey["key-2"] = "relic-2";
    // mtime resolution is coarse; bump it explicitly rather than racing it.
    await new Promise((r) => setTimeout(r, 12));
    await writeFile(indexPath, JSON.stringify(raw));

    expect((await findByCacheKey("key-2"))?.name).toBe("Foreign");
  });

  it("does not lose foreign writes on the next local write", async () => {
    await putRelic(baseRelic());
    const indexPath = path.join(env.cacheDir, "index.json");
    const raw = JSON.parse(await readFile(indexPath, "utf8"));
    raw.relics["relic-2"] = baseRelic({ relicId: "relic-2", cacheKey: "key-2", name: "Foreign" });
    raw.byCacheKey["key-2"] = "relic-2";
    await new Promise((r) => setTimeout(r, 12));
    await writeFile(indexPath, JSON.stringify(raw));

    await putRelic(baseRelic({ relicId: "relic-3", cacheKey: "key-3", name: "Local" }));

    const all = await listRelics();
    expect(all.map((r) => r.name).sort()).toEqual(["Emberruin", "Foreign", "Local"]);
  });

  it("survives a corrupt index instead of taking the server down", async () => {
    await putRelic(baseRelic());
    __resetCache();
    await writeFile(path.join(env.cacheDir, "index.json"), "{ not json");
    await expect(listRelics()).resolves.toEqual([]);
  });
});

describe("reapInterruptedRelics", () => {
  it("fails anything left mid-generation and leaves terminal records alone", async () => {
    await putRelic(baseRelic({ relicId: "done", cacheKey: "k1", status: "COMPLETE" }));
    await putRelic(baseRelic({ relicId: "stuck", cacheKey: "k2", status: "FORGING_3D" }));
    await putRelic(baseRelic({ relicId: "also-stuck", cacheKey: "k3", status: "GENERATING_CONCEPT" }));

    expect(await reapInterruptedRelics()).toBe(2);
    expect((await getRelic("done"))?.status).toBe("COMPLETE");
    expect((await getRelic("stuck"))?.status).toBe("FAILED");
    expect((await getRelic("stuck"))?.error).toMatch(/restart/i);
  });

  it("is a no-op when nothing was interrupted", async () => {
    await putRelic(baseRelic());
    expect(await reapInterruptedRelics()).toBe(0);
  });
});

describe("findArchetypeFallback", () => {
  it("prefers an exact class and element match", async () => {
    await putRelic(baseRelic({ relicId: "ice-spear", cacheKey: "k1", name: "Frost" ,
      dna: { ...baseRelic().dna, weaponClass: "spear", element: "ice" } }));
    await putRelic(baseRelic({ relicId: "fire-sword", cacheKey: "k2", name: "Ember" }));

    expect((await findArchetypeFallback("greatsword", "fire"))?.name).toBe("Ember");
  });

  it("falls back to the same class when no element matches", async () => {
    // Keeping the cinematic intact matters more than matching the element.
    await putRelic(baseRelic({ relicId: "fire-sword", cacheKey: "k2", name: "Ember" }));
    expect((await findArchetypeFallback("greatsword", "ice"))?.name).toBe("Ember");
  });

  it("returns null when there is nothing to fall back to", async () => {
    expect(await findArchetypeFallback("spear", "ice")).toBeNull();
  });
});
