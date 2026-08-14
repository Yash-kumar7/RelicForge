# RelicForge — PRD v2

> **Every legendary is actually legendary.**

RelicForge is a game demo where *how* you defeat a boss determines the one-of-one legendary weapon Meshy-7 forges for you.

Traditional loot: `boss dies → loot table → legendary_sword_04.glb`
RelicForge: `boss dies → analyze victory → Relic DNA → concept image → Meshy-7 → GLB → equipped in-game`

Two players beat the same boss and hold physically different weapons, because they fought differently.

**Success criterion that outranks all others:** removing Meshy from the architecture destroys the central mechanic.

---

## 0. What changed from v1

| Area | v1 | v2 |
|---|---|---|
| Player view | Third-person humanoid | **First-person / over-shoulder** |
| Physics | Rapier | Distance/radius checks in `useFrame` |
| Storage | Cloudflare R2 | Backend static dir; R2 only if split deploy |
| DB | SQLite + Drizzle | JSON file cache; SQLite when schema settles |
| Meshy runtime | Generic wrapper / MCP | **Direct REST from Fastify**, no MCP dependency |
| Task updates | Polling | **Meshy webhook → our SSE** |
| First task | Boss/game shell | **GLB normalization spike (Gate 0)** |
| Weapon attach | Fixed per-class transform | Auto-orient + normalize + inferred grip |
| Cache key | DNA hash | DNA + prompt version + full generation config |
| Model usage | Meshy-7 everywhere | Cheap iteration; Meshy-7 Ultra for finalists |

**Revised technical thesis:** the hard part isn't calling Meshy. It's turning unpredictable generated geometry into reliable runtime game content, automatically, with no manual 3D cleanup.

---

## 1. Verified API facts (checked live, 2026-08-10)

Confirmed against the live API and current docs — not assumed:

- `ai_model: "meshy-7"` accepted on **Image to 3D**, **Multi-Image to 3D**, **Retexture**.
- **Text to 3D (v2) rejects meshy-7.** Enum is `[meshy-4, meshy-5, meshy-6, latest]`. There is no v1 or v3 text-to-3d route (404). This is why the hero path is text-to-image → image-to-3d.
- `ultra_mode` (boolean) — real field on `CreateImageTo3DRequest`, meshy-7 / `latest` only.
- `target_formats: ["glb"]` — docs state requesting fewer formats reduces task completion time. Always set it.
- `target_polycount` — 100 to 15,000, default 4,000.
- `symmetry_mode` — deprecated, no longer affects output. Do not use.
- Also available: `should_texture`, `enable_pbr`, `texture_prompt`, `texture_image_url`, `texture_resolution`.
- **Webhooks exist.** Prefer webhook → SSE over a polling loop.

### Credit budget

Balance at planning time: **8060**.

| Operation | Credits |
|---|---|
| Text to Image (nano-banana) | 3 |
| Text to Image (nano-banana-2 / pro) | 6 / 9 |
| Image to 3D — meshy-7, textured | 30 |
| Image to 3D — meshy-7, textured + ultra | 35 |
| Image to 3D — meshy-t2 smart-topology, textured | 15 |
| Retexture | 10 |

Full hero relic ≈ **35–44 credits** → roughly **180–230 complete runs** in budget.

**Spend policy:**
- Prompt/composition iteration → nano-banana (3).
- Geometry/normalization debugging → `topology: smart-topology`, `ai_model: meshy-t2` (15 textured).
- Meshy-7 + `ultra_mode` reserved for outputs that appear on screen.
- Gate 0 spike (5–10 concepts) budgeted at ~200–300 credits. Acceptable.

---

## 2. Gate 0 — Normalization spike (blocking)

**Nothing else gets built until this passes.** A gorgeous sword returned sideways, off-origin, or gripped at the blade makes the forge→equip moment read as broken. This risk outranks latency.

### Input

