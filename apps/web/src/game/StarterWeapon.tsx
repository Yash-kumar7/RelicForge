import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { weaponSway } from "@relic/core";
import { playerHandle } from "./Player";
import { attackSpec } from "./combat";
import { useGameStore } from "../state/useGameStore";
import { themeFor } from "./theme";

/**
 * The blade you start with.
 *
 * Fighting with empty hands made swings unreadable, there was nothing on
 * screen to connect the click to the damage. It also costs the ending its
 * contrast: a plain, mass-produced iron sword is exactly the thing the
 * generated relic is supposed to replace, so the player should be looking at
 * one for the whole fight.
 *
 * Built from primitives on purpose. Spending a Meshy generation on the starter
 * weapon would blur the one moment that matters.
 */
export function StarterWeapon() {
  const { camera } = useThree();
  const socket = useRef<Group>(null);
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);

  useFrame(({ clock }) => {
    const group = socket.current;
    if (!group) return;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);

    const sway = weaponSway(clock.getElapsedTime(), playerHandle.moving);

    let swing = 0;
    const attack = playerHandle.attacking;
    if (attack) {
      const spec = attackSpec(attack.kind);
      const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
      const t = Math.min(1, (performance.now() - attack.startedAt) / total);
      const windupPortion = spec.windupMs / total;
      // Pull back, then commit. Heavy swings travel further.
      const amplitude = attack.kind === "heavy" ? 2.9 : 2.1;
      swing =
        t < windupPortion
          ? -(t / windupPortion) * 0.6
          : Math.sin(((t - windupPortion) / (1 - windupPortion)) * Math.PI) * amplitude - 0.6;
    }

    group.translateX(0.32 + sway.x);
    group.translateY(-0.42 + sway.y);
    group.translateZ(-0.6);
    group.rotateX(0.18 - swing * 0.5);
    group.rotateY(-0.26);
    group.rotateZ(-0.34 - swing);
  });

  if (phase !== "FIGHTING") return null;

  return (
    <group ref={socket}>
      {/* grip */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.26, 10]} />
        <meshStandardMaterial color="#2a201a" roughness={0.95} />
      </mesh>
      {/* pommel */}
      <mesh position={[0, -0.16, 0]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color="#4a4038" roughness={0.6} metalness={0.7} />
      </mesh>
      {/* crossguard */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.32, 0.05, 0.07]} />
        <meshStandardMaterial color="#55493d" roughness={0.55} metalness={0.75} />
      </mesh>
      {/* blade */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.1, 0.92, 0.024]} />
        <meshStandardMaterial color="#8d8b86" roughness={0.35} metalness={0.9} />
      </mesh>
      {/* tip */}
      <mesh position={[0, 1.13, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.071, 0.071, 0.024]} />
        <meshStandardMaterial color="#8d8b86" roughness={0.35} metalness={0.9} />
      </mesh>
      {/* faint affinity glow along the fuller, so the starter still reads as
          belonging to the run you chose */}
      <mesh position={[0, 0.62, 0.014]}>
        <boxGeometry args={[0.016, 0.86, 0.004]} />
        <meshBasicMaterial color={theme.forge} toneMapped={false} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
