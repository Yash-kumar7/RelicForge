import { Suspense, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import type { WeaponClass } from "@relic/core";
import { HeldRelicMesh } from "./HeldRelicMesh";
import { bossSwing } from "./bossState";

/**
 * A boss's generated weapon, socketed at its estimated right hand.
 *
 * The bosses were generated with "no weapons in hand" to keep the meshes clean,
 * which left them slamming their bodies at the player. Each weapon is a separate
 * generation so it can be positioned rather than fused, and it runs through the
 * same canonicalization a relic does, so the grip really is the grip.
 *
 * Renders nothing when a boss has no weapon generated yet, so the fight never
 * depends on the asset existing.
 */
export function BossWeapon({
  slug,
  weaponClass,
  height,
}: {
  slug: string;
  weaponClass: WeaponClass;
  height: number;
}) {
  const url = `/assets/bosses/${slug}/weapon.glb`;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url, { method: "HEAD" })
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!available) return null;

  return (
    <Suspense fallback={null}>
      <SwingingWeapon url={url} weaponClass={weaponClass} height={height} />
    </Suspense>
  );
}

/**
 * The weapon arm, driven by the boss's published action.
 *
 * Oversized relative to the wielder on purpose: a two-handed slab of stone
 * should look like it takes a boss to lift.
 */
function SwingingWeapon({
  url,
  weaponClass,
  height,
}: {
  url: string;
  weaponClass: WeaponClass;
  height: number;
}) {
  const arm = useRef<Group>(null);

  useFrame(() => {
    if (!arm.current) return;
    const swing = bossSwing();
    // Overhead arc: the weapon rises behind the shoulder and comes down across
    // the body, travelling far enough to read at third-person distance.
    arm.current.rotation.x = 0.25 - swing * 1.05;
    arm.current.rotation.z = -0.35 - swing * 0.45;
    arm.current.position.z = 0.2 + Math.max(0, swing) * 0.45;
    arm.current.position.y = height * 0.42 + Math.max(0, -swing) * 0.35;
  });

  return (
    <group
      ref={arm}
      position={[height * 0.3, height * 0.42, 0.2]}
      rotation={[0.25, 0, -0.35]}
      scale={1.45}
    >
      <HeldRelicMesh url={url} weaponClass={weaponClass} />
    </group>
  );
}
