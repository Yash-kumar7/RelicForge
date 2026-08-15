# RelicForge

> **The weapon does not exist until you win it.**

**What if legendary loot was actually one-of-one?**

Games pick rewards from a finite pile of assets. You kill the boss, a loot table rolls, and you receive `legendary_sword_04.glb`, the same file that eleven million other players received.

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

Relics are pre-generated for **every boss and every playstyle**, so replaying any
of them resolves in ~25ms and spends nothing. Fight some other way and it
generates for real, which is the honest path and stays the honest path: a demo
just should not be one API hiccup away from an awkward silence.

---

## The interesting problem

Calling an API is not the hard part. The hard part is this:

> **Generated geometry is unpredictable, and a game needs it to be reliable.**

Meshy returns a beautiful weapon. Nothing promises it is upright, correctly scaled, or that your game knows where the handle is. A gorgeous sword held by the blade, floating sideways through the player's face, is not loot, it's a bug.

So RelicForge's first engineering task wasn't the boss fight or the API client. It was a blocking gate: **can arbitrary generated weapons be oriented, scaled, and gripped automatically, with zero manual asset editing?**

### What the measurement showed

Before writing any geometry math, the spike measured how crooked meshy-7's
output actually arrives. Twelve shapes, chosen to be awkward on purpose:

| shape | raw angle | end confidence | grip | corpus |
|---|---|---|---|---|
| spear | 0.0° | 0.67 | 0.04 | core |
| ringed staff | 0.0° | 0.74 | 0.08 | stress |
| twin-headed maul | 0.0° | 1.00 | 0.13 | stress |
| greatsword | 0.1° | 0.55 | 0.20 | core |
| warhammer | 0.1° | 0.09 | 0.12 | core |
| glaive | 0.3° | 0.44 | 0.07 | core |
| crystalline shard-blade | 0.9° | 0.30 | 0.18 | stress |
| curved saber | 1.2° | 0.46 | 0.20 | core |
| chained flail | 2.4° | 0.51 | 0.20 | stress |
| asymmetric axe | 10.8° | 0.06 | 0.12 | core |
| dagger | 25.8° | 0.72 | 0.35 | core |
| ornate longsword | 50.3° | 0.56 | 0.25 | core |

**Median raw angle: 0.9°.** Most shapes arrive essentially canonical, because
every concept is generated under a fixed composition contract, *vertical, tip
up, pommel down, three-quarter view*, and image-to-3d preserves that framing.

But look at the bottom of the table. The dagger arrives 26° off and the ornate
longsword **50° off**. On those two, the PCA is not confirming a lucky result,
it is the only reason they end up upright at all.

That distinction matters, and an earlier version of this README got it wrong.
Measured on three shapes, the median was 0.1° and the conclusion looked like
"the hard version of this problem does not exist". Measured on twelve, two of
eight core shapes need real correction. Trusting the framing would have shipped
a game where roughly a quarter of weapons are visibly crooked in the player's
hand.

### The line that matters

An automatic pipeline with a structured human override is a real production system. One that needs a person to open Blender every time an AI generates a sword is not, the runtime-generation story would be fiction.

So RelicForge allows a persisted `OrientationHint` (authored in seconds via `/lab`, stored on the relic record) and does **not** allow hand-editing a GLB. In the current build no hint is used by any shipped relic.

---

## Three things the API taught us

Each of these cost real credits to discover, and each changed the code.

**1. `should_remesh` defaults to `false` on meshy-6/7.**
`target_polycount` only takes effect when it's true, so a perfectly reasonable-looking request was silently ignored, and returned meshes of **1.5M-3.1M triangles, 37-116 MB**. Sending it explicitly brings the same weapon back at ~12,000 triangles.

**2. The boss name was being drawn as a caption.**
The first Gate 1 concept rendered `ASHEN WARDEN` in large lettering across the image, which then becomes real geometry and real texture in the 3D model. The composition contract gained explicit no-text clauses, and `PROMPT_VERSION` was bumped, which invalidated every cached relic automatically.

**3. Textures dominate once geometry is fixed.**
Three 4K PBR maps re-exported as PNG land at 12-22 MB. Generated GLBs pass through a gltf-transform stage (weld → dedup → prune → WebP @ 2K):

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

**Meshy endpoints used:** text-to-image, image-to-3d (meshy-7 + ultra), remesh,
rigging, and balance. Five, across generation, topology, animation and metering.

**Two API details worth stealing:**

- **`input_task_id`**, image-to-3d accepts the id of a completed text-to-image task directly. The concept image never needs public hosting, which deletes an entire storage dependency from the pipeline.
- **Native per-task SSE**, `/v1/{text-to-image,image-to-3d}/:id/stream`. Consumed server-side and re-emitted as domain events, so there's no webhook receiver and no public tunnel for local development.

### Measured numbers

| stage | time |
|---|---|
| concept (nano-banana-pro) | 17-20 s |
| mesh (meshy-7 + ultra) | 86-115 s |
| optimize | ~500 ms |
| **total, live** | **~100-135 s** |
| **total, cached** | **33 ms** |

The forge sequence is built to hold that latency: named stages (`TEMPERING… SHAPING… BINDING… AWAKENING…`) driven by real task progress, and the concept image revealed early as a payoff in its own right. `Loading 47%` makes waiting feel like a defect. Naming the work makes it feel like a forge.

