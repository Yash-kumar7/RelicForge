import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { motion } from "framer-motion";
import { Quaternion, Vector3, type Group } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";

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
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
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
}

export function RelicRevealScreen({
  name,
  weaponClass,
  modelUrl,
  bossName,
  readings,
  accent,
  onClaim,
}: RelicRevealProps) {
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
            "One of one" is collector jargon. It means nothing to anyone who has
            not heard it, and the thing it is trying to say is the single most
            important claim this screen makes, so it says it.
          */}
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-stone-500">
            Legendary {weaponClass}
          </p>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-stone-500">
            This weapon did not exist before your fight and no copy of it will
            ever be made.
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

          <button
            type="button"
            onClick={onClaim}
            className="mt-10 border px-10 py-3 text-xs uppercase tracking-[0.35em] transition"
            style={{ borderColor: `${accent}99`, color: accent }}
          >
            Claim relic
          </button>
        </motion.div>
      </div>
    </div>
  );
}
