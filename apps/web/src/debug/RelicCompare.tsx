import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import { normalizeRelic, type RelicDNA, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";

/**
 * The comparison the whole project argues for: two fights against the same
 * boss, two different objects.
 *
 * Silhouette mode is the honest test. If the relics only differ by colour, they
 * collapse into the same black shape and the claim is dead, so the toggle is
 * a check, not a gimmick.
 */

interface RelicSummary {
  relicId: string;
  name: string;
  dna: RelicDNA;
  modelUrl: string | null;
  conceptUrl: string | null;
  status: string;
}

/** The boss is named on each panel, since with a relic per boss it matters. */

function RelicModel({
  modelUrl,
  weaponClass,
  silhouette,
}: {
  modelUrl: string;
  weaponClass: WeaponClass;
  silhouette: boolean;
}) {
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => scene.clone(true), [scene]);

  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
  );

  useEffect(() => {
    model.traverse((child) => {
      const mesh = child as { material?: { color?: { set: (c: string) => void } } };
      if (silhouette && mesh.material?.color) mesh.material.color.set("#000000");
    });
  }, [model, silhouette]);

  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);

  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  return (
    <group position={[0, -0.6, 0]}>
      <group position={gripOffset}>
        <group quaternion={quaternion} scale={canonical.scale}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

function RelicPanel({ relic, silhouette }: { relic: RelicSummary; silhouette: boolean }) {
  return (
    <div className="flex flex-1 flex-col border border-ash-700 bg-ash-900">
      <div className="border-b border-ash-700 px-5 py-4">
        <h2 className="font-display text-2xl tracking-[0.15em] text-ember-300">
          {relic.name.toUpperCase()}
        </h2>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
          legendary {relic.dna.weaponClass} · from {relic.dna.bossInfluence}
        </p>
      </div>

      <div className={silhouette ? "h-[52vh] bg-white" : "h-[52vh] bg-ash-950"}>
        {relic.modelUrl && (
          <Canvas camera={{ position: [2.4, 0.4, 2.4], fov: 42 }}>
            {silhouette ? (
              <ambientLight intensity={0} />
            ) : (
              <>
                <ambientLight intensity={0.55} />
                <directionalLight position={[4, 6, 3]} intensity={2} />
              </>
            )}
            <Suspense fallback={null}>
              <RelicModel
                modelUrl={relic.modelUrl}
                weaponClass={relic.dna.weaponClass}
                silhouette={silhouette}
              />
              {!silhouette && <Environment preset="city" />}
            </Suspense>
            <OrbitControls makeDefault autoRotate autoRotateSpeed={0.8} target={[0, 0.35, 0]} />
          </Canvas>
        )}
      </div>

      <dl className="grid grid-cols-4 gap-2 px-5 py-4 text-center font-mono text-[10px] uppercase tracking-widest">
        {[
          ["element", relic.dna.element],
          ["style", relic.dna.temperament],
          ["state", relic.dna.condition],
          ["class", relic.dna.weaponClass],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-stone-700">{k}</dt>
            <dd className="mt-1 text-stone-300">{v}</dd>
          </div>
        ))}
      </dl>

      {relic.dna.achievement && (
        <p className="px-5 pb-4">
          <span className="border border-ember-500/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-ember-400">
            {relic.dna.achievement}
          </span>
        </p>
      )}
    </div>
  );
}

export default function RelicCompare() {
  const [all, setAll] = useState<RelicSummary[]>([]);
  const [picked, setPicked] = useState<[string | null, string | null]>([null, null]);
  const [silhouette, setSilhouette] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/debug/relics")
      .then((r) => r.json())
      .then((data: { relics: RelicSummary[] }) => {
        const complete = data.relics.filter((r) => r.status === "COMPLETE" && r.modelUrl);
        if (complete.length < 2) setError("Need at least two completed relics to compare.");
        setAll(complete);
        // Defaults to the first two so the page is useful immediately, but with
        // a relic for every boss and playstyle the pairing has to be choosable:
        // this is the view the comparison shot is produced from.
        setPicked([complete[0]?.relicId ?? null, complete[1]?.relicId ?? null]);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const relics = picked
    .map((id) => all.find((r) => r.relicId === id))
    .filter((r): r is RelicSummary => Boolean(r));

  const setSlot = (slot: 0 | 1, relicId: string) =>
    setPicked((current) => {
      const next: [string | null, string | null] = [...current];
      next[slot] = relicId;
      return next;
    });

  return (
    <div className="h-full overflow-y-auto bg-ash-950 p-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-[0.2em] text-stone-300">
            SAME BOSS. DIFFERENT STORY. DIFFERENT RELIC.
          </h1>
          <p className="mt-1 text-xs text-stone-600">
            Both weapons came from the Ashen Warden. Only the fights differed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSilhouette((s) => !s)}
          className="border border-ash-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400 transition hover:border-ember-500/60 hover:text-ember-300"
        >
          {silhouette ? "show materials" : "silhouette only"}
        </button>
      </header>

      {error && (
        <p className="rounded border border-ash-700 bg-ash-900 p-4 text-sm text-stone-400">
          {error}
        </p>
      )}

      {/* Pick the pairing. Two relics from the same boss isolates playstyle;
          two of the same playstyle across bosses isolates the boss. */}
      {all.length > 2 && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          {([0, 1] as const).map((slot) => (
            <select
              key={slot}
              value={picked[slot] ?? ""}
              onChange={(e) => setSlot(slot, e.target.value)}
              className="w-full border border-ash-700 bg-ash-900 px-3 py-2 font-mono text-[11px] text-stone-300"
            >
              {all.map((relic) => (
                <option key={relic.relicId} value={relic.relicId}>
                  {relic.name}, {relic.dna.element}/{relic.dna.temperament}/
                  {relic.dna.condition}, {relic.dna.bossInfluence}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {relics.map((relic, i) => (
          <RelicPanel key={`${relic.relicId}-${i}`} relic={relic} silhouette={silhouette} />
        ))}
      </div>

      {relics.length === 2 && relics[0]!.dna.bossInfluence === relics[1]!.dna.bossInfluence && (
        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
          same boss · only the fight differed
        </p>
      )}
    </div>
  );
}
