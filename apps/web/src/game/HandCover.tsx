import { Suspense, useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Vector3, type Group } from "three";

/**
 * A closed fist laid over an open one.
 *
 * Meshy's rigging does not skin the mesh you give it, it rebuilds it: the vertex
 * count changes, the silhouette gets wider and shorter, and the character comes
 * back A-posed with the hands opened. The rig has one bone per hand and no
 * fingers, so nothing at runtime can close them, and the closed fist survives
 * only in the unrigged mesh, which cannot walk. Every character is therefore
 * either animated with open hands or still with closed ones.
 *
 * This is the third option: cover the open hand with a generated closed one. It
 * is a prop, not a fix, and it only works if it sits close enough to the hand to
 * read as the hand. Tried on the Ashen Warden alone before it is done five times,
 * because it has to match armour it was never modelled against.
 *
 * The grip axis cannot be derived. A bounding box says how big the fist is and
 * nothing about which way the hole through it points, and that is exactly the
 * question, so it is tuned on screen with ?cover and pasted back here.
 */

/** Characters with a generated fist. Anything absent keeps its open hand. */
const COVERS: Record<string, { url: string; /** Fraction of height. */ size: number }> = {
  "ashen-warden": { url: "/assets/arena/warden-fist/model.glb", size: 0.13 },
};

/**
 * How the fist sits on the hand bone.
 *
 * The mesh comes back with the wrist at the bottom and the grip hole facing the
 * camera, so it has to be laid over so the hole runs along the weapon rather than
 * across it. These are the numbers ?cover writes to the console.
 */
const POSE = {
  rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
  offset: [0, 0, 0] as [number, number, number],
};

const TUNING =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("cover") !== null;

function Cover({ url, height, size }: { url: string; height: number; size: number }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);
  const [pose, setPose] = useState(POSE);

  /*
   * Fitted, like every other generated mesh here: Meshy normalises to its own
   * box, so the only reliable way to get a hand-sized hand is to measure and
   * solve for one.
   */
  const scale = useMemo(() => {
    const box = new Box3().setFromObject(model);
    const extent = Math.max(...box.getSize(new Vector3()).toArray());
    return extent > 0 ? (height * size) / extent : 1;
  }, [model, height, size]);

  /*
   * Arrow keys turn it, and the numbers print in the shape this file wants.
   *
   * Which way the hole through a fist points is not in the geometry, and the
   * loop of guessing an angle and having someone else look at it is the slowest
   * loop in this project. This ends it in one pass.
   */
  useEffect(() => {
    if (!TUNING) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.02 : Math.PI / 12;
      const turn: Partial<Record<string, [number, number, number]>> = {
        ArrowLeft: [0, -step, 0],
        ArrowRight: [0, step, 0],
        ArrowUp: [-step, 0, 0],
        ArrowDown: [step, 0, 0],
        BracketLeft: [0, 0, -step],
        BracketRight: [0, 0, step],
      };
      const delta = turn[event.code];
      if (!delta) return;
      event.preventDefault();
      setPose((current) => {
        const next = {
          ...current,
          rotation: current.rotation.map((r, i) => r + delta[i]!) as [number, number, number],
        };
        console.log(
          `  rotation: [${next.rotation.map((r) => r.toFixed(3)).join(", ")}] as [number, number, number],`,
        );
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <group position={pose.offset} rotation={pose.rotation} scale={scale}>
      <primitive object={model as unknown as Group} />
    </group>
  );
}

/**
 * Renders nothing for a character with no generated fist, which is every one of
 * them until this is proven on the Warden.
 */
export function HandCover({ slug, height }: { slug: string; height: number }) {
  const cover = COVERS[slug];
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!cover) return undefined;
    let cancelled = false;
    fetch(cover.url, { method: "HEAD" })
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [cover]);

  if (!cover || !available) return null;

  return (
    <Suspense fallback={null}>
      <Cover url={cover.url} height={height} size={cover.size} />
    </Suspense>
  );
}
