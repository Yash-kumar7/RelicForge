import { useFrame, useThree } from "@react-three/fiber";
import { hitstop, shake } from "./feedback";

/**
 * Camera shake and hitstop.
 *
 * Applied after the player has written its own position for the frame, so the
 * shake is a visual offset and never corrupts the authoritative position used
 * for hit tests, otherwise a violent hit could shove you out of your own
 * attack range.
 */
export function CameraShake() {
  const { camera } = useThree();

  useFrame((_, delta) => {
    if (shake.magnitude <= 0.0001) return;

    const now = performance.now();
    // Hitstop: freeze the decay for a few frames so impact lands before the
    // shake starts falling off. This is what gives a heavy hit its weight.
    const frozen = now < hitstop.until;
    const m = shake.magnitude;

    camera.position.x += (Math.random() - 0.5) * m;
    camera.position.y += (Math.random() - 0.5) * m;
    camera.rotation.z += (Math.random() - 0.5) * m * 0.06;

    if (!frozen) shake.magnitude = Math.max(0, m - delta * 1.6);
  });

  return null;
}
