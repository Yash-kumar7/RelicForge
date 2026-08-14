# RelicForge

> **Every legendary is actually legendary.**

**What if legendary loot was actually one-of-one?**

Games pick rewards from a finite pile of assets. You kill the boss, a loot table rolls, and you receive `legendary_sword_04.glb` — the same file that eleven million other players received.

RelicForge doesn't pick. It **forges**.

```
boss dies → analyze how you won → Relic DNA → concept art → Meshy-7 → GLB → in your hands
```

Two players beat the same boss and walk away holding physically different weapons, because they fought differently.

| You fought | You receive |
|---|---|
| Fire · heavy swings · 8% health · never healed | a thick, cracked, molten greatsword |
| Ice · precise strikes · 82% health · seven dodges | a slender, translucent, crystalline spear |

**Same boss. Different story. Different relic.**

Both of those relics are seeded into the cache, so replaying either fight resolves in ~25ms and spends nothing. Fight differently and it generates for real.

---

## The interesting problem

Calling an API is not the hard part. The hard part is this:

> **Generated geometry is unpredictable, and a game needs it to be reliable.**

Meshy returns a beautiful weapon. Nothing promises it is upright, correctly scaled, or that your game knows where the handle is. A gorgeous sword held by the blade, floating sideways through the player's face, is not loot — it's a bug.

So RelicForge's first engineering task wasn't the boss fight or the API client. It was a blocking gate: **can arbitrary generated weapons be oriented, scaled, and gripped automatically, with zero manual asset editing?**

### What the measurement showed

Before writing any geometry math, the spike measured how crooked meshy-7's output actually arrives:

| weapon | raw angle | end confidence | grip | triangles | normalize |
|---|---|---|---|---|---|
| greatsword | 0.1° | 0.55 | 0.197 | 11,990 | 9 ms |
| spear | 0.0° | 0.67 | 0.040 | 11,366 | 5 ms |
| warhammer | 0.1° | 0.09 | 0.120 | 12,315 | 3 ms |

**Median raw angle: 0.1°.** Meshy-7 preserves the framing of the concept image. Because every concept is generated under a fixed composition contract — *vertical, tip up, pommel down, three-quarter view* — the meshes arrive essentially canonical.

The expensive version of the problem doesn't exist. That's a finding worth an hour of measurement, and it's why the fallback ladder below stayed unbuilt.

### The normalizer still earns its place

It runs as a verifier rather than a rescue, and it is built to be correct rather than lucky:

**Area-weighted PCA over triangle centroids**, not a bounding box, and not vertex PCA.

- An AABB fails outright on a weapon tilted inside its own local frame — no single X/Y/Z extent dominates.
- Plain vertex PCA fails on ornamentation: Meshy tessellates unevenly, and a decorative pommel carrying 3× the vertex density of the blade drags the principal axis off the weapon line. Weighting each triangle centroid by triangle area is density-invariant, and about ten lines of code.

Both failure modes are covered by tests built on synthetic geometry, where the correct answer is known rather than eyeballed.

**Tip and grip are measured, not assumed.** Vertices are projected onto the principal axis and binned into a radius profile. A blade tapers toward zero at the tip; a guard appears as a sharp local maximum near the other end; the grip sits just inboard of it.

**And the heuristic admits when it doesn't know.** A double-edged blade, a symmetric staff, a twin-headed maul — none have taper asymmetry to read. So `resolveEnds` returns a confidence:

| confidence | behavior |
|---|---|
| > 0.8 | accept automatically |
| 0.4 – 0.8 | blend toward the weapon-class prior |
| < 0.4 | defer to the class prior; flag for a hint |

The warhammer above scores **0.09** and correctly falls back rather than confidently guessing wrong. A system that always claims an answer is quietly wrong a fifth of the time.

### The line that matters

An automatic pipeline with a structured human override is a real production system. One that needs a person to open Blender every time an AI generates a sword is not — the runtime-generation story would be fiction.

So RelicForge allows a persisted `OrientationHint` (authored in seconds via `/lab`, stored on the relic record) and does **not** allow hand-editing a GLB. In the current build no hint is used by any shipped relic.

---

## Three things the API taught us

Each of these cost real credits to discover, and each changed the code.

**1. `should_remesh` defaults to `false` on meshy-6/7.**
`target_polycount` only takes effect when it's true, so a perfectly reasonable-looking request was silently ignored — and returned meshes of **1.5M–3.1M triangles, 37–116 MB**. Sending it explicitly brings the same weapon back at ~12,000 triangles.

**2. The boss name was being drawn as a caption.**
The first Gate 1 concept rendered `ASHEN WARDEN` in large lettering across the image — which then becomes real geometry and real texture in the 3D model. The composition contract gained explicit no-text clauses, and `PROMPT_VERSION` was bumped, which invalidated every cached relic automatically.

**3. Textures dominate once geometry is fixed.**
Three 4K PBR maps re-exported as PNG land at 12–22 MB. Generated GLBs pass through a gltf-transform stage (weld → dedup → prune → WebP @ 2K):

```
116 MB  →  1.55 MB     in ~500 ms
```

---

## How it works

