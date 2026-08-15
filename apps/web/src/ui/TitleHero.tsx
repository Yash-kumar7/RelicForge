import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Quaternion, Vector3 } from "three";
import { normalizeRelic, type RelicDNA, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { BOSSES } from "../game/bosses";

/**
 * The title screen.
 *
 * Three layers, and the depth between them is the whole effect: a boss painting
 * pushed back into the dark, the relic itself in front of it in real 3D, and the
 * name of the game on top. Every layer is an asset this project generated, which
 * is the argument the page exists to make and the reason it is not stock art.
 *
 * An earlier version presented the relic as a catalogued specimen with the
 * telemetry annotated beside it. That reads as a museum label, and a museum
 * label is the wrong first impression for a game about killing something. The
 * annotation survives further down the page, where a reader who has already been
 * sold can find the evidence.
 */

interface ShowcaseRelic {
  relicId: string;
  name: string;
  dna: RelicDNA;
  modelUrl: string | null;
  status: string;
}

/** Slugified the same way the ladder does, so the art matches the boss named. */
function slugFor(bossName: string): string {
  const boss = BOSSES.find((b) => b.name === bossName);
  return (boss?.title ?? bossName)
    .toLowerCase()
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, "-");
}

function FloatingRelic({ modelUrl, weaponClass }: { modelUrl: string; weaponClass: WeaponClass }) {
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

  // Turning and breathing. A weapon held in the air by nothing should look like
  // it is being presented, not like it is idling in a viewer.
  useFrame((state, delta) => {
    if (!pivot.current) return;
    pivot.current.rotation.y += delta * 0.22;
    pivot.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
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

export function TitleHero({ onEnter }: { onEnter: () => void }) {
  const [relics, setRelics] = useState<ShowcaseRelic[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/debug/relics")
      .then((r) => r.json())
      .then((data: { relics: ShowcaseRelic[] }) => {
        setRelics(
          data.relics.filter((r) => r.status === "COMPLETE" && r.modelUrl).slice(0, 5),
        );
      })
      .catch(() => {
        /* The title screen must still stand with the API down. */
      });
  }, []);

  useEffect(() => {
    if (relics.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % relics.length), 8000);
    return () => clearInterval(timer);
  }, [relics.length]);

  const current = relics[index];
  const art = current ? `/assets/bosses/${slugFor(current.dna.bossInfluence)}/concept.png` : null;

  return (
    <section className="relative flex h-[100svh] w-full flex-col items-center justify-between overflow-hidden">
      {/*
        The boss that made the relic, pushed back into the dark.

        Held at low opacity and scaled past the frame so it reads as depth
        rather than as a picture on the page, and it drifts, because a still
        image behind a moving object announces itself as a backdrop.
      */}
      <AnimatePresence>
        {art && (
          <motion.img
            key={art}
            src={art}
            alt=""
            aria-hidden
            initial={{ opacity: 0, scale: 1.18 }}
            animate={{ opacity: 0.3, scale: 1.06 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 2 }, scale: { duration: 18, ease: "linear" } }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
          />
        )}
      </AnimatePresence>

      {/* Ground the art into the page rather than letting it end at an edge. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_18%,#0a0908_78%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ash-950 to-transparent" />

      {/* The name. */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="relative z-10 mt-[7svh] px-6 text-center"
      >
        <h1 className="font-display text-[clamp(2.75rem,9vw,7.5rem)] leading-none tracking-[0.16em] text-bone-200 drop-shadow-[0_0_60px_rgba(0,0,0,0.9)]">
          RELICFORGE
        </h1>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.5em] text-ember-400 sm:text-[11px]">
          Every legendary is actually legendary
        </p>
      </motion.header>

      {/* The relic, in front of the boss that produced it. */}
      <div className="relative z-10 h-[42svh] w-full max-w-3xl">
        {current?.modelUrl && (
          <Canvas camera={{ position: [2.3, 0.15, 2.3], fov: 40 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.45} />
            <directionalLight position={[4, 6, 3]} intensity={2.4} />
            <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#ff8c42" />
            <Suspense fallback={null}>
              <FloatingRelic modelUrl={current.modelUrl} weaponClass={current.dna.weaponClass} />
              <Environment preset="night" />
            </Suspense>
            <EffectComposer>
              <Bloom intensity={1.1} luminanceThreshold={0.6} luminanceSmoothing={0.3} mipmapBlur />
            </EffectComposer>
          </Canvas>
        )}
      </div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.2 }}
        className="relative z-10 mb-[6svh] flex flex-col items-center px-6 text-center"
      >
        {/*
          Provenance under the object, in one line.

          Naming the relic and the boss it came from is what stops this reading
          as a stock render: it is a specific weapon, from a specific fight,
          against the thing behind it.
        */}
        <AnimatePresence mode="wait">
          {current && (
            <motion.p
              key={current.relicId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-display text-xl tracking-[0.22em] text-ember-300 sm:text-2xl"
            >
              {current.name.toUpperCase()}
              <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.28em] text-bone-400">
                {current.dna.condition} · {current.dna.temperament} · forged from{" "}
                {current.dna.bossInfluence}
              </span>
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onEnter}
          className="group relative mt-8 overflow-hidden border border-ember-500/60 px-14 py-4 font-mono text-[11px] uppercase tracking-[0.45em] text-ember-300 transition hover:text-ash-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ember-500"
        >
          {/* The forge lighting the button as you reach for it. */}
          <span className="absolute inset-0 origin-bottom scale-y-0 bg-ember-500 transition-transform duration-300 ease-out group-hover:scale-y-100" />
          <span className="relative">Enter the forge</span>
        </button>

        {/*
          The credit line, which is not a footnote.

          Everything on this screen looks like art someone made until it says
          otherwise, and a visitor cannot tell a generated mesh from a modelled
          one by looking. So the page says it, on the first screen, beside the
          objects it is describing.

          It claims the whole screen rather than the weapon. The painting behind
          the relic is a generated boss, the champions in the game are generated,
          and the weapons those bosses carry were generated too. Crediting only
          the relic would undersell it and invite the assumption that the rest is
          stock art.

          The count of relics forged is deliberately gone: it was a number about
          this installation rather than a claim about the product, and it sat in
          the one line that had to carry the claim.
        */}
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-brass-700">
          every weapon, champion and boss here was generated by meshy-7
        </p>
      </motion.footer>
    </section>
  );
}
