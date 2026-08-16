# RelicForge

> **Every legendary is actually legendary.**

RelicForge is a game demo where *how* you defeat a boss determines the one-of-one
weapon that gets forged for you.

```
boss dies → read the fight → Relic DNA → concept image → meshy-7 → GLB → equipped in-game
```

Two players beat the same boss and hold physically different weapons, because
they fought differently.

**The criterion that outranks all others:** remove Meshy from the architecture
and the central mechanic is gone.

**The technical thesis:** the hard part is not calling an API. It is turning
generated geometry, which varies, into reliable runtime game content,
automatically, with no manual 3D cleanup.

---

## 1. API facts this is built on

- `ai_model: "meshy-7"` is accepted on Image to 3D, Multi-Image to 3D and Retexture.
- Text to 3D (v2) rejects meshy-7. Its enum is `[meshy-4, meshy-5, meshy-6, latest]`,
  and there is no v1 or v3 route. This is why the hero path is text-to-image then
  image-to-3d rather than text-to-3d.
- `ultra_mode` is a real boolean on `CreateImageTo3DRequest`, meshy-7 and `latest` only.
- `target_formats: ["glb"]` is always set. Requesting fewer formats reduces task time.
- `target_polycount` accepts 100 to 15,000 and defaults to 4,000. It only applies
  when `should_remesh` is also true, which defaults to false.
- `symmetry_mode` is deprecated and does not affect output.
- `input_task_id` lets image-to-3d consume a completed text-to-image task directly,
  so the concept image never needs public hosting.
- Per-task SSE exists at `/v1/{text-to-image,image-to-3d}/:id/stream`. The backend
  subscribes to it and re-emits domain events, so there is no webhook receiver and
  no public tunnel for local development.

### Credit cost

| Operation | Credits |
|---|---|
| Text to Image (nano-banana) | 3 |
| Text to Image (nano-banana-2 / pro) | 6 / 9 |
| Image to 3D, meshy-7, textured | 30 |
| Image to 3D, meshy-7, textured + ultra | 35 |
| Image to 3D, meshy-t2 smart-topology, textured | 15 |
| Retexture | 10 |
| Rigging (includes walking and running clips) | 5 |

A full hero relic costs 35 to 44 credits.

**Spend policy.** Prompt iteration uses nano-banana at 3. Geometry debugging uses
`meshy-t2` with smart topology at 15. meshy-7 with `ultra_mode` is reserved for
output that appears on screen.

---

## 2. Normalization

A gorgeous sword returned sideways, off-origin, or gripped at the blade makes the
forge-to-equip moment read as broken. This risk outranks latency, so it was
settled before anything else was built.

### Pipeline

```
Generated GLB
  ↓ merge all mesh nodes into one geometry, in world space
  ↓ PCA on triangle centroids, weighted by triangle area
  ↓ principal axis → canonical +Y
  ↓ resolve tip/pommel via cross-section radius profile
  ↓ normalize total length per weapon class
  ↓ infer grip point
  ↓ apply socket transform
  ↓ persist correction transform alongside the relic
```

### Why area-weighted PCA, not AABB, not vertex PCA

**AABB fails on tilt.** A sword lying 35 degrees off-axis inside its own local
coordinates has no dominant X/Y/Z extent, so largest-extent heuristics pick the
wrong axis.

**Vertex PCA fails on density.** Tessellation is uneven, and an ornate pommel
carrying three times the vertices of the blade drags the principal axis off the
weapon line. Weighting triangle centroids by triangle area is density-invariant
and costs about ten lines of code.

### Tip and pommel disambiguation

Orientation is measured, never assumed:

1. Project all vertices onto the principal axis and slice into 64 bins.
2. Per bin, compute mean radial distance from the axis, giving a radius profile.
3. **Tip** is the end whose terminal bins taper toward zero.
4. **Guard** is a sharp local maximum near the opposite end.
5. **Grip** sits just inboard of the guard peak.
6. **Fallback** when no clear peak exists (warhammers, spears, staves): 15 percent
   up from the pommel end.

### Per-class canonical lengths

```ts
const CANONICAL_LENGTH = {
  greatsword: 1.8,
  spear:      2.2,
  warhammer:  1.5,
} as const; // world units, longest dimension after alignment
```

### What the measurement showed

Twelve shapes, chosen to be awkward on purpose, measured for raw angular error
before any correction:

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

Median raw angle is 0.9 degrees, because every concept is generated under a fixed
composition contract and image-to-3d preserves that framing. But the dagger
arrives 26 degrees off and the ornate longsword 50 degrees off. On those two the
PCA is the only reason they end up upright, so two of eight core shapes need real
correction and the normalizer is load-bearing rather than decorative.

### Guarantees

- Deterministic: the same GLB in produces an identical transform out, every run.
- Normalization costs under 100ms for a 15k-poly mesh.
- The correction transform serializes and reloads without drift.

### Orientation hints

