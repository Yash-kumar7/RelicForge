import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import type { WeaponClass } from "@relic/core";
import { HeldRelicMesh } from "./HeldRelicMesh";
import { IronSwordMesh } from "./IronSwordMesh";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";
import { bossSwing } from "./bossState";

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

/** Blade upright at rest, tipping forward and across as the swing travels. */
function applySwing(group: Group, swing: number): void {
  group.rotation.x = -0.25 - swing * 0.95;
  group.rotation.y = -0.18;
  group.rotation.z = -0.28 - swing * 0.55;
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

  useFrame(() => {
    if (arm.current) applySwing(arm.current, bossSwing());
  });

  return (
    <group ref={arm} scale={1.15}>
      <HeldRelicMesh url={url} weaponClass={weaponClass} />
    </group>
  );
}
