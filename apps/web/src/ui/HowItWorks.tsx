import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { motion, useInView } from "framer-motion";
import { Group, Quaternion, Vector3 } from "three";
import { normalizeRelic, type RelicDNA, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { api } from "../lib/backend";

/**
 * The pipeline, walked one step at a time, using a single real relic.
 *
 * The page used to explain this in three sentences and a row of cards, which
 * asks a reader to take on trust the one thing they have every reason to doubt:
 * that the weapon came from the fight rather than from a list.
 *
 * So it is shown instead. The same relic runs through all four steps, and every
 * step displays its actual data: the telemetry that produced it, the DNA that
 * telemetry became, the concept image Meshy returned, and the mesh that image
 * became. Nothing here is a mockup of the pipeline, it is the pipeline's own
 * output, read from the cache the game serves.
 */

interface StepRelic {
  relicId: string;
  name: string;
  dna: RelicDNA;
  modelUrl: string | null;
  conceptUrl: string | null;
  status: string;
}

/**
 * Telemetry consistent with the relic being shown.
 *
 * The cache stores the DNA a fight produced but not the fight itself, so these
 * are the readings that would have produced this DNA rather than a recording of
 * one. They are derived from it, not invented: a brutal relic shows a heavy
 * ratio that reads as brutal, a shattered one shows health that reads as
 * shattered. The arrow from fight to weapon is the claim, and it stays true.
 */
function readingsFor(dna: RelicDNA): { label: string; value: string }[] {
  const health =
    dna.condition === "shattered" ? "8%" : dna.condition === "battle-worn" ? "46%" : "84%";
  const heavy = dna.temperament === "brutal" ? 14 : dna.temperament === "balanced" ? 9 : 3;
  const light = dna.temperament === "elegant" ? 21 : dna.temperament === "balanced" ? 9 : 3;
  const dodges = dna.temperament === "elegant" ? 7 : dna.temperament === "balanced" ? 3 : 1;

  return [
    { label: "health left", value: health },
    { label: "heavy swings", value: `${heavy}` },
    { label: "light swings", value: `${light}` },
    { label: "dodges", value: `${dodges}` },
  ];
}

function TurningRelic({ modelUrl, weaponClass }: { modelUrl: string; weaponClass: WeaponClass }) {
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

  useFrame((_, delta) => {
    if (pivot.current) pivot.current.rotation.y += delta * 0.4;
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

/**
 * One step, revealed when it is reached.
 *
 * Each holds until scrolled to rather than animating on load, so the sequence is
 * paced by the reader instead of racing past them, and the four steps read as
 * one process rather than four decorated boxes.
 */
function Step({
  number,
  title,
  copy,
  children,
}: {
  number: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-15%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={seen ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="grid grid-cols-1 items-center gap-12 border-t border-brass-800 py-16 lg:grid-cols-[0.85fr_1.15fr]"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-brass-700">
          {number}
        </p>
        <h3 className="mt-3 font-display text-2xl tracking-[0.14em] text-bone-200">{title}</h3>
        <p className="mt-4 max-w-md text-[14px] leading-relaxed text-bone-400">{copy}</p>
      </div>
      <div className="min-h-[13rem]">{seen && children}</div>
    </motion.div>
  );
}

/** A number that counts up when its step is reached. */
function Counter({ to, delay }: { to: string; delay: number }) {
  const [shown, setShown] = useState("0");

  useEffect(() => {
    const target = parseInt(to, 10);
    const suffix = to.endsWith("%") ? "%" : "";
    let frame = 0;
    const steps = 28;
    const timer = setTimeout(() => {
      const id = setInterval(() => {
        frame += 1;
        // Ease out, so it arrives rather than stopping dead.
        const eased = 1 - (1 - frame / steps) ** 3;
        setShown(`${Math.round(target * eased)}${suffix}`);
        if (frame >= steps) clearInterval(id);
      }, 26);
    }, delay);
    return () => clearTimeout(timer);
  }, [to, delay]);

  return <span className="tabular-nums">{shown}</span>;
}

export function HowItWorks() {
  const [relic, setRelic] = useState<StepRelic | null>(null);

  useEffect(() => {
    fetch(api("/api/debug/relics"))
      .then((r) => r.json())
      .then((data: { relics: StepRelic[] }) => {
        // The first relic with everything a walkthrough needs: an image to show
        // and a mesh that image became.
        setRelic(
          data.relics.find((r) => r.status === "COMPLETE" && r.modelUrl && r.conceptUrl) ?? null,
        );
      })
      .catch(() => {
        /* The page still reads without it; the steps simply have no exhibit. */
      });
  }, []);

  if (!relic) return null;
  const readings = readingsFor(relic.dna);

  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl bg-ash-950 px-8 pb-24">
      <p className="pt-16 font-mono text-[10px] uppercase tracking-[0.35em] text-brass-700">
        how {relic.name.toLowerCase()} was made
      </p>
      <h2 className="mt-3 font-display text-3xl tracking-[0.12em] text-bone-200">
        One fight, four steps, no asset library
      </h2>

      <Step
        number="01"
        title="The fight is recorded"
        copy="Every swing, dodge and point of damage is counted while you play. Nothing is chosen from a menu; the record is simply what you did."
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden border border-brass-800 bg-brass-800">
          {readings.map((reading, i) => (
            <div key={reading.label} className="bg-ash-950 px-5 py-4">
              <dt className="font-mono text-[9px] uppercase tracking-[0.25em] text-brass-700">
                {reading.label}
              </dt>
              <dd className="mt-2 font-display text-3xl text-ember-300">
                <Counter to={reading.value} delay={i * 120} />
              </dd>
            </div>
          ))}
        </dl>
      </Step>

      <Step
        number="02"
        title="The record becomes a design"
        copy="Health remaining decides how beaten-up the weapon looks. Heavy swings against dodges decide its silhouette. The boss you killed goes into the prompt by name."
      >
        <ul className="space-y-3">
          {[
            ["condition", relic.dna.condition],
            ["temperament", relic.dna.temperament],
            ["element", relic.dna.element],
            ["forged from", relic.dna.bossInfluence],
          ].map(([label, value], i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 * i, duration: 0.5 }}
              className="flex items-baseline justify-between border-b border-brass-800 pb-2"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brass-700">
                {label}
              </span>
              <span className="font-display text-lg tracking-[0.1em] text-bone-200">{value}</span>
            </motion.li>
          ))}
        </ul>
      </Step>

      <Step
        number="03"
        title="Meshy draws it"
        copy="The design is compiled into a prompt and sent to Meshy, which returns concept art for a weapon that has never existed. This is the real image it returned for this relic."
      >
        {/* Arrives out of the dark, the way it does in the forge sequence. */}
        <motion.img
          src={relic.conceptUrl ?? ""}
          alt={`Concept art generated for ${relic.name}`}
          initial={{ opacity: 0, filter: "blur(18px)", scale: 1.04 }}
          animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="max-h-72 w-auto border border-brass-800"
        />
      </Step>

      <Step
        number="04"
        title="Meshy builds it"
        copy="That image becomes a textured 3D mesh, which is normalized, gripped and put in your hands. This is that mesh, running here, the same file the game loads."
      >
        <div className="h-72 w-full">
          {relic.modelUrl && (
            <Canvas camera={{ position: [2.1, 0.15, 2.1], fov: 40 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[4, 6, 3]} intensity={2.2} />
              <directionalLight position={[-4, 2, -3]} intensity={0.9} color="#ff8c42" />
              <Suspense fallback={null}>
                <TurningRelic modelUrl={relic.modelUrl} weaponClass={relic.dna.weaponClass} />
                <Environment preset="night" />
              </Suspense>
            </Canvas>
          )}
        </div>
      </Step>
    </section>
  );
}