Hand-editing a GLB in Blender is never acceptable, because it contradicts the
thesis that generated geometry becomes runtime content automatically. A persisted
override is acceptable, because an automatic pipeline with a structured
human-in-the-loop override is what every real content pipeline has.

```ts
interface OrientationHint {
  axisOverride?: [number, number, number]; // null = use PCA result
  flip?: boolean;                          // tip/pommel swap
  gripT?: number;                          // 0..1 along axis, overrides profile inference
}
```

Hints default to null, are authored in seconds via `/lab`, and override only the
corresponding auto-derived value. **No shipped relic currently uses one.**

**Two weapon classes ship:** greatsword and spear. Warhammer is implemented and
sits in the test corpus, but its end-resolution confidence is 0.09, so it stays
behind a flag.

---

## 3. Concept image composition contract

The concept image is the only control over output geometry orientation, so it is
locked in the prompt compiler rather than authored per relic:

- single isolated weapon, full object visible
- vertical, tip up, pommel down
- three-quarter view, centered composition
- neutral background, no character, no hands, no environment
- no text, no lettering, no captions
- strong readable silhouette, production-quality game concept art

The no-text clauses exist because an early concept rendered `ASHEN WARDEN` across
the image in large lettering, which then becomes real geometry and real texture in
the 3D model.

This contract is also a user-facing feature. The concept image is revealed during
the forge sequence rather than hidden as an implementation detail.

---

## 4. Relic DNA

```ts
interface CombatTelemetry {
  affinity: "fire" | "ice" | "storm";
  damageDealt: number;
  damageTaken: number;
  finishingAttack: "light" | "heavy" | "ability";
  healthRemaining: number;   // percent
  dodges: number;
  healingUsed: number;
  fightDuration: number;     // seconds
}

interface RelicDNA {
  weaponClass: "greatsword" | "spear" | "warhammer";
  element: "fire" | "ice" | "lightning";
  temperament: "brutal" | "balanced" | "elegant";
  condition: "pristine" | "battle-worn" | "shattered";
  bossInfluence: string;
  achievement?: string;
  rarity: "legendary";
}
```

Mapping is deterministic, because the causal link has to be legible to the player.
Randomness here would turn the mechanic into a slot machine wearing a story.

| Signal | Range | Result |
|---|---|---|
| Health remaining | 0 to 20% | `shattered`, cracked, desperate |
| | 21 to 70% | `battle-worn` |
| | 71 to 100% | `pristine`, refined |
| Heavy-attack ratio | 0.6 and above | `brutal`, oversized, thick silhouette |
| Dodges 4+, heavy ratio 0.35 or below | | `elegant`, narrow, sharp silhouette |
| Affinity fire | | molten, scorched, volcanic |
| Affinity ice | | crystalline, frost, translucent |
| Affinity storm | | conductive, fractured, electrical |

