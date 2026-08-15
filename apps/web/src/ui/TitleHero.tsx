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

/** Just enough of a relic to rank it. */
type StepRelicLike = { dna: RelicDNA };

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
        /*
         * One relic per boss, up the ladder, opening on the first fight.
         *
         * The page opens on whatever it shows first, so that frame is chosen
         * rather than inherited: the Ashen Warden against Ember, which is the
         * pairing a new player actually meets. Level one is also the boss
         * everybody fights, so it is the honest thing to lead with.
         *
         * After that, one per boss climbing the ladder. Elements are varied
         * where there is a choice, because the element decides which champion
         * stands on the left and picking only by boss gave five lightning
         * relics and the same champion every time. Greatswords win a tie, since
         * a spear between two armoured figures is a thin line that loses to
         * both.
         */
        const score = (r: StepRelicLike) => {
          const level = bossFor(r.dna.bossInfluence)?.level ?? 99;
          const opener = level === 1 && r.dna.element === "fire" ? 0 : 1;
          const shape = r.dna.weaponClass === "greatsword" ? 0 : 1;
          return { level, opener, shape };
        };

        const seenBoss = new Set<string>();
        const seenElement = new Set<string>();
        const ordered = [...usable]
          .sort((a, b) => {
            const x = score(a);
            const y = score(b);
            return x.level - y.level || x.opener - y.opener || x.shape - y.shape;
          })
          .filter((r) => {
            if (seenBoss.has(r.dna.bossInfluence)) return false;
            const alternatives = usable.filter(
              (o) => o.dna.bossInfluence === r.dna.bossInfluence && !seenElement.has(o.dna.element),
            );
            if (alternatives.length > 0 && seenElement.has(r.dna.element)) return false;
            seenBoss.add(r.dna.bossInfluence);
            seenElement.add(r.dna.element);
            return true;
          });

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
    ? `/assets/bosses/${slugFor(current.dna.bossInfluence)}/concept-cut.png`
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
        Ground the art into the page rather than letting it end at an edge.

        Softer, and behind the figures rather than over them. It was written for
        one centred portrait and darkened hardest at the left and right edges,
        which is exactly where the two fighters stand: it was painting them out
        of the picture entirely.
      */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(7,6,5,0.85)_92%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ash-950 to-transparent" />
      {/*
        The forge, under the floor, barely.

        This was two gradients and much brighter, from when the figures were
        washed out and needed something to stand on. Now that they are cut out
        and carry their own lighting, a strong glow has nothing to justify it and
        reads as a smudge behind the button. What is left is only enough to keep
        the bottom edge from ending in flat black.
      */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_46%_26%_at_50%_104%,rgba(255,107,26,0.09),transparent_72%)]" />

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
        /* Lifted off the bottom edge. Sat on it, the figures read as standing
           in a pit below the page rather than on the same floor as the weapon. */
        style={{ perspective: "1400px", perspectiveOrigin: "50% 48%" }}
      >
        <AnimatePresence>
          {championSlug && (
            <motion.img
              key={`champion-${championSlug}`}
              src={`/assets/champions/${championSlug}/concept-cut.png`}
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: -60, rotateY: 34 }}
              animate={{ opacity: 0.92, x: 0, rotateY: 22 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              /*
               * Not mirrored.
               *
               * A horizontal flip was meant to turn the champion inward, and
               * combined with rotateY it inverted the rotation instead, turning
               * the figure away from the camera and foreshortening it to
               * nothing. These concepts are drawn front-on, so a figure does not
               * face left or right to begin with and the rotation alone puts it
               * on the stage.
               */
              style={{ transformOrigin: "left bottom" }}
              /*
               * Cut out, with a real alpha channel.
               *
               * Three attempts got here. Asking the model for a neutral
               * background produced a pale sheet, so each figure arrived inside
               * a grey card. Asking for pure black produced near-black with a
               * faint gradient, which still read as a rectangle against a page
               * that is not exactly that black. Screen blending cancelled most
               * of it and not all, because there was something left to cancel.
               *
               * A prompt cannot promise an exact pixel value, so the background
               * is removed from the pixels instead: the figures are lit and the
               * background is not, so luminance separates them, and a soft ramp
               * keeps the edges from turning into cutout jaggies. Free, exact,
               * and it works on any page colour.
               */
              className="absolute bottom-[13svh] left-[-3%] h-[74svh] w-auto object-contain"
            />
          )}
        </AnimatePresence>

        {/*
          Mirrored, so the boss faces the champion.

          The stance prompt asked for a figure turned to its own left, which is
          inward for whoever stands on the left and outward for whoever stands on
          the right. Both were generated the same way, so the boss came out
          looking off the edge of the page.

          The flip lives on a wrapper rather than on the image, because scaleX
          and rotateY on the same element invert each other and that is what
          turned the champion away from the camera and made it vanish earlier.
        */}
        <div className="absolute inset-0 -scale-x-100">
        <AnimatePresence>
          {art && (
            <motion.img
              key={art}
              src={art}
              alt=""
              aria-hidden
              initial={{ opacity: 0, x: 60, rotateY: -34 }}
              animate={{ opacity: 0.88, x: 0, rotateY: -22 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              style={{ transformOrigin: "right bottom" }}
              /* A touch darker and cooler than the glow behind it, so the boss
               stays its own colour instead of being tinted by the forge. */
            className="absolute bottom-[13svh] left-[-3%] h-[78svh] w-auto object-contain brightness-[0.92] contrast-[1.04]"
            />
          )}
        </AnimatePresence>
        </div>
      </div>

      {/*
        A band of dark for the title to sit on.

        The figures are portraits, so their heads reach the top of the frame and
        collide with the title. They are shorter now, and the top of the screen
        falls away into the ground colour as well, because a title should never
        depend on what happens to be behind it.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30svh] bg-gradient-to-b from-[#070605] via-[#070605]/85 to-transparent" />

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
        {/*
          Sized to be read, not to fill the width.

          At 9vw it spanned the whole screen on a wide monitor and became the
          subject of the page, which the relic is supposed to be. A title has to
          be legible and confident; it does not have to be the largest thing in
          the composition.
        */}
        <h1 className="font-display text-[clamp(2rem,4.6vw,4rem)] leading-none tracking-[0.22em] text-bone-200 drop-shadow-[0_0_60px_rgba(0,0,0,0.9)]">
          RELICFORGE
        </h1>
        <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.42em] text-ember-400 sm:text-[10px]">
          {/*
            The mechanic, not a joke about other games.

            This was "every legendary is actually legendary", a pun on loot
            rarity tiers: games hand out junk labelled legendary, so ours really
            is. It only lands if the reader already knows that convention, and
            even then it is a remark about other games rather than a statement
            about this one. A tagline on a first screen has one job, which is to
            say what the thing does.
          */}
          The weapon does not exist until you win it
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
                Labelled as an outcome, not as inventory.

                A visitor reads a weapon floating between two fighters as the
                one they are holding, and a new player holds the iron sword and
                nothing else. It is the opposite: this is what that fight
                produced, and it did not exist until the fight was over. One
                line fixes the reading, and it is also the whole pitch.
              */}
              <span className="mb-3 block font-mono text-[9px] uppercase tracking-[0.35em] text-brass-700">
                what this fight made
              </span>

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
