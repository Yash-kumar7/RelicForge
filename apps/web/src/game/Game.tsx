import { Suspense, useCallback, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Environment } from "@react-three/drei";
import { Vector3 } from "three";
import type { RelicTransform } from "@relic/core";
import { Arena } from "./Arena";
import { Boss, type BossHandle } from "./Boss";
import { Player } from "./Player";
import { WeaponSocket } from "./WeaponSocket";
import { useGameStore } from "../state/useGameStore";
import { useForgeRun } from "../forge/useForgeRun";
import { ForgeSequence } from "../forge/ForgeSequence";
import { Hud } from "../ui/Hud";
import { Embers } from "./Embers";

/**
 * Scene root.
 *
 * Victory automatically starts the forge: the whole thesis is that the fight
 * *is* the input, so there is no menu step between winning and being given
 * something that came out of how you won.
 */
export function Game({ mode = "hero" }: { mode?: "dev" | "hero" }) {
  const boss = useRef<BossHandle>(null);
  const phase = useGameStore((s) => s.phase);
  const forge = useGameStore((s) => s.forge);
  const damageBoss = useGameStore((s) => s.damageBoss);
  const setPhase = useGameStore((s) => s.setPhase);
  const { start, persistTransform } = useForgeRun();
  const started = useRef(false);

  useEffect(() => {
    if (phase === "VICTORY" && !started.current) {
      started.current = true;
      // A beat of silence before the forge wakes up.
      const timer = setTimeout(() => void start(mode), 1400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, start, mode]);

  // Stable identity so Player's effect deps do not churn every render.
  const fallbackPosition = useRef(new Vector3());
  const bossPosition = useCallback(
    () => boss.current?.position() ?? fallbackPosition.current,
    [],
  );

  const onHitBoss = useCallback(
    (kind: "light" | "heavy", damage: number) => {
      boss.current?.hit();
      damageBoss(damage, kind);
    },
    [damageBoss],
  );

  const onNormalized = useCallback(
    (transform: RelicTransform) => persistTransform(transform),
    [persistTransform],
  );

  const equipped = phase === "EQUIPPED" && forge.modelUrl && forge.dna;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.05, far: 120, position: [0, 1.7, 8] }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0908"]} />
        <Suspense fallback={null}>
          <Arena />
          <Boss ref={boss} />
          <Player bossPosition={bossPosition} onHitBoss={onHitBoss} />
          <Embers active={phase !== "FIGHTING"} />
          {equipped && (
            <WeaponSocket
              modelUrl={forge.modelUrl!}
              weaponClass={forge.dna!.weaponClass}
              onNormalized={onNormalized}
            />
          )}
          <Environment preset="night" />
        </Suspense>

        <EffectComposer>
          {/* Restrained: the relic has to stay readable, and molten cracks are
              the only thing that should genuinely glow. */}
          <Bloom intensity={0.7} luminanceThreshold={0.75} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.18} darkness={0.85} />
        </EffectComposer>
      </Canvas>

      <Hud />

      {(phase === "FORGING" || phase === "VICTORY") && (
        <ForgeSequence onClaim={() => setPhase("EQUIPPED")} />
      )}

      {phase === "EQUIPPED" && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
          <p className="font-display text-sm uppercase tracking-[0.35em] text-ember-300">
            {forge.name}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
            click to look · LMB to swing
          </p>
        </div>
      )}
    </div>
  );
}
