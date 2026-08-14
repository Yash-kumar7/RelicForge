import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { ARENA_RADIUS } from "./Arena";
import { COMBAT, attackSpec, isWithinArc, type AttackKind } from "./combat";
import { sfx } from "../audio/sfx";
import { registerDodge } from "./feedback";

/**
 * First-person player.
 *
 * First-person is a scope decision as much as an aesthetic one: no character
 * model, no rig, no Mixamo, no animation state machine, and the generated
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

/** Where a fight begins. Kept here so the reset and the initial value agree. */
export const SPAWN = { x: 0, y: 1.7, z: 8 } as const;

/**
 * Returns the player to the start of a fight.
 *
 * playerHandle is module-level because it is read every frame and must not go
 * through React, but that means it outlives the component. Without this, a
 * second run began wherever the first one ended, which could be standing inside
 * the boss, and could inherit a half-finished attack or leftover invulnerability
 * frames from the previous fight.
 */
export function resetPlayerHandle(): void {
  playerHandle.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
  playerHandle.forward.set(0, 0, -1);
  playerHandle.attacking = null;
  playerHandle.invulnerableUntil = 0;
  playerHandle.moving = false;
}

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
  const vertical = useRef(0);
  const grounded = useRef(true);
  const attackLanded = useRef(false);
  /**
   * One buffered input.
   *
   * A click arriving while an attack is still resolving used to be thrown away,
   * and a light attack occupies about 440ms. At any normal clicking pace that
   * meant right-clicks disappeared and the player never saw a heavy attack land
   * at all, which makes two attack types pointless. Holding the most recent
   * press and firing it the moment the current attack clears is what every
   * action game does, and it is the difference between the heavy attack existing
   * and not.
   */
  const buffered = useRef<{ kind: AttackKind; at: number } | null>(null);
  /** Set by the input effect so the frame loop can fire a buffered attack. */
  const startAttackRef = useRef<((kind: AttackKind) => void) | null>(null);
  const healCharges = useRef<number>(COMBAT.player.healCharges);

  const phase = useGameStore((s) => s.phase);
  const combatActive = useGameStore((s) => s.combatActive);
  const view = useGameStore((s) => s.view);
  const recordDodge = useGameStore((s) => s.recordDodge);

  /* ------------------------------------------------------------- input */
  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;

      const state = useGameStore.getState();
      if (state.phase !== "FIGHTING" || !state.combatActive) return;
      const now = performance.now();

      if (e.code === "Space" && grounded.current) {
        vertical.current = COMBAT.player.jumpSpeed;
        grounded.current = false;
      }

      if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && now >= dodge.current.readyAt) {
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
        registerDodge();
        sfx.dodge();
      }

      if (e.code === "KeyV") useGameStore.getState().toggleView();

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

      if (playerHandle.attacking) {
        // Remembered rather than dropped. Only the latest press is kept, so
        // mashing does not build a queue of swings the player forgot about.
        buffered.current = { kind, at: performance.now() };
        return;
      }

      startAttack(kind);
    };

    const startAttack = (kind: AttackKind) => {
      playerHandle.attacking = { kind, startedAt: performance.now() };
      attackLanded.current = false;
      if (kind === "heavy") sfx.swingHeavy();
      else sfx.swingLight();
    };

    startAttackRef.current = startAttack;

    const onContextMenu = (e: Event) => e.preventDefault();

    /**
     * A keyup never arrives for a key still held when the window loses focus, so
     * the key stays down forever and the player runs into a wall until they
     * press it again. Alt-tabbing mid-fight was enough to trigger it.
     */
    const releaseAllKeys = () => {
      keys.current = {};
      playerHandle.moving = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAllKeys);
    document.addEventListener("visibilitychange", releaseAllKeys);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAllKeys);
      document.removeEventListener("visibilitychange", releaseAllKeys);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl, recordDodge]);

  /* ------------------------------------------------------------- update */
  useFrame((_, rawDelta) => {
    /**
     * A backgrounded tab stops requestAnimationFrame, so the first frame after
     * returning can carry several seconds of delta. Integrated unclamped that
     * teleports the player across the arena, or straight through the wall clamp.
     * A 50ms ceiling is a dropped frame at worst.
     */
    const delta = Math.min(rawDelta, 0.05);
    const now = performance.now();
    const fighting = phase === "FIGHTING" && combatActive;
    // Attack timing has to keep advancing after the fight, or a swing taken in
    // EQUIPPED would start and never clear.
    const swinging = phase === "EQUIPPED";

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
      /**
       * Vertical motion is integrated separately from the ground plane so a
       * jump cannot be cancelled by the arena clamp. Eye height is 1.7 when
       * standing, and playerHandle.position stays the authoritative position
       * every hit test reads.
       */
      if (!grounded.current || vertical.current !== 0) {
        vertical.current -= COMBAT.player.gravity * delta;
        playerHandle.position.y += vertical.current * delta;
        if (playerHandle.position.y <= 1.7) {
          playerHandle.position.y = 1.7;
          vertical.current = 0;
          grounded.current = true;
        }
      } else {
        playerHandle.position.y = 1.7;
      }

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

      // Fire the buffered press as soon as the previous attack clears, but drop
      // it if it has gone stale: acting on a click from a second ago feels like
      // the game moving on its own.
      if (!playerHandle.attacking && buffered.current) {
        const { kind, at } = buffered.current;
        buffered.current = null;
        if (now - at < 400) startAttackRef.current?.(kind);
      }
    } else if (swinging) {
      // Animation only: no movement, no hit test, no damage.
      const attack = playerHandle.attacking;
      if (attack) {
        const spec = attackSpec(attack.kind);
        const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
        if (now - attack.startedAt > total) playerHandle.attacking = null;
      }
    }

    /**
     * playerHandle.position stays the authoritative eye position and is what
     * every hit test uses. Third person only moves the camera off it, so
     * switching view can never change what a swing can reach.
     */
    if (view === "third") {
      /**
       * The boom shortens rather than clipping through the wall.
       *
       * A fixed 4.2 unit boom put the camera outside the arena whenever the
       * player fought near the edge, which looks exactly like being knocked out
       * of the ring even though the player never left it. Dodging toward the wall
       * made it obvious. Pulling the camera in keeps it inside and reads as the
       * view tightening in close quarters.
       */
      const back = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), yaw.current);
      const limit = ARENA_RADIUS - 0.6;
      let boom = 4.2;

      for (let i = 0; i < 6; i++) {
        const x = playerHandle.position.x + back.x * boom;
        const z = playerHandle.position.z + back.z * boom;
        if (Math.hypot(x, z) <= limit) break;
        boom *= 0.75;
      }

      camera.position.copy(playerHandle.position).addScaledVector(back, boom);
      camera.position.y = playerHandle.position.y + 1.15;
    } else {
      camera.position.copy(playerHandle.position);
    }
    camera.getWorldDirection(playerHandle.forward);
  });

  return null;
}
