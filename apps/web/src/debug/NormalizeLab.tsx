import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Quaternion, Vector3, type Group } from "three";
import { normalizeRelic, type RelicTransform, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";

/**
 * Gate 0 harness.
 *
 * Shows each spike GLB after canonicalization, standing on a reference socket.
 * The raw-angle column is the number the gate turns on: a small median means
 * Meshy preserves the concept framing and the expensive orientation problem
 * never existed. The confidence column shows where the tip/pommel heuristic is
 * guessing rather than knowing.
 */

interface SpikeMeta {
  slug: string;
  corpus: "core" | "stress";
  why: string;
  glbBytes?: number;
  error?: string;
}

const CLASS_OF: Record<string, WeaponClass> = {
  greatsword: "greatsword",
  "ornate-longsword": "greatsword",
  "curved-saber": "greatsword",
  "crystal-shard-blade": "greatsword",
  dagger: "greatsword",
  spear: "spear",
  glaive: "spear",
  "ringed-staff": "spear",
  warhammer: "warhammer",
  "asymmetric-axe": "warhammer",
  "twin-maul": "warhammer",
  "chained-flail": "warhammer",
};

function NormalizedRelic({
  slug,
  onMeasure,
}: {
  slug: string;
  onMeasure: (t: RelicTransform, ms: number) => void;
}) {
  const { scene } = useGLTF(`/assets/spike/${slug}/model.glb`);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  const transform = useMemo(() => {
    const t0 = performance.now();
    const sample = meshSampleFrom(cloned);
    const tr = normalizeRelic(sample, CLASS_OF[slug] ?? "greatsword");
    return { tr, ms: performance.now() - t0 };
  }, [cloned, slug]);

  useEffect(() => {
    onMeasure(transform.tr, transform.ms);
  }, [transform, onMeasure]);

  const quaternion = useMemo(() => {
    const [x, y, z, w] = transform.tr.quaternion;
    return new Quaternion(x, y, z, w);
  }, [transform]);

  const gripOffset = useMemo(
    () => new Vector3(...transform.tr.gripOffset),
    [transform],
  );

  return (
    <group>
      {/* Socket marker, where a hand would be. The weapon should meet it at the grip. */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#ff6b1a" />
      </mesh>

      <group position={gripOffset}>
        <group quaternion={quaternion} scale={transform.tr.scale}>
          <primitive object={cloned as Group} />
        </group>
      </group>
    </group>
  );
}

function SpikeCell({ meta }: { meta: SpikeMeta }) {
  const [result, setResult] = useState<{ t: RelicTransform; ms: number } | null>(null);
  const onMeasure = useMemo(
    () => (t: RelicTransform, ms: number) => setResult({ t, ms }),
    [],
  );

  const conf = result?.t.endConfidence ?? 0;
  const confClass =
    conf > 0.8 ? "text-emerald-400" : conf >= 0.4 ? "text-amber-400" : "text-red-400";

  return (
    <div className="rounded border border-ash-700 bg-ash-900">
      <div className="flex items-baseline justify-between border-b border-ash-700 px-3 py-2">
        <span className="font-mono text-xs uppercase tracking-widest text-stone-300">
          {meta.slug}
        </span>
        <span
          className={
            meta.corpus === "core"
              ? "rounded bg-ember-500/15 px-1.5 py-0.5 text-[10px] uppercase text-ember-300"
              : "rounded bg-stone-700/40 px-1.5 py-0.5 text-[10px] uppercase text-stone-400"
          }
        >
          {meta.corpus}
        </span>
      </div>

      <div className="h-72 bg-ash-950">
        <Canvas camera={{ position: [2.2, 1.0, 2.2], fov: 45 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 3]} intensity={1.8} />
          <Suspense fallback={null}>
            <NormalizedRelic slug={meta.slug} onMeasure={onMeasure} />
            <Environment preset="city" />
          </Suspense>
          <Grid
            args={[8, 8]}
            cellColor="#2a2622"
            sectionColor="#3a3430"
            fadeDistance={14}
          />
          <OrbitControls makeDefault target={[0, 0.8, 0]} />
        </Canvas>
      </div>

      <dl className="grid grid-cols-4 gap-x-2 px-3 py-2 text-center font-mono text-[11px]">
        <div>
          <dt className="text-stone-600">raw</dt>
          <dd className={result && result.t.rawAngleDeg > 15 ? "text-ember-400" : "text-stone-300"}>
            {result ? `${result.t.rawAngleDeg.toFixed(1)}°` : "…"}
          </dd>
        </div>
        <div>
          <dt className="text-stone-600">conf</dt>
          <dd className={confClass}>{result ? conf.toFixed(2) : "…"}</dd>
        </div>
        <div>
          <dt className="text-stone-600">grip</dt>
          <dd className="text-stone-300">{result ? result.t.gripT.toFixed(2) : "…"}</dd>
        </div>
        <div>
          <dt className="text-stone-600">ms</dt>
          <dd className="text-stone-300">{result ? result.ms.toFixed(0) : "…"}</dd>
        </div>
      </dl>

      <p className="border-t border-ash-700 px-3 py-2 text-[11px] italic text-stone-600">
        {meta.why}
        {meta.glbBytes ? ` · ${(meta.glbBytes / 1048576).toFixed(2)} MB` : ""}
      </p>
    </div>
  );
}

export default function NormalizeLab() {
  const [spikes, setSpikes] = useState<SpikeMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const found: SpikeMeta[] = [];
      for (const wave of [0, 1, 2]) {
        try {
          const res = await fetch(`/assets/spike/wave-${wave}.json`);
          if (!res.ok) continue;
          const data = (await res.json()) as { results: SpikeMeta[] };
          found.push(...data.results.filter((r) => !r.error));
        } catch {
          /* wave not generated yet */
        }
      }
      if (found.length === 0) setError("No spike output found. Run: pnpm spike -- --wave 0");
      setSpikes(found);
    })().catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-ash-950 p-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl tracking-[0.2em] text-ember-400">NORMALIZE LAB</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-stone-500">
          Each weapon is canonicalized by <code className="text-stone-400">normalizeRelic()</code> -
          area-weighted PCA for the axis, radius profile for the grip, then mounted at the orange
          socket marker. <span className="text-stone-400">raw</span> is how crooked Meshy&apos;s
          output arrived before correction; <span className="text-stone-400">conf</span> is how far
          the tip/pommel heuristic can be trusted before it defers to the class prior.
        </p>
      </header>

      {error && (
        <p className="rounded border border-ash-700 bg-ash-900 p-4 text-sm text-stone-400">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {spikes.map((meta) => (
          <SpikeCell key={meta.slug} meta={meta} />
        ))}
      </div>
    </div>
  );
}
