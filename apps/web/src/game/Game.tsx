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
import { RelicPedestal } from "./RelicPedestal";
import { PersistRelicTransform } from "./PersistRelicTransform";
import { Embers } from "./Embers";
import { StarterWeapon } from "./StarterWeapon";
import { PlayerHands } from "./PlayerHands";
import { PlayerAvatar } from "./PlayerAvatar";
import { CameraShake } from "./CameraShake";
import { registerHit, resetFeedback } from "./feedback";
import { resetPlayerHandle } from "./Player";
import { resetBossState } from "./bossState";
import { recordClear } from "./bosses";
import { useGameStore } from "../state/useGameStore";
import { useForgeRun } from "../forge/useForgeRun";
import { ForgeSequence } from "../forge/ForgeSequence";
import { setEquippedRelic } from "./equipped";
import { setActiveChampion } from "./champions";
import { usePendingForge } from "../state/usePendingForge";
import { Hud } from "../ui/Hud";
import { DefeatScreen } from "../ui/DefeatScreen";
import { PreFightBriefing } from "../ui/PreFightBriefing";
import { PauseOverlay } from "../ui/PauseOverlay";
import { LiveRelicPanel } from "../ui/LiveRelicPanel";
import { DebugOverlay } from "../debug/DebugOverlay";
import { DamageFlash } from "../ui/DamageFlash";
import { TelegraphWarning } from "../ui/TelegraphWarning";
import { LoadoutPanel } from "../ui/LoadoutPanel";
import { useLoadout } from "../state/useLoadout";
import { useProgress } from "../state/useProgress";
import { sfx, unlockAudio } from "../audio/sfx";

/**
 * Scene root.
 *
 * Victory starts the forge automatically: the whole thesis is that the fight
 * *is* the input, so putting a menu between winning and receiving would break
 * the causal link the player is supposed to feel.
 */
