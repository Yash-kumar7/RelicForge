import { Suspense, useEffect, useState } from "react";
import type { WeaponClass } from "@relic/core";
import { HeldRelicMesh } from "./HeldRelicMesh";

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
      {/* Boss weapons are oversized relative to the wielder on purpose: a
          two-handed slab of stone should look like it takes a boss to lift. */}
      <group
        position={[height * 0.3, height * 0.42, 0.2]}
        rotation={[0.25, 0, -0.35]}
        scale={1.45}
      >
        <HeldRelicMesh url={url} weaponClass={weaponClass} />
      </group>
    </Suspense>
  );
}
