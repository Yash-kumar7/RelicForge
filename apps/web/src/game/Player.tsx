import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { ARENA_RADIUS } from "./Arena";
import { COMBAT, attackSpec, isWithinArc, type AttackKind } from "./combat";
import { sfx } from "../audio/sfx";

/**
 * First-person player.
 *
 * First-person is a scope decision as much as an aesthetic one: no character
 * model, no rig, no Mixamo, no animation state machine — and the generated
 * relic occupies a large share of frame, which is the shot the whole project
 * exists to produce.
 *
 * Every per-frame value lives in a ref. Pushing position or cooldowns through
 * Zustand would re-render the tree 60 times a second.
 */

export interface PlayerHandle {
  position: Vector3;
  forward: Vector3;
  attacking: { kind: AttackKind; startedAt: number } | null;
  invulnerableUntil: number;
  moving: boolean;
}

export const playerHandle: PlayerHandle = {
  position: new Vector3(0, 1.7, 8),
  forward: new Vector3(0, 0, -1),
  attacking: null,
  invulnerableUntil: 0,
  moving: false,
};

interface PlayerProps {
  bossPosition: () => Vector3;
  onHitBoss: (kind: AttackKind, damage: number) => void;
}

export function Player({ bossPosition, onHitBoss }: PlayerProps) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  const velocity = useRef(new Vector3());
  const dodge = useRef({ until: 0, readyAt: 0, dir: new Vector3() });
  const attackLanded = useRef(false);
  const healCharges = useRef<number>(COMBAT.player.healCharges);

  const phase = useGameStore((s) => s.phase);
  const combatActive = useGameStore((s) => s.combatActive);
  const recordDodge = useGameStore((s) => s.recordDodge);

  /* ------------------------------------------------------------- input */
  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;

      const state = useGameStore.getState();
      if (state.phase !== "FIGHTING" || !state.combatActive) return;
      const now = performance.now();

      if (e.code === "Space" && now >= dodge.current.readyAt) {
        const dir = new Vector3(
          (keys.current["KeyD"] ? 1 : 0) - (keys.current["KeyA"] ? 1 : 0),
          0,
          (keys.current["KeyS"] ? 1 : 0) - (keys.current["KeyW"] ? 1 : 0),
        );
        if (dir.lengthSq() === 0) dir.set(0, 0, 1);
        dir.applyAxisAngle(new Vector3(0, 1, 0), yaw.current).normalize();

        dodge.current.dir.copy(dir);
        dodge.current.until = now + COMBAT.player.dodgeDurationMs;
        dodge.current.readyAt = now + COMBAT.player.dodgeCooldownMs;
        // i-frames are the whole point of a dodge; without them it is just a
        // fast sidestep and the telemetry stops meaning "played evasively".
        playerHandle.invulnerableUntil = now + COMBAT.player.dodgeDurationMs;
        recordDodge();
        sfx.dodge();
      }

      if (e.code === "KeyQ" && healCharges.current > 0) {
        healCharges.current -= 1;
        useGameStore.getState().heal(COMBAT.player.healAmount);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yaw.current -= e.movementX * 0.0022;
      pitch.current = Math.max(
        -Math.PI / 2.4,
        Math.min(Math.PI / 2.4, pitch.current - e.movementY * 0.0022),
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
        // Taking pointer lock is the moment the fight actually begins.
        useGameStore.getState().armCombat();
        return;
      }
      const state = useGameStore.getState();
      if (state.phase !== "FIGHTING" || !state.combatActive) return;
      if (playerHandle.attacking) return;

      const kind: AttackKind = e.button === 2 ? "heavy" : "light";
      playerHandle.attacking = { kind, startedAt: performance.now() };
      attackLanded.current = false;
      if (kind === "heavy") sfx.swingHeavy();
      else sfx.swingLight();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl, recordDodge]);

  /* ------------------------------------------------------------- update */
  useFrame((_, delta) => {
    const now = performance.now();
    const fighting = phase === "FIGHTING" && combatActive;

    // Look is allowed after victory too, so the player can watch the forge.
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    if (fighting) {
      const dodging = now < dodge.current.until;
      const input = new Vector3(
        (keys.current["KeyD"] ? 1 : 0) - (keys.current["KeyA"] ? 1 : 0),
        0,
        (keys.current["KeyS"] ? 1 : 0) - (keys.current["KeyW"] ? 1 : 0),
      );
      playerHandle.moving = input.lengthSq() > 0 || dodging;

      if (dodging) {
        velocity.current.copy(dodge.current.dir).multiplyScalar(COMBAT.player.dodgeSpeed);
      } else if (input.lengthSq() > 0) {
        input.normalize().applyAxisAngle(new Vector3(0, 1, 0), yaw.current);
        velocity.current.copy(input).multiplyScalar(COMBAT.player.moveSpeed);
      } else {
        velocity.current.multiplyScalar(0.75);
      }

      playerHandle.position.addScaledVector(velocity.current, delta);

      // Arena bound. A physics engine for one circular wall would be overkill.
      const radial = Math.hypot(playerHandle.position.x, playerHandle.position.z);
      if (radial > ARENA_RADIUS - 1) {
        const scale = (ARENA_RADIUS - 1) / radial;
        playerHandle.position.x *= scale;
        playerHandle.position.z *= scale;
      }
      playerHandle.position.y = 1.7;

      /* ------------------------------------------------------ attack */
      const attack = playerHandle.attacking;
      if (attack) {
        const spec = attackSpec(attack.kind);
        const elapsed = now - attack.startedAt;
        const activeFrom = spec.windupMs;
        const activeTo = spec.windupMs + spec.activeMs;

        if (!attackLanded.current && elapsed >= activeFrom && elapsed <= activeTo) {
          const boss = bossPosition();
          const hit = isWithinArc(
            { x: playerHandle.position.x, z: playerHandle.position.z },
            { x: playerHandle.forward.x, z: playerHandle.forward.z },
            { x: boss.x, z: boss.z },
            spec.reach,
            spec.arcDeg,
          );
          if (hit) {
            attackLanded.current = true;
            onHitBoss(attack.kind, spec.damage);
          }
        }

        if (elapsed > activeTo + spec.recoveryMs) playerHandle.attacking = null;
      }
    }

    camera.position.copy(playerHandle.position);
    camera.getWorldDirection(playerHandle.forward);
  });

  return null;
}