export function Game({ mode = "hero" }: { mode?: "dev" | "hero" }) {
  const boss = useRef<BossHandle>(null);
  const phase = useGameStore((s) => s.phase);
  const view = useGameStore((s) => s.view);
  const forge = useGameStore((s) => s.forge);
  const damageBoss = useGameStore((s) => s.damageBoss);
  const setPhase = useGameStore((s) => s.setPhase);
  const reset = useGameStore((s) => s.reset);
  const { start, retry, persistTransform } = useForgeRun();
  const started = useRef(false);

  useEffect(() => unlockAudio(), []);

  /**
   * Release the cursor the moment the fight ends.
   *
   * Pointer lock captures the mouse, so every overlay button, Claim Relic,
   * Try again, Stoke the forge, was unclickable while it was held: the click
   * went to the canvas instead. The only escape was pressing Escape, which
   * nothing tells the player to do, so the buttons looked broken and the player
   * waited for something to happen.
   *
   * The handlers that call exitPointerLock inside onClick could never help,
   * since the click they depend on is the thing being swallowed.
   */
  useEffect(() => {
    if (phase === "FIGHTING") return;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }, [phase]);

  /**
   * P freezes the fight without drawing anything over it.
   *
   * A screenshot of the fight could not be taken. The game holds pointer lock,
   * so a region grab has no cursor to drag, and releasing the lock with Escape
   * pauses the fight and puts the pause card over the exact frame worth
   * photographing. Whole-screen capture works but catches the desktop with it.
   *
   * This gives back the cursor, stops the boss, and leaves the screen alone, so
   * any capture tool can be used on what is actually there, HUD included. P
   * again puts the cursor back in the fight.
   */
  useEffect(() => {
    if (phase !== "FIGHTING") return undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyP" || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();

      const state = useGameStore.getState();
      if (state.photoMode) {
        state.togglePhotoMode();
        const canvas = document.querySelector("canvas");
        if (canvas) void canvas.requestPointerLock();
        state.armCombat();
      } else {
        state.togglePhotoMode();
        // Releasing the lock is what pauses combat, through the listener
        // PauseOverlay already owns, so the freeze has one implementation.
        document.exitPointerLock?.();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  /* Victory → a beat of silence → the forge wakes. */
  useEffect(() => {
    if (phase !== "VICTORY" || started.current) return undefined;
    started.current = true;
    sfx.bossDeath();
    const ignite = setTimeout(() => sfx.forgeIgnite(), 900);
    const begin = setTimeout(() => void start(mode), 1400);
    return () => {
      clearTimeout(ignite);
      clearTimeout(begin);
    };
  }, [phase, start, mode]);

  useEffect(() => {
    if (phase === "DEFEAT") sfx.defeat();
  }, [phase]);

  useEffect(() => {
    if (forge.stage === "CONCEPT_READY") sfx.conceptReveal();
  }, [forge.stage]);

  /* Hammer strikes while the mesh is being forged, so the wait has a pulse. */
  useEffect(() => {
    if (forge.stage !== "FORGING_3D") return undefined;
    const timer = setInterval(() => sfx.hammer(), 1500);
    return () => clearInterval(timer);
  }, [forge.stage]);

  // Stable identity so Player's effect deps do not churn every render.
  const fallbackPosition = useRef(new Vector3());
  const bossPosition = useCallback(() => boss.current?.position() ?? fallbackPosition.current, []);

  const onHitBoss = useCallback(
    (kind: "light" | "heavy", damage: number) => {
      boss.current?.hit(kind);
      sfx.hitBoss();
      // Impact arrives on four channels at once: sound, a staggering boss,
      // a floating number, and a shaken camera. Any one alone reads as weak.
      registerHit(damage, kind);
      damageBoss(damage, kind);
    },
    [damageBoss],
  );

  const onNormalized = useCallback(
    (transform: RelicTransform) => persistTransform(transform),
    [persistTransform],
  );

  const claim = useCallback(() => {
    sfx.equip();
    const state = useGameStore.getState();
    const { forge: f } = state;
    // The relic is yours from here: it persists across runs and shows up in
    // the loadout on every later fight.
    if (f.relicId && f.name && f.dna && f.modelUrl) {
      // Claiming is when a relic actually exists, so this is where its XP is paid.
      useProgress.getState().award({
        bossLevel: state.bossLevel ?? 1,
        healthRemaining: 100,
        dodges: 0,
        healingUsed: 1,
        forgedRelic: true,
      });
      useLoadout.getState().claim({
        relicId: f.relicId,
        name: f.name,
        dna: f.dna,
        modelUrl: f.modelUrl,
        conceptUrl: f.conceptUrl,
        forgedMs: f.cached ? null : f.totalMs,
        earnedAt: Date.now(),
        bossLevel: state.bossLevel ?? 1,
      });
    }
    /*
     * Settles any pending record for this relic.
     *
     * A player can leave a forge, come back, and reach the cinematic again by
     * fighting the same boss the same way, which serves from cache. Without
     * this the strip would keep offering a relic already in their hands.
     */
    const pending = usePendingForge.getState().pending;
    if (pending && pending.relicId === f.relicId) usePendingForge.getState().settle();

    setPhase("EQUIPPED");
  }, [setPhase]);

  /* Clearing a boss unlocks the next rung and pays out rank experience. */
  useEffect(() => {
    if (phase !== "VICTORY") return;
    const state = useGameStore.getState();
    recordClear(state.bossLevel ?? 1);
    const telemetry = state.snapshotTelemetry();
    useProgress.getState().award({
      bossLevel: state.bossLevel ?? 1,
      healthRemaining: telemetry.healthRemaining,
      dodges: telemetry.dodges,
      healingUsed: telemetry.healingUsed,
      forgedRelic: true,
    });
  }, [phase]);

  useEffect(() => {
    if (phase === "DEFEAT") useProgress.getState().recordLoss();
  }, [phase]);

  /**
   * Everything that lives outside React has to be reset here.
   *
   * These are module-level because they are read every frame, which also means
   * they outlive the components. A fight that inherits the previous fight's
   * player position, attack state or boss swing is the kind of bug that only
   * shows up on a second run, which is exactly the run a demo does twice.
   */
  useEffect(() => {
    if (phase !== "FIGHTING") return;
    resetFeedback();
    resetPlayerHandle();
    resetBossState();
    // Read once here rather than every frame: the relic cannot change mid-fight,
    // and pinning it at the start means a swing can never resolve with different
    // numbers than the ones it began with.
    const { affinity } = useGameStore.getState();
    setActiveChampion(affinity);
    setEquippedRelic(useLoadout.getState().equipped(), affinity);
  }, [phase]);

  const relicReady = Boolean(forge.modelUrl && forge.dna);
  const showPedestal = relicReady && forge.stage === "COMPLETE" && phase !== "EQUIPPED";
  const showEquipped = relicReady && phase === "EQUIPPED";

  /**
   * A relic equipped in the loadout is carried into the fight.
   *
   * Selecting a weapon that then failed to appear in your hands would make the
   * loadout decorative. The starter blade only shows when nothing is equipped.
   */
  const carried = useLoadout((s) => s.equipped());
  const showCarried = phase === "FIGHTING" && carried !== null;

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
          <CameraShake />
          {/* Hands and a first-person blade, or the champion itself. Never
              both: two copies of the same weapon in frame. */}
          {view === "first" && <PlayerHands />}
          {view === "third" && <PlayerAvatar />}
          {/* The blade you arrive with: plain, mass-produced, and exactly the
              thing a generated relic is meant to replace. */}
          {view === "first" && !showCarried && <StarterWeapon />}
          {view === "first" && showCarried && carried && (
            <WeaponSocket
              modelUrl={carried.modelUrl}
              weaponClass={carried.dna.weaponClass}
            />
          )}
          <Embers active={phase !== "FIGHTING"} />

          {showPedestal && (
            <RelicPedestal modelUrl={forge.modelUrl!} weaponClass={forge.dna!.weaponClass} />
          )}

          {/* Persisted regardless of camera. It used to ride on the first-person
              socket, so with third person as the default the transform was never
              saved at all. */}
          {relicReady && (
            <Suspense fallback={null}>
              <PersistRelicTransform
                modelUrl={forge.modelUrl!}
                weaponClass={forge.dna!.weaponClass}
                onComputed={onNormalized}
              />
            </Suspense>
          )}
          {showEquipped && view === "first" && (
            <WeaponSocket modelUrl={forge.modelUrl!} weaponClass={forge.dna!.weaponClass} />
          )}

          <Environment preset="night" />
        </Suspense>

        <EffectComposer>
          {/* Restrained on purpose: molten cracks should glow, the blade should
              stay readable. Over-bloomed metal loses the silhouette. */}
          <Bloom intensity={0.7} luminanceThreshold={0.75} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette eskil={false} offset={0.18} darkness={0.85} />
        </EffectComposer>
      </Canvas>

      <Hud />
      <LiveRelicPanel />
      <PreFightBriefing />
      <PauseOverlay />
      <DamageFlash />
      <TelegraphWarning />
      <LoadoutPanel />
      <DebugOverlay />

      {(phase === "FORGING" || phase === "VICTORY") && (
        <ForgeSequence
          onClaim={claim}
          onRetry={() => void retry()}
          /* A failed forge has no relic to equip, so walking away returns to the
             forge rather than dropping the player into EQUIPPED holding nothing
             with a null name on screen. */
          onAbandon={() => {
            document.exitPointerLock?.();
            reset();
          }}
          /*
            Leaving does not cancel anything. The forge runs server side, keyed
            by relic id, and the client is only ever watching it: closing the
            stream stops the watching, not the work. Recording the id is all
            that is needed to pick it up again.
          */
          onLeave={
            forge.relicId && forge.name
              ? () => {
                  document.exitPointerLock?.();
                  usePendingForge.getState().leave({
                    relicId: forge.relicId!,
                    name: forge.name!,
                    bossLevel: useGameStore.getState().bossLevel ?? 1,
                    startedAt: Date.now(),
                  });
                  reset();
                }
              : null
          }
        />
      )}
      {phase === "DEFEAT" && <DefeatScreen />}

      {phase === "EQUIPPED" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
          <p className="pointer-events-none font-display text-sm uppercase tracking-[0.35em] text-ember-300">
            {forge.name}
          </p>
          <p className="pointer-events-none mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-600">
            click the arena to look · LMB to swing
          </p>
          {/*
            There was no route out of a finished run except reloading the page,
            which matters more than it sounds: two runs back to back is the
            entire comparison the project is built to show, and the relic is
            already saved to the loadout by the time this appears.
          */}
          <button
            type="button"
            onClick={() => {
              document.exitPointerLock?.();
              reset();
            }}
            className="pointer-events-auto mt-5 border border-ember-500/50 px-8 py-2 text-xs uppercase tracking-[0.3em] text-ember-300 transition hover:bg-ember-500/10"
          >
            Forge another
          </button>
        </div>
      )}
    </div>
  );
}
