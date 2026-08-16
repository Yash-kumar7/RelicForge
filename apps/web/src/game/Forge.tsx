import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";
import { asset } from "../lib/backend";

/**
 * The forge, as a generated mesh with the boxes kept as a fallback.
 *
 * This is the object the whole game points at: the boss dies, the arena dims, and
 * the only warm light left in the scene is the thing about to make your weapon.
 * It was two boxes and a glowing panel, which was fine while the question was
 * whether the pipeline worked and is not fine in the frame the demo ends on.
 *
 * The primitive version stays, and not as politeness. A fresh clone with an empty
 * storage directory has no arena assets, so the arena has to stand up without
 * them, exactly as the champion viewer renders nothing rather than a broken
 * model.
 */

/*
 * Served by Fastify out of the storage directory, like every other generated
 * asset. Copying it into web/public looked equivalent and is not: vite proxies
 * /assets straight through to the API, so anything in public under that prefix
 * is shadowed and 404s, and this would have silently fallen back to the boxes
 * forever.
 */
const MODEL_URL = asset("/assets/arena/forge/model.glb");

/** How tall the forge should stand, in metres. Scaled to this, never trusted. */
const HEIGHT = 3.4;

/**
 * Fitted from the mesh rather than guessed.
 *
 * Meshy returns whatever scale the concept implied, and a forge that arrives 40
 * units tall is not a forge, it is a wall. Measuring the bounding box and solving
 * for a known height is the same approach the relic normalizer takes, and for the
 * same reason: the number cannot be assumed, so it is read.
 */
function GeneratedForge() {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => scene.clone(true), [scene]);

  const fit = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const scale = size.y > 0 ? HEIGHT / size.y : 1;
    // Sat on the floor by its own base, not by its centre.
    return { scale, y: -box.min.y * scale };
  }, [model]);

  /*
   * Nothing here reacts to the forge waking up.
   *
   * The mouth is emissive in the texture, so what changes when the boss dies is
   * the point light in front of it and the arena dimming around it, both of which
   * the arena already owns. Tinting the mesh as well would fight the texture.
   */
  return (
    <group position={[0, fit.y, 0]} scale={fit.scale}>
      <primitive object={model as unknown as Group} />
    </group>
  );
}

/** The primitive forge, kept for clones with no generated assets. */
function BoxForge({
  active,
  stone,
  glow,
}: {
  active: boolean;
  stone: string;
  glow: string;
}) {
  return (
    <group>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[3.4, 2.2, 1.6]} />
        <meshStandardMaterial color={stone} roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.35, 0.85]}>
        <boxGeometry args={[1.8, 1.2, 0.2]} />
        <meshStandardMaterial
          color={glow}
          emissive={glow}
          emissiveIntensity={active ? 3.2 : 0.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function Forge({
  active,
  stone,
  glow,
}: {
  /** True once the boss is dead and the forge is doing its work. */
  active: boolean;
  stone: string;
  glow: string;
}) {
  const [hasModel, setHasModel] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((res) => !cancelled && setHasModel(res.ok))
      .catch(() => !cancelled && setHasModel(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasModel === null || hasModel === false) {
    return <BoxForge active={active} stone={stone} glow={glow} />;
  }

  return (
    <Suspense fallback={<BoxForge active={active} stone={stone} glow={glow} />}>
      <GeneratedForge />
    </Suspense>
  );
}
