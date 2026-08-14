import { forwardRef, useImperativeHandle, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { COMBAT, isWithinArc } from "./combat";
import { playerHandle } from "./Player";
import { sfx } from "../audio/sfx";
import { themeFor } from "./theme";

/**
 * The Ashen Warden.
 *
 * A three-state loop — approach, telegraph, strike — built from primitives.
 * It only has to be readable enough that surviving at 8% health feels earned;
 * anything more elaborate is polish spent on the wrong half of the demo.
 */

type BossState = "APPROACH" | "TELEGRAPH" | "STRIKE" | "RECOVER" | "DYING";

export interface BossHandle {
  position: () => Vector3;
  hit: () => void;
}

export const Boss = forwardRef<BossHandle>(function Boss(_props, ref) {
  const group = useRef<Group>(null);
  const coreMesh = useRef<Mesh>(null);
  const position = useRef(new Vector3(0, 0, -4));
  const state = useRef<BossState>("APPROACH");
  const stateUntil = useRef(0);
  const hitFlash = useRef(0);
  const deathAt = useRef(0);

  const phase = useGameStore((s) => s.phase);
  const bossHp = useGameStore((s) => s.bossHp);
  const combatActive = useGameStore((s) => s.combatActive);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);

  useImperativeHandle(ref, () => ({
    position: () => position.current,
    hit: () => {
      hitFlash.current = 1;
    },
  }));

  useFrame((_, delta) => {
    const now = performance.now();
    const g = group.current;
    if (!g) return;

    const dead = bossHp <= 0;
    if (dead && state.current !== "DYING") {
      state.current = "DYING";
      deathAt.current = now;
    }

    if (state.current === "DYING") {
      // Sink and fade rather than play a death animation — no rig, no clips.
      const t = Math.min(1, (now - deathAt.current) / 1400);
      g.position.y = -t * 2.2;
      g.rotation.z = t * 0.5;
      g.scale.setScalar(1 - t * 0.25);
      return;
    }

    // Standing still until the player has actually begun. Attacking someone
    // who is still reading the briefing is not difficulty, it is a bug.
    if (phase !== "FIGHTING" || !combatActive) return;

    const toPlayer = new Vector3().subVectors(playerHandle.position, position.current);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const forward = toPlayer.clone().normalize();

    switch (state.current) {
      case "APPROACH": {
        if (distance > COMBAT.boss.preferredRange) {
          position.current.addScaledVector(forward, COMBAT.boss.moveSpeed * delta);
        } else {
          state.current = "TELEGRAPH";
          stateUntil.current = now + COMBAT.boss.telegraphMs;
        }
        break;
      }
      case "TELEGRAPH": {
        // Slow drift during the wind-up so a dodge is a real decision.
        position.current.addScaledVector(forward, COMBAT.boss.moveSpeed * 0.25 * delta);
        if (now >= stateUntil.current) {
          state.current = "STRIKE";
          stateUntil.current = now + COMBAT.boss.activeMs;

          const hit = isWithinArc(
            { x: position.current.x, z: position.current.z },
            { x: forward.x, z: forward.z },
            { x: playerHandle.position.x, z: playerHandle.position.z },
            COMBAT.boss.reach,
            120,
          );
          // i-frames from a dodge are checked here, at the moment of impact.
          if (hit && now >= playerHandle.invulnerableUntil) {
            useGameStore.getState().damagePlayer(COMBAT.boss.damage);
            sfx.playerHurt();
          }
        }
        break;
      }
      case "STRIKE": {
        if (now >= stateUntil.current) {
          state.current = "RECOVER";
          stateUntil.current = now + COMBAT.boss.recoveryMs;
        }
        break;
      }
      case "RECOVER": {
        if (now >= stateUntil.current) state.current = "APPROACH";
        break;
      }
    }

    g.position.set(position.current.x, position.current.y, position.current.z);
    g.lookAt(playerHandle.position.x, 0, playerHandle.position.z);

    // Wind-up reads as a rising glow; the strike is a lunge.
    const material = coreMesh.current?.material as MeshStandardMaterial | undefined;
    if (material) {
      const charge =
        state.current === "TELEGRAPH"
          ? 1 - (stateUntil.current - now) / COMBAT.boss.telegraphMs
          : state.current === "STRIKE"
            ? 1
            : 0.15;
      material.emissiveIntensity = 0.4 + charge * 4;
      material.emissive = new Color(hitFlash.current > 0 ? "#ffffff" : theme.bossCore);
    }
    if (hitFlash.current > 0) hitFlash.current = Math.max(0, hitFlash.current - delta * 6);

    const lunge = state.current === "STRIKE" ? 0.6 : 0;
    g.position.addScaledVector(forward, lunge);
  });

  return (
    <group ref={group} position={[0, 0, -4]}>
      <mesh position={[0, 1.6, 0]} castShadow>
        <capsuleGeometry args={[0.85, 1.7, 8, 16]} />
        <meshStandardMaterial color="#241c17" roughness={0.85} metalness={0.2} />
      </mesh>
      <mesh ref={coreMesh} position={[0, 2.1, 0.7]}>
        <sphereGeometry args={[0.34, 20, 20]} />
        <meshStandardMaterial
          color="#3a1a0d"
          emissive={theme.bossCore}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      {/* Shoulder mass, so the silhouette reads as a warden and not a pill. */}
      <mesh position={[0, 2.7, 0]} rotation={[0, 0, Math.PI / 8]}>
        <boxGeometry args={[2.3, 0.4, 0.9]} />
        <meshStandardMaterial color="#1b1511" roughness={0.9} />
      </mesh>
    </group>
  );
});
