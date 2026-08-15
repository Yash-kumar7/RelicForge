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

/** The ladder entry behind a relic's bossInfluence, for its art and its rung. */
function bossFor(bossName: string) {
  return BOSSES.find((b) => b.name === bossName) ?? null;
}

/** Slugified the same way the ladder does, so the art matches the boss named. */
function slugFor(bossName: string): string {
  return (bossFor(bossName)?.title ?? bossName)
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
        /*
         * One relic per boss, not the first five in the archive.
         *
         * The cache is filled a boss at a time, so taking the first five gave
         * five weapons from the same one or two rungs and the backdrop barely
         * changed. The point of cycling is to show that a different fight
         * against a different thing produces a different weapon, which needs
         * the bosses to differ.
         */
        const usable = data.relics.filter((r) => r.status === "COMPLETE" && r.modelUrl);
        const seen = new Set<string>();
        const perBoss = usable.filter((r) => {
          if (seen.has(r.dna.bossInfluence)) return false;
          seen.add(r.dna.bossInfluence);
          return true;
        });
        /* Up the ladder, so it opens on the first fight rather than mid-list. */
        const ordered = perBoss.sort(
          (a, b) => (bossFor(a.dna.bossInfluence)?.level ?? 99) - (bossFor(b.dna.bossInfluence)?.level ?? 99),
        );
        setRelics(ordered.length > 1 ? ordered : usable.slice(0, 5));
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
  const boss = current ? bossFor(current.dna.bossInfluence) : null;

  /*
   * The open-handed portrait, edited from the boss's own concept.
   *
   * The characters were regenerated holding a closed fist so a weapon would read
   * as gripped, which is right in the game and wrong here: on the title screen
   * they hold nothing, so a clenched empty hand looks like a mistake. These are
   * image-to-image edits of the same concepts, so it is the same character with
   * an open hand rather than a different one.
   */
  const art = current
    ? `/assets/bosses/${slugFor(current.dna.bossInfluence)}/concept-open.png`
    : null;

  /** The champion whose affinity produced this relic's element. */
  const championSlug = current
    ? current.dna.element === "ice"
      ? "frost"
      : current.dna.element === "lightning"
        ? "storm"
        : "ember"
    : null;

  return (
    <section className="relative flex h-[100svh] w-full flex-col items-center justify-between overflow-hidden">
      {/*
        The boss that made the relic, pushed back into the dark.

        Held at low opacity and scaled past the frame so it reads as depth
        rather than as a picture on the page, and it drifts, because a still
        image behind a moving object announces itself as a backdrop.
      */}
      {/*
        The face-off.

        A single figure behind a floating weapon is a product shot. Two figures
        turned toward each other is a fight, which is what the game is, and it
        says the whole premise without a word: this one, against that one,
        produced the thing between them.

        The champion is mirrored so they face inward. Both are held far back in
        the dark, because the relic between them is the subject.
      */}
      {/*
        Turned toward each other in perspective, not stood side by side.

        Two portraits square to the camera read as a catalogue however close
        together they are: nothing about them says the figures have anything to
        do with each other. Rotating each inward puts them on the same stage
        looking across it, which is what a versus screen has always done, and
        the vanishing point between them is where the weapon hangs.
      */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ perspective: "1400px", perspectiveOrigin: "50% 55%" }}
      >
        <AnimatePresence>
          {championSlug && (
            <motion.img
              key={`champion-${championSlug}`}
              src={`/assets/champions/${championSlug}/concept-open.png`}
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: -60, rotateY: 34 }}
              animate={{ opacity: 0.36, x: 0, rotateY: 22 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              style={{ transformOrigin: "left bottom" }}
              className="absolute bottom-0 left-[-4%] h-[70svh] w-auto -scale-x-100 object-contain"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {art && (
            <motion.img
              key={art}
              src={art}
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: 60, rotateY: -34 }}
              animate={{ opacity: 0.36, x: 0, rotateY: -22 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              style={{ transformOrigin: "right bottom" }}
              className="absolute bottom-0 right-[-4%] h-[76svh] w-auto object-contain"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Ground the art into the page rather than letting it end at an edge. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_18%,#0a0908_78%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ash-950 to-transparent" />
      {/*
        The forge, under the floor.

        The page was a black void with figures cut out of it, which is the one
        atmosphere a game about a forge should not have. A warm source low and
        centred gives the figures something to be lit from and stand on, and it
        sits directly beneath the weapon, so the glow reads as the thing that
        made it.
      */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_100%,rgba(255,107,26,0.16),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_30%_20%_at_50%_98%,rgba(255,140,66,0.22),transparent_70%)]" />

      {/*
        A band of dark for the title to sit on.

        The figures are portraits, so their heads reach the top of the frame and
        collide with the title. They are shorter now, and the top of the screen
        falls away into the ground colour as well, because a title should never
        depend on what happens to be behind it.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42svh] bg-gradient-to-b from-ash-950 via-ash-950/90 to-transparent" />

      {/*
        Who this is.

        The painting was unlabelled, so a visitor met an armoured figure with no
        name and no reason to be there. Naming it and giving it a rung turns the
        backdrop into the thing the weapon in front of it was taken from, which
        is the only reason it is on the page.
      */}
      <AnimatePresence>
        {boss && (
          <motion.figcaption
            key={boss.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute bottom-[7svh] right-8 z-10 hidden border-r border-brass-700 pr-4 text-right lg:block"
          >
            <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
              boss {String(boss.level).padStart(2, "0")}
            </span>
            <span className="mt-1 block font-display text-base tracking-[0.16em] text-bone-200">
              {boss.title}
            </span>
            <span className="mt-1 block max-w-[16rem] font-mono text-[10px] leading-relaxed text-bone-400">
              {boss.blurb}
            </span>
          </motion.figcaption>
        )}
      </AnimatePresence>

      {/* The champion's side of the face-off. */}
      <AnimatePresence>
        {championSlug && (
          <motion.figcaption
            key={`name-${championSlug}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute bottom-[7svh] left-8 z-10 hidden border-l border-brass-700 pl-4 text-left lg:block"
          >
            <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-brass-700">
              your champion
            </span>
            <span className="mt-1 block font-display text-base capitalize tracking-[0.16em] text-bone-200">
              {championSlug}
            </span>
          </motion.figcaption>
        )}
      </AnimatePresence>

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
      {/*
        Bigger, and pulled forward.

        At 42svh in front of a full-height boss the weapon read as something
        pinned to his chest. The relic is the subject of this page and the
        painting is the setting, so the relic has to be the larger of the two.
      */}
      <div className="relative z-10 -my-[4svh] h-[54svh] w-full max-w-3xl">
        {current?.modelUrl && (
          <Canvas camera={{ position: [1.9, 0.12, 1.9], fov: 40 }} gl={{ antialias: true }}>
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
              {/*
                The name only.

                It used to carry "shattered - elegant - forged from the Ashen
                Warden" underneath. Those are the game's own terms, and on a
                first screen they are three words a visitor has no definition
                for. The relationship they were trying to state is already on
                screen: the boss is named at the left and the weapon it produced
                is floating in front of it.
              */}
              {current.name.toUpperCase()}
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