5–10 **deliberately varied** concepts, not one lucky sword: greatsword, spear, warhammer, curved blade, asymmetric axe, ornate pommel, thin dagger. Variety is the test.

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

- **AABB fails on tilt.** A sword lying 35° off-axis inside its own local coordinates has no dominant X/Y/Z extent — largest-extent heuristics pick the wrong axis.
- **Vertex PCA fails on density.** Meshy tessellates unevenly; an ornate pommel carrying 3× the vertices of the blade drags the principal axis off the weapon line. Weighting triangle centroids by triangle area is density-invariant and is ~10 lines of code.

### Tip/pommel disambiguation

Do not assume orientation. Measure it:

1. Project all vertices onto the principal axis, slice into ~64 bins.
2. Per bin, compute mean radial distance from the axis → a radius profile.
3. **Tip** = the end whose terminal bins taper toward ~0.
4. **Guard** = sharp local maximum in the radius profile near the opposite end.
5. **Grip** = just inboard of the guard peak.
6. **Fallback** when no clear peak (warhammers, spears, staves): 15% up from the pommel end.

### Per-class canonical lengths

```ts
const CANONICAL_LENGTH = {
  greatsword: 1.8,
  spear:      2.2,
  warhammer:  1.5,
} as const; // world units, longest dimension after alignment
```

### Measure this first, before writing any math

Image-to-3D tends to align output to the input view's framing. On the first 5 spikes, **log raw angular error between the principal axis and canonical +Y before any correction is applied.**

- Consistently under ~15° → the hard version of this problem does not exist. PCA is a small correction, not blind discovery. Stop optimizing and move to step 2.
- Wildly varying → the ladder below is live.

This measurement costs nothing and may delete the entire risk. Do it before anything else.

### Pass criteria (measurable, not vibes)

- ≥ 8 of 10 varied concepts auto-orient correctly with no per-asset intervention.
- Grip point within ~5% of visually correct along the weapon axis.
- Deterministic: same GLB in → identical transform out, every run.
- Total normalization cost < 100ms for a 15k-poly mesh.
- Correction transform serializes and reloads without drift.

### Fallback ladder — this is the landmine, so it gets an exit ramp

Auto-normalization is **not** a solved problem. Reliably answering "which way does this arbitrary generated weapon point, and where is the handle" across varied shapes is genuinely hard, and chasing a perfect solution can consume the entire timeline. It is not allowed to.

Descend this ladder on a clock. Each tier still ships a working demo.

| Tier | Approach | Trigger |
|---|---|---|
| 0 | Raw output already near-canonical; tiny correction only | Measured angular error < 15° |
| 1 | Area-weighted PCA + radius-profile grip inference | Default implementation |
| 2 | **Narrow the weapon classes** to long thin objects (greatsword, spear) where the principal axis is unambiguous | PCA unreliable on ≥3 of 10 |
| 3 | **Orientation hint** — per-relic override, authored in seconds via debug sliders, persisted on the relic record | Tier 2 still failing |

```ts
interface OrientationHint {
  axisOverride?: [number, number, number]; // null = use PCA result
  flip?: boolean;                          // tip/pommel swap
  gripT?: number;                          // 0..1 along axis, overrides profile inference
}
```

Default `null`. When present, it overrides the corresponding auto-derived value and nothing else.

**Warhammer is the hard case** — mass concentrated at one end, short shaft, weak axis dominance. If time is tight it drops to P1 and the demo ships greatsword + spear. Two contrasting relics is all the hero comparison needs.

### What the ladder does and does not cost

- **Hand-editing a GLB in Blender is never acceptable** — it contradicts the thesis that generated geometry becomes runtime content automatically.
- **A stored orientation hint is acceptable and honest.** The system is automatic with a human-in-the-loop override — which is what every real content pipeline has. The correction transform is already persisted per relic; Tier 3 only makes it writable. Document it plainly in the README; stating the limitation reads as engineering maturity, not as a gap.
- Hero relics are cached anyway, so a hint authored once on a hero relic costs nothing at demo time while the live path stays fully automatic.

