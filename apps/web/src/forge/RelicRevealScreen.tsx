import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { motion } from "framer-motion";
import { Quaternion, Vector3, type Group } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { rankFor, useProgress } from "../state/useProgress";
import { relicHintForUrl } from "../game/orientationHints";

/**
 * The relic, on a screen of its own.
 *
 * This used to be text laid over the arena while the weapon rose off the forge
 * at the far end of the room, eleven metres from a camera that stayed where the
 * player had been standing. The thing the entire game exists to produce was a
 * few dark pixels behind its own name, and the arena it sat in went on being lit
 * and busy behind the type.
 *
 * A defeat already gets a screen to itself. A victory is the more important of
 * the two and was getting less, so this is the same composition: the subject on
 * one side at size, the reading on the other, nothing overlapping anything.
 *
 * It also removes a problem rather than solving it. Framing a small object at
 * the end of a room means moving a camera that belongs to the player, on a frame
 * loop that is running a fight; a separate canvas owns its own camera and can
 * simply point it at the weapon.
 */

function TurningRelic({ modelUrl, weaponClass }: { modelUrl: string; weaponClass: WeaponClass }) {
  const pivot = useRef<Group>(null);
  const { scene } = useGLTF(modelUrl);
  const model = useMemo(() => scene.clone(true), [scene]);

  /*
   * Normalized here as everywhere else, so the weapon stands upright with its
   * grip at the origin whatever Meshy returned. This is the same call the arena
   * makes; a reveal that framed the mesh raw would be showing a different object
   * to the one the player is about to hold.
   */
  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass, relicHintForUrl(modelUrl)),
    [model, weaponClass, modelUrl],
  );
  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);
  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  useFrame((_, delta) => {
    if (pivot.current) pivot.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={pivot}>
      <group position={[0, -0.85, 0]}>
        <group position={gripOffset}>
          <group quaternion={quaternion} scale={canonical.scale}>
            <primitive object={model} />
          </group>
        </group>
      </group>
    </group>
  );
}

export interface RelicRevealProps {
  name: string;
  weaponClass: WeaponClass;
  modelUrl: string;
  bossName: string;
  /** The readings that decided this weapon, in the order they decided it. */
  readings: { label: string; value: string }[];
  accent: string;
  onClaim: () => void;
  /**
   * Walk away without taking it.
   *
   * Leaves the relic unclaimed and returns to the ladder — the same place claiming
   * goes, and the same thing a failed forge already did.
   */
  onDiscard: () => void;
}

/** A number that arrives rather than appearing. */
function CountUp({ to, delay }: { to: number; delay: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let frame = 0;
    const steps = 26;
    const timer = setTimeout(() => {
      const id = setInterval(() => {
        frame += 1;
        // Eased, so it lands rather than stopping dead on the final number.
        setShown(Math.round(to * (1 - (1 - frame / steps) ** 3)));
        if (frame >= steps) clearInterval(id);
      }, 24);
    }, delay);
    return () => clearTimeout(timer);
  }, [to, delay]);

  return <span className="tabular-nums">{shown}</span>;
}

/** Where a total sits inside its own rank, as a percentage of that rank's span. */
function barAt(xp: number): number {
  const rank = rankFor(xp);
  return rank.span > 0 ? Math.min(100, (rank.into / rank.span) * 100) : 100;
}