---

## Telemetry → DNA

Deterministic, so the causal link is legible to the player. Randomness here would turn the mechanic into a slot machine wearing a story.

| signal | rule | result |
|---|---|---|
| health remaining | ≤ 20% | `shattered` · achievement `DEATH'S DOOR` |
| | 21-70% | `battle-worn` |
| | ≥ 71% | `pristine` |
| heavy-attack ratio | ≥ 0.6 | `brutal` → greatsword |
| dodges ≥ 4, ratio ≤ 0.35 | | `elegant` → spear |
| affinity | fire / ice / storm | `fire` / `ice` / `lightning` |

The cache key hashes DNA **and the entire generation config**, prompt version, image model, ultra mode, polycount, PBR. Keying on DNA alone is the classic trap: you edit the prompt compiler, regenerate, receive the previously cached sword, and lose an afternoon to it.

---

## What a run looks like

Pick an affinity, it themes the entire arena, so an ember run and a frost run
do not read as the same footage twice. Then pick your quarry from the boss
ladder. There is deliberately **no difficulty slider**: both would scale the
same numbers, but only the ladder changes `bossInfluence`, which flows into the
concept prompt. Level 2 does not just hit harder, it forges a weapon grown from
salt and drowned bone instead of ash and molten rock.

You arrive holding a plain iron arming sword, mass-produced, one of eleven
million, and exactly the thing the relic exists to replace. Hold **TAB** for the
loadout and the second slot reads `??????`, because that weapon does not exist
yet and cannot be looked up. It will be generated from the fight you are
currently having.

Bosses and champions are Meshy-generated too, but **ahead of time**, by scripts
in `apps/api/scripts/`, and they ship as assets. Only the weapon is generated
while you play. The distinction matters: the runtime claim belongs to the relic
alone, and everything else is Meshy used the ordinary way, as a content tool.

They are also **rigged**, which is where the 5-credit rigging endpoint earns its
place: it ships walking and running clips free, and that is the difference
between a boss sliding across the floor and one that walks at you. Meshy
recommends t-pose input and these were generated in a-pose, so one character was
rigged first as a 5-credit test rather than regenerating the whole cast in t-pose
for roughly 350. It worked on the first attempt.

Only the walking clip is loaded; running is the same skeleton faster, so
`timeScale` covers it instead of downloading a second six-megabyte file. Rigged
output gets a **texture-only** optimizer, because the standard weld/dedup/prune
pass is exactly the surgery that breaks skin weights and animation channels.
That took 24 rigged files from 150 MB to 37 MB without touching a vertex.

Three levels of degradation, because a fight must never depend on an asset being
present: the rigged walk if it exists, the static mesh if only that does, and a
primitive fallback underneath. Approach, telegraph and strike stay whole-body
transforms in all three, so behaviour never changes with the asset.

## How you play

Most players assume loot comes from a table, so nothing about a boss fight signals that *how* you fight is the input. RelicForge says it once before the fight, then proves it during:

- A **briefing** states the premise and lists the controls (WASD, mouse, LMB light, RMB heavy, Space dodge, Q heal). It also gives pointer lock something to attach to, so the first click is explained rather than mysterious.
- A **live relic panel** in the corner runs the real `buildRelicDNA` against your telemetry as you fight. Commit to heavy attacks and `BALANCED` becomes `BRUTAL` in front of you. Drop below 20% health and `battle-worn` becomes `shattered`.

That panel is the tutorial. Watching the projection change is more convincing than any amount of explanation, and it means the reveal at the end confirms something the player already worked out.

Impact arrives on four channels at once, because any one alone reads as weak: a
floating damage number, a boss that staggers and is knocked back, camera shake,
and hitstop that freezes the shake decay for a few frames so a heavy hit lands
with weight. Armoured gauntlets hold the blade in view, first person is a scope
decision, but a floating camera with no arms is not embodiment.

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

Sound is synthesized at runtime with the Web Audio API, oscillators and filtered noise rather than sample files, so the repo carries no binary audio assets and no licensing questions.

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
- **Concept selection is a composition heuristic**, not a quality judgment, it rejects off-centre and small-in-frame subjects, nothing subtler.
- **The client bundle is ~1.5 MB (430 KB gzipped)**, dominated by three.js. The dev surfaces are code-split; the engine itself is on the critical path.
- **No deploy config ships.** Fastify serves the built client in production, so it runs as one process on one origin, but nothing here has been deployed or containerised and I would not claim otherwise.
- **Losing forfeits the relic.** A weapon forged from a defeat would stop being a record of how you won.
- **Bosses do not animate.** They are static generated meshes moved as whole bodies. Meshy has rigging and animation endpoints; wiring them up is the obvious next step and is not done here.
- **The player has hands, not a body.** First person means no character model, which is a deliberate scope choice rather than an oversight.

## Where this goes

Once a game can generate assets from its own state, the same architecture covers one-of-one raid drops, tournament trophies, seasonal artifacts, guild monuments, and equipment that visibly evolves with the player who carries it.

The broader point: generative 3D can turn game state into **content**, not just help studios produce assets before launch.

---

*Built with the Meshy API. Remove Meshy and the central mechanic is gone, which is the whole idea.*
