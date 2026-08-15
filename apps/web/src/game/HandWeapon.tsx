import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, MeshBasicMaterial } from "three";
import type { WeaponClass } from "@relic/core";
import type { AttackKind } from "./combat";
import { HeldRelicMesh } from "./HeldRelicMesh";
import { IronSwordMesh } from "./IronSwordMesh";
import { IRON_SCALE } from "./weaponScale";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";
import { bossState, bossSwing } from "./bossState";
import { bossWeaponScale } from "./weaponScale";
import { bossWeaponHint } from "./orientationHints";
import type { OrientationHint } from "@relic/core";

/** An empty object rather than `hint: undefined`, for exactOptionalPropertyTypes. */
function hintProps(slug: string): { hint?: OrientationHint } {
  const hint = bossWeaponHint(slug);
  return hint ? { hint } : {};
}

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
/**
 * Light and heavy travel along different arcs, not the same arc at different
 * sizes, and both stay inside roughly a right angle of travel.
 *
 * The multipliers used to be far larger, on the theory that a swing has to
 * out-travel the body turn to read as a swing. That was true and overdone:
 * swingProgress peaks near 2.4, so a multiplier of 2.1 asked for about 150
 * degrees of rotation. The blade swept well past the boss and finished pointing
 * behind the player, which reads as the weapon swinging away from the target
 * rather than into it. Peak travel is now around 80 degrees, which still reads
 * clearly from third person and actually ends up where the hit lands.
 *
 * They used to share one curve scaled up, so a heavy read as a slightly bigger
 * light and the player had no way to tell from the animation which one had come
 * out. A light is a quick lateral cut, mostly yaw. A heavy is an overhead, mostly
 * pitch, and it drops further than it can be mistaken for.
 */
function applySwing(group: Group, swing: number, scale = 1, kind: AttackKind = "light"): void {
  if (kind === "heavy") {
    // Overhead: raised on the wind-up, driven down through the target.
    group.rotation.x = -swing * 0.62 * scale;
    group.rotation.y = swing * 0.1 * scale;
    group.rotation.z = -swing * 0.18 * scale;
    return;
  }

  // Lateral: pulled across the body, then cut through it.
  group.rotation.x = -swing * 0.16 * scale;
  group.rotation.y = swing * 0.58 * scale;
  group.rotation.z = -swing * 0.3 * scale;
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
    if (arm.current) {
      applySwing(
        arm.current,
        swingProgress(playerHandle.attacking),
        1,
        playerHandle.attacking?.kind ?? "light",
      );
    }
  });

  return (
    <group ref={arm}>
      {held ? (
        <HeldRelicMesh url={held.url} weaponClass={held.weaponClass} />
      ) : (
        <group scale={IRON_SCALE}>
          <IronSwordMesh accent={accent} />
        </group>
      )}
    </group>
  );
}

export function BossHandWeaponSwing({
  url,
  weaponClass,
  slug,
  height,
}: {
  url: string;
  weaponClass: WeaponClass;
  /** Selects the orientation hint for weapons the heuristic cannot resolve. */
  slug: string;
  /** The boss's own height, which its weapon is sized against. */
  height: number;
}) {
  const arm = useRef<Group>(null);

  const slash = useRef<Mesh>(null);

  useFrame(() => {
    const swing = bossSwing();
    // The boss only has one attack, and it is a heavy one.
    /*
     * A wider arc than the player's.
     *
     * A boss is two and a half times a champion's height and is watched from
     * further away, so the same rotation covers less of the screen and reads as
     * a twitch rather than a blow coming at you.
     */
    if (arm.current) applySwing(arm.current, swing, 1.35, "heavy");

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
    <group ref={arm} scale={bossWeaponScale(weaponClass, height)}>
      {/*
        The hint applies here too.

        This is the third place a boss weapon is drawn, after the ladder preview
        and the unrigged fallback, and it is the one the player actually fights.
        Fixing the other two left the weapon upright everywhere except in combat.
      */}
      <HeldRelicMesh url={url} weaponClass={weaponClass} {...hintProps(slug)} />

      {/* Sits along the blade, so the arc sweeps where the weapon sweeps. */}
      <mesh ref={slash} position={[0, 0.9, 0]} rotation={[0, 0, 0]} visible={false}>
        <torusGeometry args={[1.1, 0.05, 6, 24, Math.PI * 0.8]} />
        <meshBasicMaterial color="#ffd9b3" transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