export function RelicRevealScreen({
  name,
  weaponClass,
  modelUrl,
  bossName,
  readings,
  accent,
  onClaim,
  onDiscard,
}: RelicRevealProps) {
  const award = useProgress((s) => s.lastAward);
  /**
   * Refusing takes two presses, and only refusing.
   *
   * This weapon exists once. It was generated from a fight that happened, it cannot
   * be produced again by fighting the same way, and there is no list of discarded
   * relics to recover it from — so a single mis-click beside the claim button would
   * destroy the only copy of the thing the entire game exists to make.
   *
   * Claiming stays one press, because claiming is reversible: an unwanted relic sits
   * in the loadout and is never selected. Only the irreversible half asks twice.
   */
  const [refusing, setRefusing] = useState(false);

  return (
    <div className="absolute inset-0 overflow-hidden bg-ash-950">
      {/* Its own light, in the element the fight was fought in. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 46% 44% at 30% 50%, ${accent}22, transparent 72%)`,
        }}
      />

      <div className="relative grid h-full grid-cols-1 items-center lg:grid-cols-[1fr_1fr]">
        {/* The weapon, at size, turning. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
          className="h-[62svh] w-full lg:h-[86svh]"
        >
          <Canvas camera={{ position: [2.2, 0.2, 2.2], fov: 38 }}>
            <ambientLight intensity={0.45} />
            <directionalLight position={[4, 6, 3]} intensity={2.4} />
            <directionalLight position={[-4, 2, -3]} intensity={1.1} color={accent} />
            <Suspense fallback={null}>
              <TurningRelic modelUrl={modelUrl} weaponClass={weaponClass} />
              <Environment preset="night" />
            </Suspense>
          </Canvas>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="px-8 pb-10 lg:px-14"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-stone-600">
            Forged from your victory over {bossName}
          </p>
          <h1
            className="mt-3 font-display text-5xl leading-[1.02] tracking-[0.08em] lg:text-7xl"
            style={{ color: accent }}
          >
            {name.toUpperCase()}
          </h1>
          {/*
            Says the true thing, not the flattering one.
            
            This read "no copy of it will ever be made", which is false and
            falsifiable in about a minute: the cache key is a hash of the compiled
            prompt, so two fights that produce the same DNA produce the same
            relic, by design. That is what makes a demo replayable and level one
            instant. Claiming uniqueness the system does not provide is worse than
            claiming nothing, because the one thing this project is asking to be
            believed is the link between a fight and a weapon.
            
            What is actually true is the interesting part anyway: nothing here was
            picked from a list. Fight differently and a different weapon comes out.
          */}
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-stone-500">
            Legendary {weaponClass}
          </p>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-stone-500">
            Nothing about this was chosen from a list. It was built from the way
            you fought, and fighting differently builds something else.
          </p>

          {/*
            Why it came out like this.

            The readings are the whole claim: without them a player has a weapon
            with a name, and with them they have a weapon they can see themselves
            in. No timing here, and nothing about caching. How long a server took
            is not a property of the weapon.
          */}
          <dl className="mt-9 grid max-w-md grid-cols-2 gap-x-8 gap-y-4 font-mono text-[11px] uppercase tracking-[0.15em]">
            {readings.map((reading) => (
              <div key={reading.label} className="border-b border-ash-800 pb-2">
                <dt className="text-stone-700">{reading.label}</dt>
                <dd className="mt-1 text-stone-300">{reading.value}</dd>
              </div>
            ))}
          </dl>

          {/*
            What the fight paid, and why.

            The bar on the setup screen was the whole of this feature, and a bar
            on a menu is not content: it is the receipt for a moment nobody was
            shown. Experience was added silently and only ever seen later as a
            larger number somewhere else, so it read as a counter that went up on
            its own.

            This is the moment. It names each condition the fight met, counts the
            total up rather than printing it, and fills the rank bar from where it
            was to where it is, which is the only time that bar means anything.
          */}
          {award && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
              className="mt-9 max-w-md border-t border-ash-800 pt-5"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-stone-600">
                  {award.rankUp ? `Rank up · ${award.rankUp}` : rankFor(award.after).name}
                </span>
                <span className="font-mono text-lg tabular-nums" style={{ color: accent }}>
                  +<CountUp to={award.gained} delay={1300} /> XP
                </span>
              </div>

              {/* Filled from where the bar was, not from zero: the distance
                  travelled is the thing being shown. */}
              <div className="mt-2 h-[3px] w-full bg-ash-800">
                <motion.div
                  className="h-[3px]"
                  style={{ background: accent }}
                  initial={{ width: `${barAt(award.before)}%` }}
                  animate={{ width: `${barAt(award.after)}%` }}
                  transition={{ duration: 1.4, delay: 1.3, ease: "easeOut" }}
                />
              </div>

              <ul className="mt-3 space-y-1 font-mono text-[10px] uppercase tracking-[0.15em]">
                {award.lines.map((line, i) => (
                  <motion.li
                    key={line.label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 1.5 + i * 0.18 }}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span className="text-stone-600">{line.label}</span>
                    <span className="tabular-nums text-stone-400">+{line.amount}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onClaim}
              data-sound="confirm"
              className="border px-10 py-3 text-xs uppercase tracking-[0.35em] transition"
              style={{ borderColor: `${accent}99`, color: accent }}
            >
              Claim relic
            </button>

            {/*
              Quieter than the claim, and never the same size.

              Two equally weighted buttons would read as a choice between two goods.
              This is not that: one of them is what the fight was for and the other
              is throwing it away, so it sits in the plainest treatment on the
              screen and says what happens rather than daring you.
            */}
            <button
              type="button"
              onClick={() => (refusing ? onDiscard() : setRefusing(true))}
              className={[
                "border px-6 py-3 text-[10px] uppercase tracking-[0.3em] transition",
                refusing
                  ? "border-red-500/60 text-red-300 hover:bg-red-500/10"
                  : "border-ash-800 text-stone-600 hover:border-stone-600 hover:text-stone-400",
              ].join(" ")}
            >
              {refusing ? "Leave it for good" : "Leave it in the forge"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