**Hard timebox: if Tier 0/1 is not passing by end of day 1, drop to Tier 2 or 3 and move to step 2.** Perfect normalization does not ship the demo. A wielded relic does.

---

## 3. Concept image composition contract

The concept image is the *only* control over output geometry orientation. Lock it in the prompt compiler, not per-relic:

- single isolated weapon, full object visible
- vertical, tip up, pommel down
- 3/4 view, centered composition
- neutral background, no character, no hands, no environment
- strong readable silhouette, production-quality game concept art

This is also a user-facing feature — the concept image is revealed during the Forge sequence, not hidden as implementation detail.

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

### Mapping rules (deterministic — the causal link must be legible)

| Signal | Range | Result |
|---|---|---|
| Health remaining | 0–20% | `battle-worn`, cracked, desperate |
| | 21–70% | battle-tested |
| | 71–100% | `pristine`, refined |
| Heavy-attack usage high | — | `brutal`, oversized, thick silhouette |
| Dodge count high / precision | — | `elegant`, narrow, sharp silhouette |
| Affinity fire | — | molten, scorched, volcanic |
| Affinity ice | — | crystalline, frost, translucent |
| Affinity storm | — | conductive, fractured, electrical |

Naming: deterministic templates first (Stormfang, Ashen Oath, Winter's Judgment). LLM naming/lore is P1 and must never block generation.

---

## 5. Cache key — hash the whole generation config

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

Keying on DNA alone means editing the prompt compiler silently serves stale relics and you lose an afternoon wondering why nothing changed. `PROMPT_VERSION` is a bumped constant in `relic-core`.

Two levels: in-memory for the dev loop, persistent (JSON file → SQLite later) keyed by the hash above. Live generation always stays functional; known demo DNA resolves instantly. That's production architecture, not cheating.

---

## 6. Generation state machine

```
FIGHTING → VICTORY → ANALYZING → DNA_READY → GENERATING_CONCEPT
  → CONCEPT_READY → FORGING_3D → MODEL_READY → REVEAL → EQUIPPED
```

Explicit machine, not boolean soup. The cinematic sequence is far easier to make reliable when each stage is a named state.

**Failure handling:** the experience never breaks. Show `THE FORGE RESISTS…`, retry, then fall back to a cached relic of the same archetype. Raw `500 Internal Server Error` never appears inside the cinematic — debug mode only.

---

## 7. Latency posture

meshy-7 textured + ultra takes minutes, not seconds. The Forge sequence must hold 2–5 minutes of live generation without feeling broken — thematic stage copy (`TEMPERING…`, `SHAPING…`, `BINDING…`, `AWAKENING…`) driven by real webhook events where possible.

The ≤15s demo story is served by the cache. Both paths are real.

---

## 8. API shape

Frontend never learns Meshy's endpoint structure.

```
POST /api/relics              → { relicId, name, dna, status }
GET  /api/relics/:id
GET  /api/relics/:id/status
GET  /api/relics/:id/events   → SSE
POST /api/relics/:id/retry    (optional)
POST /api/webhooks/meshy      → Meshy webhook receiver, fans out to SSE
```

SSE events: `dna.ready`, `concept.generating`, `concept.ready`, `mesh.generating`, `mesh.progress`, `mesh.ready`, `relic.complete`, `relic.failed`.

Meshy API key lives on the backend only. Never in the browser.

---

## 9. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict |
| Frontend | React + Vite |
| 3D | React Three Fiber + Three.js |
| Helpers | @react-three/drei |
| Postprocessing | @react-three/postprocessing (bloom, vignette — restrained) |
| Physics | **none** — distance/radius checks in `useFrame` |
| State | Zustand (`useGameStore`, `useCombatStore`, `useForgeStore`) |
| UI | Tailwind + Framer Motion |
| Audio | Howler.js |
| Backend | Node + Fastify + Pino |
| Validation | Zod (telemetry, DNA, API I/O, Meshy responses, env) |
| Cache/DB | JSON file → SQLite + Drizzle if schema settles |
| Storage | Backend static dir → R2 only if split deploy |
| Updates | Meshy webhook → SSE |
| Tests | Vitest |
| Package manager | pnpm workspaces |

**Cut and staying cut:** Rapier, R2-on-day-one, Drizzle-on-day-one, Mixamo rigging, humanoid animation state machine, Redux, component libraries, MCP server as a runtime dependency.

First-person view is load-bearing: it removes rigging, hand/body animation, and most camera work at once — and puts the one-of-one relic across a large share of the frame, which is the shot that matters.

### Repo layout

```
relic-forge/
├── apps/
│   ├── web/     # game, forge, components
│   └── api/     # fastify, meshy services, generation, cache
├── packages/
│   └── relic-core/   # telemetry.ts, dna.ts, prompt.ts, normalize.ts, types.ts
├── pnpm-workspace.yaml
└── README.md
```

Meshy access is confined to `apps/api/src/services/meshy/` — `meshy.client.ts`, `meshy.image.ts`, `meshy.imageTo3d.ts`, `meshy.tasks.ts`, `meshy.types.ts`. No stray `fetch("https://api.meshy...")` anywhere else.

---

## 10. Build order

1. **Gate 0** — concept → Meshy-7 → GLB → R3F → automatic orientation/scale/grip, across 5–10 varied weapon shapes. Blocking.
2. **relic-core** — telemetry → DNA → prompt → generation config → versioned cache key. Pure functions, Vitest-covered.
3. **Generation backend** — Fastify → text-to-image → Meshy-7 → webhook → file cache → SSE.
4. **Thin game shell** — arena, boss HP, player HP, simple attacks, victory detection. Deliberately minimal; this is setup, not product.
5. **Forge sequence** — majority of visual polish lands here.
6. **Hero outputs** — two or three excellent contrasting relics, cached, then record.

On a **3-day clock**: day 1 is Gate 0 + relic-core (ladder-capped, no overtime on normalization), day 2 is backend + thin game shell with hero candidates generating in the background, day 3 is Forge polish + recording. The debug panel from step 1 doubles as the Tier 3 hint authoring UI — build it once, use it for both.

**Discipline rule:** start generating hero candidates the moment step 3 works. Meshy generation is external latency — burn it in parallel while building the arena and Forge, not serially at the end.

Steps 1–3 are the actual project. Step 4 is set dressing.

---

## 11. Definition of done

- A player fights, wins, and receives a visibly unique Meshy-generated weapon derived from their gameplay — no developer intervention.
- The meshy-7 GLB loads into the running game and is equipped with **zero manual asset editing**.
- The Forge makes generation latency feel intentional.
- Two runs against the same boss produce clearly different relics: `SAME BOSS. DIFFERENT STORY. DIFFERENT RELIC.`
- A game developer reads the repo and starts imagining it in their own game.

## 12. Explicitly out of scope

Multiplayer, open world, NPCs, procedural dungeons, marketplace, accounts, trading, crafting trees, full inventory, generated bosses, generated characters, a Meshy runtime SDK, world transformation. Those are other projects.

## 13. Environment

```
MESHY_API_KEY=
DATABASE_URL=
MESHY_WEBHOOK_SECRET=
# only if split deploy:
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
# P1, naming/lore only:
OPENAI_API_KEY=
```

Ship `.env.example`. Never commit secrets — note that `.mcp.json` currently holds a live key in plaintext and must be gitignored before `git init`.

---

**Governing rule:** sophisticated engineering underneath *one* simple product story. Everything exists to serve — fight → victory becomes DNA → Meshy-7 forges a unique weapon → wield it.
