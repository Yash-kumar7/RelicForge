import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { weaponSway } from "@relic/core";
import { playerHandle } from "./Player";
import { firstPersonSwingPose, swingProgress } from "./swing";
import { useGameStore } from "../state/useGameStore";
import { themeFor } from "./theme";

/**
 * Armoured gauntlets and forearms.
 *
 * First person means there is no character model, which is efficient but leaves
 * the player feeling like a floating camera. Hands fix that far more cheaply
 * than a rigged body would: you see arms swing the blade, so the swing belongs
 * to someone.
 *
 * The right hand tracks the weapon; the left rides slightly behind for a
 * two-handed grip on greatswords and a guard position otherwise.
 */
export function PlayerHands({ twoHanded = true }: { twoHanded?: boolean }) {
  const { camera } = useThree();
  const rig = useRef<Group>(null);
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);

  useFrame(({ clock }) => {
    const group = rig.current;
    if (!group) return;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);

    const sway = weaponSway(clock.getElapsedTime(), playerHandle.moving);

    const swing = swingProgress(playerHandle.attacking);

    // Matches StarterWeapon and WeaponSocket exactly, so hands and blade move
    // as one object rather than drifting apart mid-swing.
    group.translateX(0.32 + sway.x);
    group.translateY(-0.42 + sway.y);
    group.translateZ(-0.6);
    const [pitch, yaw, roll] = firstPersonSwingPose(swing);
    group.rotateX(0.18 + pitch);
    group.rotateY(-0.26 + yaw);
    group.rotateZ(-0.34 + roll);
  });

  if (phase !== "FIGHTING" && phase !== "EQUIPPED") return null;

  const Gauntlet = ({ offset }: { offset: [number, number, number] }) => (
    <group position={offset}>
      {/* fist */}
      <mesh>
        <boxGeometry args={[0.13, 0.14, 0.15]} />
        <meshStandardMaterial color="#3b332b" roughness={0.7} metalness={0.55} />
      </mesh>
      {/* knuckle plate */}
      <mesh position={[0, 0.05, 0.07]}>
        <boxGeometry args={[0.14, 0.05, 0.03]} />
        <meshStandardMaterial color="#594c3f" roughness={0.5} metalness={0.8} />
      </mesh>
      {/* forearm, angled back toward the shoulder so it reads as attached */}
      <mesh position={[0.02, -0.19, -0.1]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.115, 0.34, 0.12]} />
        <meshStandardMaterial color="#2e2822" roughness={0.8} metalness={0.45} />
      </mesh>
      {/* vambrace band, carrying the affinity colour */}
      <mesh position={[0.02, -0.13, -0.06]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.125, 0.04, 0.13]} />
        <meshStandardMaterial
          color="#151210"
          emissive={theme.forge}
          emissiveIntensity={0.6}
          roughness={0.6}
          metalness={0.6}
        />
      </mesh>
    </group>
  );

  return (
    <group ref={rig}>
      <Gauntlet offset={[0, 0.02, 0.03]} />
      {twoHanded && <Gauntlet offset={[-0.02, -0.17, 0.02]} />}
    </group>
  );
}
