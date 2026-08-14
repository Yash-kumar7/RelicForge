import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, MeshBasicMaterial } from "three";
import type { WeaponClass } from "@relic/core";
import { HeldRelicMesh } from "./HeldRelicMesh";
import { IronSwordMesh } from "./IronSwordMesh";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";
import { bossState, bossSwing } from "./bossState";

/**
 * A weapon in a rigged character's hand, swinging under its own power.
 *
 * Rigging ships walking and running only, so there is no attack clip to play.
 * The hand supplies where the weapon is; this supplies how it moves, driven by
 * the same swing curve the hit test reads, which is the only reason an attack is
 * visible at all on a rigged character.
 *
 * The rest pose points the blade up and slightly across the body. Inheriting the
 * hand bone's rotation instead would hang it downward along the forearm.
 */

/**
 * Blade leaned out at rest, tipping forward and across as the swing travels.
 *
 * The rest pose leans well clear of vertical on purpose. A weapon is a line
 * through its grip, so an upright one runs parallel to a hanging arm and reads
 * as passing through it however far the socket is pushed out. Leaning it means
 * the shaft departs the body immediately above the hand, which is also how a
 * fighter actually carries a blade at rest.
 *
 * The swing multipliers are deliberately large. The weapon is a child of the body, so
 * it already inherits the body's turn, and a small extra rotation on top of that
 * is indistinguishable from the body moving on its own. To read as a swing
 * rather than as the weapon being carried through a turn, the blade has to
 * travel visibly further than its holder.
 */
function applySwing(group: Group, swing: number, scale = 1): void {
  group.rotation.x = -swing * 1.45 * scale;
  group.rotation.y = swing * 0.35 * scale;
  group.rotation.z = -swing * 0.8 * scale;
}

export function PlayerHandWeapon({
  held,
  accent,
}: {
  held: { url: string; weaponClass: WeaponClass } | null;
  accent: string;
}) {
  const arm = useRef<Group>(null);

  useFrame(() => {
    if (arm.current) applySwing(arm.current, swingProgress(playerHandle.attacking));
  });

  return (
    <group ref={arm}>
      {held ? (
        <HeldRelicMesh url={held.url} weaponClass={held.weaponClass} />
      ) : (
        <IronSwordMesh accent={accent} />
      )}
    </group>
  );
}

export function BossHandWeaponSwing({
  url,
  weaponClass,
}: {
  url: string;
  weaponClass: WeaponClass;
}) {
  const arm = useRef<Group>(null);

  const slash = useRef<Mesh>(null);

  useFrame(() => {
    const swing = bossSwing();
    if (arm.current) applySwing(arm.current, swing, 1.15);

    /**
     * A slash that appears only as the blow lands.
     *
     * The rotation alone competes with the boss's own body turn for attention.
     * An arc that exists for a fraction of a second and nowhere else is
     * unambiguous: it means the weapon just travelled through that space.
     */
    if (slash.current) {
      const striking = bossState.action === "strike";
      slash.current.visible = striking;
      if (striking) {
        const t = bossState.progress;
        slash.current.rotation.z = -1.1 + t * 2.2;
        const material = slash.current.material as MeshBasicMaterial;
        material.opacity = Math.sin(Math.min(1, t) * Math.PI) * 0.75;
      }
    }
  });

  return (
    <group ref={arm} scale={1.15}>
      <HeldRelicMesh url={url} weaponClass={weaponClass} />

      {/* Sits along the blade, so the arc sweeps where the weapon sweeps. */}
      <mesh ref={slash} position={[0, 0.9, 0]} rotation={[0, 0, 0]} visible={false}>
        <torusGeometry args={[1.1, 0.05, 6, 24, Math.PI * 0.8]} />
        <meshBasicMaterial color="#ffd9b3" transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
