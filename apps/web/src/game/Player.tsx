import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { CAMERA_LIMIT, FORGE_POSITION, FORGE_RADIUS, PLAYER_LIMIT } from "./arenaGeometry";
import { COMBAT, attackSpec, isWithinArc, type AttackKind } from "./combat";
import { equipped } from "./equipped";
import { activeChampion } from "./champions";
import { sfx } from "../audio/sfx";
import { registerDodge } from "./feedback";
import { BOSS_SPAWN } from "./bossState";

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
  /**
   * `mirrored` alternates between swings.
   *
   * Every light attack cut the same way, so a run of them read as one animation
   * restarting rather than as a sequence of blows. Alternating the arc is what a
   * combo is made of: the blade finishes on the left, so the next one starts
   * there and comes back across.
   */
  attacking: { kind: AttackKind; startedAt: number; mirrored: boolean } | null;
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
 * The direction the player is looking when the fight opens: at the boss.
 *
 * This was the literal Math.PI, which points the camera down +z. The player
 * spawns at z = +8 and the boss at z = -4, so the fight began with the player
 * facing the empty end of the arena and the thing they had come to kill directly
 * behind them.
 *
 * Derived rather than corrected to zero, so moving either spawn cannot break it
 * again. camera.rotation.y = yaw makes the view direction (-sin y, 0, -cos y),
 * which inverts to atan2 of the negated offset.
 */
export const SPAWN_YAW = Math.atan2(-(BOSS_SPAWN.x - SPAWN.x), -(BOSS_SPAWN.z - SPAWN.z));

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
  /* Which way the next cut travels. Flipped on every attack. */
  const swingSide = useRef(false);
  /* When the player last turned the camera by hand, so assist can yield to it. */
  const aimedAt = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(SPAWN_YAW);
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
  const bossHp = useGameStore((s) => s.bossHp);
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
        dodge.current.readyAt =
          now + COMBAT.player.dodgeCooldownMs * activeChampion.traits.dodgeCooldown;
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
      // Aim assist stands down while the player is aiming themselves.
      if (Math.abs(e.movementX) > 1) aimedAt.current = performance.now();
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
      // Alternates, so consecutive swings return across the body instead of
      // resetting and repeating the same cut.
      swingSide.current = !swingSide.current;
      playerHandle.attacking = {
        kind,
        startedAt: performance.now(),
        mirrored: swingSide.current,
      };
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

    /*
     * The opening move owns the camera, so this hand comes off it entirely.
     *
     * Two things writing camera.position and camera.rotation on the same frame
     * means whichever runs last wins, and the loser's work shows up as a shudder.
     * Read from the store rather than subscribed, because this runs every frame
     * and a re-render per flag change is a re-render for nothing.
     */
    if (useGameStore.getState().cinematic) return;

    const fighting = phase === "FIGHTING" && combatActive;
    // Attack timing has to keep advancing after the fight, or a swing taken in
    // The swing-only path existed for the post-claim arena, which is gone.
    const swinging = false;

    // Look is allowed after victory too, so the player can watch the forge.
    /**
     * Soft lock-on.
     *
     * There was none, and its absence is most of why a fight felt flat. A boss
     * is nearly three metres tall and circles constantly, so without any help
     * the player spends the fight steering a camera rather than choosing when to
     * swing — hits land by accident, and the thing you are fighting is
     * frequently half out of frame.
     *
     * Every third person action game solves this with lock-on. This is the quiet
     * version: the camera is drawn toward the boss continuously, fast enough to
     * keep it framed and slow enough that it never feels like the view was taken
     * away. It yields entirely for a third of a second whenever the player turns
     * by hand, so looking somewhere deliberately always wins.
     *
     * Yaw only. Pitch stays where it was put, because a camera that also decides
     * how high to look is a camera the player no longer owns.
     */
    if (fighting && bossHp > 0 && now - aimedAt.current > 320) {
      const boss = bossPosition();
      const dx = boss.x - playerHandle.position.x;
      const dz = boss.z - playerHandle.position.z;

      if (dx * dx + dz * dz > 0.04) {
        /* The view direction for a given yaw is (-sin y, 0, -cos y), so the yaw
           that points at the boss is atan2 of the negated offset. */
        const want = Math.atan2(-dx, -dz);
        let diff = want - yaw.current;
        // Shortest way round, or the camera takes the long path through 180.
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        /* Frame-rate independent, and gentle: about a third of the remaining
           error every tenth of a second. Enough to hold a circling boss in
           frame, not enough to feel like a rail. */
        yaw.current += diff * (1 - Math.exp(-delta / 0.22));
      }
    }

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
        // Every champion moves at the same speed on purpose: see champions.ts.
        velocity.current.copy(input).multiplyScalar(COMBAT.player.moveSpeed);
      } else {
        velocity.current.multiplyScalar(0.75);
      }

      playerHandle.position.addScaledVector(velocity.current, delta);

      // Arena bound. A physics engine for one circular wall would be overkill.
      const radial = Math.hypot(playerHandle.position.x, playerHandle.position.z);
      if (radial > PLAYER_LIMIT) {
        const scale = PLAYER_LIMIT / radial;
        playerHandle.position.x *= scale;
        playerHandle.position.z *= scale;
      }

      /*
       * The forge is solid, and it is the only thing in here that is.
       *
       * Walking through the furnace the whole game is built around is what made
       * the old pillars worthless: an object a body passes through is scenery,
       * however good the mesh is. Pushed out along the line from its centre,
       * which is the cheapest correct answer for a round obstacle and keeps a
       * player sliding around it rather than sticking to it.
       */
      const fromForge = Math.hypot(
        playerHandle.position.x - FORGE_POSITION.x,
        playerHandle.position.z - FORGE_POSITION.z,
      );
      if (fromForge < FORGE_RADIUS && fromForge > 0.0001) {
        const push = FORGE_RADIUS / fromForge;
        playerHandle.position.x =
          FORGE_POSITION.x + (playerHandle.position.x - FORGE_POSITION.x) * push;
        playerHandle.position.z =
          FORGE_POSITION.z + (playerHandle.position.z - FORGE_POSITION.z) * push;
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
        const spec = attackSpec(attack.kind, equipped.traits);
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
        const spec = attackSpec(attack.kind, equipped.traits);
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
      const limit = CAMERA_LIMIT;
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