```
                    ┌──────────────────────────────┐
   fight            │  React + React Three Fiber   │
   ─────────────▶   │  arena · boss · telemetry    │
                    └───────────────┬──────────────┘
                        CombatTelemetry (POST /api/relics)
                                    ▼
                    ┌──────────────────────────────┐
                    │   Fastify  (owns the key)    │
                    │                              │
   telemetry ──▶ buildRelicDNA ──▶ compileRelicPrompt
                    │                    │         │
                    │              relicCacheKey   │
                    │                    │         │
                    │        ┌───────────┴──────┐  │
                    │      HIT: 33ms, 0 credits │  │
                    │      MISS ▼               │  │
                    │   Meshy text-to-image     │  │
                    │        │ input_task_id    │  │
                    │        ▼                  │  │
                    │   Meshy image-to-3d       │  │
                    │   (meshy-7 + ultra)       │  │
                    │        ▼                  │  │
                    │   optimize · cache · store│  │
                    └───────────────┬──────────────┘
                          SSE domain events
                                    ▼
                    ┌──────────────────────────────┐
                    │  forge sequence · normalize  │
                    │  · attach to hand · wield    │
                    └──────────────────────────────┘
```

**Two API details worth stealing:**

- **`input_task_id`** — image-to-3d accepts the id of a completed text-to-image task directly. The concept image never needs public hosting, which deletes an entire storage dependency from the pipeline.
- **Native per-task SSE** — `/v1/{text-to-image,image-to-3d}/:id/stream`. Consumed server-side and re-emitted as domain events, so there's no webhook receiver and no public tunnel for local development.

### Measured numbers

| stage | time |
|---|---|
| concept (nano-banana-pro) | 17–20 s |
| mesh (meshy-7 + ultra) | 86–115 s |
| optimize | ~500 ms |
| **total, live** | **~100–135 s** |
| **total, cached** | **33 ms** |

The forge sequence is built to hold that latency: named stages (`TEMPERING… SHAPING… BINDING… AWAKENING…`) driven by real task progress, and the concept image revealed early as a payoff in its own right. `Loading 47%` makes waiting feel like a defect. Naming the work makes it feel like a forge.

---

## Telemetry → DNA

Deterministic, so the causal link is legible to the player. Randomness here would turn the mechanic into a slot machine wearing a story.

| signal | rule | result |
|---|---|---|
| health remaining | ≤ 20% | `shattered` · achievement `DEATH'S DOOR` |
| | 21–70% | `battle-worn` |
| | ≥ 71% | `pristine` |
| heavy-attack ratio | ≥ 0.6 | `brutal` → greatsword |
| dodges ≥ 4, ratio ≤ 0.35 | | `elegant` → spear |
| affinity | fire / ice / storm | `fire` / `ice` / `lightning` |

The cache key hashes DNA **and the entire generation config** — prompt version, image model, ultra mode, polycount, PBR. Keying on DNA alone is the classic trap: you edit the prompt compiler, regenerate, receive the previously cached sword, and lose an afternoon to it.

---

## Setup

```bash
pnpm install
cp .env.example .env      # add your MESHY_API_KEY
pnpm dev                  # web :5173 · api :8787
```

| command | what it does |
|---|---|
| `pnpm dev` | web + api together, `/api` and `/assets` proxied |
| `pnpm test` | relic-core suite (62 tests) |
| `pnpm typecheck` | strict, all workspaces |
| `pnpm lint` | ESLint flat config, all workspaces |
| `pnpm spike -- --wave 0` | generate the Gate 0 corpus (~130 credits) |
| `pnpm --filter @relic/api exec tsx scripts/seed-hero-relics.ts` | promote Gate 1 output into the live cache |

Add `?mode=dev` to the game URL to use the cheap generation config (one concept, no ultra) while iterating.

**Routes:** `/` the game · `#/lab` the normalization harness · `#/compare` the two hero relics side by side, with a silhouette-only toggle · `/api/debug/relics` prompts, task ids, timings, cache hits.

Sound is synthesized at runtime with the Web Audio API — oscillators and filtered noise rather than sample files — so the repo carries no binary audio assets and no licensing questions.

---

## Layout

```
apps/web          React + R3F. Game, forge, lab. Never sees Meshy.
apps/api          Fastify. Owns MESHY_API_KEY. Only place api.meshy.ai appears.
packages/relic-core   Pure, no I/O. Imported by both.
```

`relic-core` staying pure is what lets the normalizer be unit-tested in Node against synthetic geometry **and** run in the browser at equip time. One implementation, one test suite, two runtimes.

---

## Limitations, honestly

- **Two weapon classes ship** (greatsword, spear). Warhammer is implemented and in the normalizer's test corpus, but its end-resolution confidence sits at 0.09, so it stays behind a flag until that improves.
- **Articulated weapons are out of scope.** A chained flail has multiple rigid bodies and no single principal axis; it needs different runtime semantics, not a better heuristic.
- **The file cache is a JSON index.** Correct for one process; SQLite when the schema stops moving.
- **Concept selection is a composition heuristic**, not a quality judgment — it rejects off-centre and small-in-frame subjects, nothing subtler.
- **The client bundle is ~1.5 MB (430 KB gzipped)**, dominated by three.js. The dev surfaces are code-split; the engine itself is on the critical path.
- **Losing forfeits the relic.** A weapon forged from a defeat would stop being a record of how you won.

## Where this goes

Once a game can generate assets from its own state, the same architecture covers one-of-one raid drops, tournament trophies, seasonal artifacts, guild monuments, and equipment that visibly evolves with the player who carries it.

The broader point: generative 3D can turn game state into **content**, not just help studios produce assets before launch.

---

*Built with the Meshy API. Remove Meshy and the central mechanic is gone — which is the whole idea.*