Naming uses deterministic templates (Stormfang, Ashen Oath, Winter's Judgment).

---

## 5. Cache key

```ts
hash({
  dna,
  promptVersion: PROMPT_VERSION,
  imageModel,
  meshyModel: "meshy-7",
  ultraMode,
  targetPolycount,
  enablePbr,
})
```

The key hashes the DNA **and the entire generation config**. Keying on DNA alone
is the classic trap: you edit the prompt compiler, regenerate, receive the
previously cached sword, and lose an afternoon to it. `PROMPT_VERSION` is a bumped
constant in `relic-core`, so changing it invalidates every cached relic
automatically.

Two levels: in-memory for the dev loop, and a persistent JSON index keyed by the
hash above. Live generation always stays functional while known DNA resolves
instantly.

---

## 6. Generation state machine

```
FIGHTING → VICTORY → ANALYZING → DNA_READY → GENERATING_CONCEPT
  → CONCEPT_READY → FORGING_3D → MODEL_READY → REVEAL → EQUIPPED
```

An explicit machine rather than boolean soup, because a cinematic sequence is far
easier to make reliable when each stage is a named state.

**Failure handling.** The experience never breaks. It shows `THE FORGE RESISTS…`,
retries, then falls back to a cached relic of the same archetype. A raw
`500 Internal Server Error` never appears inside the cinematic, only in debug mode.

---

## 7. Latency

| stage | time |
|---|---|
| concept (nano-banana-pro) | 17 to 20 s |
| mesh (meshy-7 + ultra) | 86 to 115 s |
| optimize | ~500 ms |
| **total, live** | **~100 to 135 s** |
| **total, cached** | **33 ms** |

The forge sequence holds that latency with named stages (`TEMPERING…`, `SHAPING…`,
`BINDING…`, `AWAKENING…`) driven by real task progress, and reveals the concept
image early as a payoff in its own right. `Loading 47%` makes waiting feel like a
defect. Naming the work makes it feel like a forge.

---

## 8. API shape

The frontend never learns Meshy's endpoint structure.

```
POST /api/relics              → { relicId, name, dna, status }
GET  /api/relics/:id
GET  /api/relics/:id/status
GET  /api/relics/:id/events   → SSE
POST /api/relics/:id/retry
GET  /api/debug/relics        → prompts, task ids, timings, cache hits
```

SSE events: `dna.ready`, `concept.generating`, `concept.ready`, `mesh.generating`,
`mesh.progress`, `mesh.ready`, `relic.complete`, `relic.failed`.

There is no inbound route from Meshy. The backend consumes per-task SSE and
re-emits domain events on `/api/relics/:id/events`.

The Meshy API key lives on the backend only, never in the browser.

---

## 9. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict |
| Frontend | React + Vite |
| 3D | React Three Fiber + Three.js |
| Helpers | @react-three/drei |
| Postprocessing | @react-three/postprocessing (bloom, vignette, restrained) |
| Physics | none, distance and radius checks in `useFrame` |
| State | Zustand |
| UI | Tailwind + Framer Motion |
| Audio | Web Audio API, synthesized at runtime, no sample files |
| Backend | Node + Fastify + Pino |
| Validation | Zod (telemetry, DNA, API I/O, Meshy responses, env) |
| Cache | JSON index |
| Storage | Backend static dir |
| Updates | Meshy per-task SSE, re-emitted as domain SSE |
| Tests | Vitest, 205 tests |
| Package manager | pnpm workspaces |

**Not used:** Rapier, R2, Drizzle, Mixamo, Redux, component libraries, an MCP
server as a runtime dependency.

### View

Third person is the default, showing a rigged champion swinging the real
generated weapon, because choosing a champion and never seeing it makes the choice
pointless. **V** switches to first person, where armoured gauntlets hold the blade
in view and the relic occupies a large share of the frame.

### Repo layout

```
relic-forge/
├── apps/
│   ├── web/          # game, forge, lab. Never sees Meshy.
│   └── api/          # fastify, meshy services, generation, cache
├── packages/
│   └── relic-core/   # dna.ts, prompt.ts, normalize.ts, cacheKey.ts, types.ts
├── pnpm-workspace.yaml
└── README.md
```

Meshy access is confined to `apps/api/src/services/meshy/`. No stray
`fetch("https://api.meshy...")` exists anywhere else.

`relic-core` is pure with no I/O, which is what lets the normalizer be unit-tested
in Node against synthetic geometry and also run in the browser at equip time. One
implementation, one test suite, two runtimes.

---

## 10. Generated content

Only the weapon is generated while you play. Bosses and champions are also
Meshy-generated, but ahead of time by scripts in `apps/api/scripts/`, and they
ship as assets. The runtime claim belongs to the relic alone.

Characters are rigged through the rigging endpoint, which ships walking and
running clips for 5 credits. Meshy recommends t-pose input and these were
generated in a-pose, so one character was rigged as a test rather than
regenerating the whole cast in t-pose for roughly 350 credits. It worked on the
first attempt.

Only the walking clip is loaded. Running is the same skeleton faster, so
`timeScale` covers it instead of downloading a second six-megabyte file.

Rigged output gets a texture-only optimizer, because the standard
weld/dedup/prune pass is exactly the surgery that breaks skin weights and
animation channels. That took 24 rigged files from 150 MB to 37 MB without
touching a vertex.

Three levels of degradation, because a fight must never depend on an asset being
present: the rigged walk if it exists, the static mesh if only that does, and a
primitive fallback underneath. Approach, telegraph and strike stay whole-body
transforms in all three, so behaviour never changes with the asset.

---

## 11. Definition of done

- A player fights, wins, and receives a visibly unique generated weapon derived
  from their gameplay, with no developer intervention.
- The GLB loads into the running game and is equipped with zero manual asset editing.
- The forge makes generation latency feel intentional.
- Two runs against the same boss produce clearly different relics.
- A game developer reads the repo and starts imagining it in their own game.

## 12. Out of scope

Multiplayer, open world, NPCs, procedural dungeons, marketplace, accounts,
trading, crafting trees, full inventory, runtime generation of anything but the
weapon, a Meshy runtime SDK, world transformation. Those are other projects.

Losing forfeits the relic, because a weapon forged from a defeat would stop being
a record of how you won.

## 13. Environment

```
MESHY_API_KEY=
PORT=8787
LOG_LEVEL=info
STORAGE_DIR=./storage
CACHE_DIR=./cache
CREDIT_FLOOR=100
CLIENT_ORIGIN=
```

`CREDIT_FLOOR` is a runaway-bug backstop rather than a budget. Generation refuses
below it, which catches retry loops. `CLIENT_ORIGIN` is only needed when the
client is hosted apart from this server; the single-origin deployment leaves it
empty because Fastify serves the built client itself.

Secrets are never committed. `.mcp.json` holds a live key in plaintext and is
gitignored.

---

**Governing rule:** sophisticated engineering underneath one simple product
story. Everything exists to serve fight, victory becomes DNA, a unique weapon is
forged, you wield it.
