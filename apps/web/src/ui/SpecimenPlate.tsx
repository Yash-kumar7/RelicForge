import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Quaternion, Vector3 } from "three";
import { normalizeRelic, type RelicDNA, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";

/**
 * The relic, presented as a catalogued specimen rather than as a hero image.
 *
 * A rotating weapon on a dark page is the shape every game landing takes, and
 * it argues nothing: a rendered sword looks the same whether it was generated
 * from a fight or exported from Blender in 2019. What is actually unusual here
 * is that the object is a *record*. Its silhouette, its material and its damage
 * each came from a specific thing the player did.
 *
 * So the page annotates it. Hairlines run from the mesh to the telemetry that
 * produced each property, the way an armoury plate or a forensic diagram ties a
 * claim to the evidence for it. Every label is live: read from a relic in the
 * same cache the game serves, canonicalized by the same normalizer.
 *
 * That is the one risk this page takes, and everything else is kept quiet so it
 * lands.
 */

interface ShowcaseRelic {
  relicId: string;
  name: string;
  dna: RelicDNA;
  modelUrl: string | null;
  status: string;
}

/** What each DNA field records about the fight, in the player's words. */
const READING: Record<string, Record<string, string>> = {
  condition: {
    pristine: "finished almost untouched",
    "battle-worn": "took real damage and held",
    shattered: "survived on a sliver of health",
  },
  temperament: {
    brutal: "committed to heavy swings",
    balanced: "traded light and heavy",
    elegant: "dodged more than it struck",
  },
  element: {
    fire: "chose the ember affinity",
    ice: "chose the frost affinity",
    lightning: "chose the storm affinity",
  },
};

function SpinningRelic({ modelUrl, weaponClass }: { modelUrl: string; weaponClass: WeaponClass }) {
  const pivot = useRef<Group>(null);
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => scene.clone(true), [scene]);

  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
  );
  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);
  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  // Slow. A specimen is being examined, not shown off.
  useFrame((_, delta) => {
    if (pivot.current) pivot.current.rotation.y += delta * 0.28;
  });

  return (
    <group ref={pivot}>
      <group position={[0, -0.9, 0]}>
        <group position={gripOffset}>
          <group quaternion={quaternion} scale={canonical.scale}>
            <primitive object={model} />
          </group>
        </group>
      </group>
    </group>
  );
}

/** One line of the plate: a property, its value, and the fight that caused it. */
function Reading({ field, value, delay }: { field: string; value: string; delay: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.7, ease: "easeOut" }}
      className="relative pl-6"
    >
      {/* The hairline is the argument: this property is tied to that cause. */}
      <span className="absolute left-0 top-[0.6rem] h-px w-4 bg-brass-700" />
      <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
        {field}
      </span>
      <span className="mt-1 block font-display text-lg tracking-[0.12em] text-bone-200">
        {value}
      </span>
      <span className="mt-0.5 block font-mono text-[10px] leading-relaxed text-bone-400">
        {READING[field]?.[value] ?? "recorded during the fight"}
      </span>
    </motion.li>
  );
}

export function SpecimenPlate({ onEnter }: { onEnter: () => void }) {
  const [relics, setRelics] = useState<ShowcaseRelic[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/debug/relics")
      .then((r) => r.json())
      .then((data: { relics: ShowcaseRelic[] }) => {
        setRelics(data.relics.filter((r) => r.status === "COMPLETE" && r.modelUrl).slice(0, 5));
      })
      .catch(() => {
        /* The title screen must still work with the API down. */
      });
  }, []);

  // Long enough to read the plate before it changes. Seeing several distinct
  // weapons does the work that "one of one" cannot do in prose.
  useEffect(() => {
    if (relics.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % relics.length), 9000);
    return () => clearInterval(timer);
  }, [relics.length]);

  const current = relics[index];

  return (
    <section className="relative grid min-h-[100svh] w-full max-w-6xl grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      {/* Plate header. The number is the relic's real place in the archive, not
          a decorative counter. */}
      <div className="absolute left-8 right-8 top-8 flex items-baseline justify-between border-b border-brass-800 pb-3">
        <span className="font-display text-sm tracking-[0.4em] text-bone-200">RELICFORGE</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brass-700">
          {current ? `no.${String(index + 1).padStart(3, "0")} · ${current.dna.bossInfluence}` : "archive"}
        </span>
      </div>

      <div className="order-2 mt-6 lg:order-1 lg:mt-0">
        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              key={current.relicId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <ul className="space-y-6 border-l border-brass-800 pl-2">
                <Reading field="condition" value={current.dna.condition} delay={0.05} />
                <Reading field="temperament" value={current.dna.temperament} delay={0.15} />
                <Reading field="element" value={current.dna.element} delay={0.25} />
              </ul>

              <p className="mt-10 font-display text-4xl tracking-[0.14em] text-ember-400">
                {current.name.toUpperCase()}
              </p>
              <p className="mt-3 max-w-sm font-mono text-[11px] leading-relaxed text-bone-400">
                Generated by meshy-7 after the fight that produced it. No asset for this weapon
                existed before someone played.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onEnter}
          className="mt-10 border border-ember-500/60 px-12 py-4 font-mono text-[11px] uppercase tracking-[0.4em] text-ember-300 transition hover:bg-ember-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember-500"
        >
          Enter the forge
        </button>
      </div>

      {/* The specimen. */}
      <div className="order-1 h-[42svh] w-full lg:order-2 lg:h-[68svh]">
        {current?.modelUrl && (
          <Canvas camera={{ position: [2.4, 0.2, 2.4], fov: 42 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[4, 6, 3]} intensity={2.2} />
            <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#ff8c42" />
            <Suspense fallback={null}>
              <SpinningRelic modelUrl={current.modelUrl} weaponClass={current.dna.weaponClass} />
              <Environment preset="night" />
            </Suspense>
            <EffectComposer>
              <Bloom intensity={0.9} luminanceThreshold={0.7} luminanceSmoothing={0.3} mipmapBlur />
            </EffectComposer>
          </Canvas>
        )}
      </div>

      {relics.length > 1 && (
        <div className="absolute bottom-8 right-8 flex gap-1.5">
          {relics.map((relic, i) => (
            <button
              key={relic.relicId}
              type="button"
              aria-label={`Show ${relic.name}`}
              onClick={() => setIndex(i)}
              className={i === index ? "h-px w-8 bg-ember-500" : "h-px w-8 bg-brass-800"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
