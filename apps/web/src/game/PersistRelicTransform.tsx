import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { WeaponClass, RelicTransform } from "@relic/core";
import { normalizeRelic } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { relicHintForUrl } from "./orientationHints";

/**
 * Computes and persists a relic's canonical transform, once, invisibly.
 *
 * Persistence used to be a side effect of the first-person weapon socket, which
 * meant it only happened in first person. Third person is the default, so the
 * transform was silently never saved and a re-equip recomputed it every time,
 * which is exactly the guarantee the design claimed to provide.
 *
 * Separating it from any view fixes that and is the right shape anyway: whether
 * a transform gets stored has nothing to do with which camera is active.
 */
export function PersistRelicTransform({
  modelUrl,
  weaponClass,
  onComputed,
}: {
  modelUrl: string;
  weaponClass: WeaponClass;
  onComputed: (transform: RelicTransform) => void;
}) {
  // The GLB is already in drei's cache by the time this mounts, since the relic
  // is on screen, so this costs a normalization pass and nothing else.
  const { scene } = useGLTF(modelUrl);

  const transform = useMemo(
    () => normalizeRelic(meshSampleFrom(scene), weaponClass, relicHintForUrl(modelUrl)),
    [scene, weaponClass, modelUrl],
  );

  useEffect(() => {
    onComputed(transform);
  }, [transform, onComputed]);

  return null;
}
