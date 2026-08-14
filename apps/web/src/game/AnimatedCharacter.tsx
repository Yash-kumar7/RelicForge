import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Group, LoopRepeat, type Object3D } from "three";
import { fitCharacter } from "../lib/characterFit";

/**
 * A rigged character playing its walk clip.
 *
 * Meshy's rigging ships walking and running animations free with the 5-credit
 * rig, which is what turns a boss that slides across the floor into one that
 * walks at you. Both clips arrive as separate skinned GLBs, so this loads the
 * walking one and drives speed with timeScale rather than downloading a second
 * six-megabyte file to play the same skeleton faster.
 *
 * There is no idle clip. Rather than freeze on a single frame, the walk is
 * slowed to a crawl when standing, which reads as breathing.
 */

export interface AnimatedCharacterProps {
  /** Walking GLB, which carries both the skinned mesh and the clip. */
  url: string;
  /** Target height in world units. */
  height: number;
  /** 0 while standing, 1 at walking pace, above 1 to run. */
  speed: number;
  /**
   * Rendered into the skeleton's right hand bone, so a weapon travels with the
   * hand through the animation instead of hanging in the air beside it.
   */
  children?: ReactNode;
}

/**
 * Meshy rigs use standard humanoid bone names, so the hand can be found by name
 * rather than by guessing at an index. Several spellings are checked because a
 * rig is third-party output and naming conventions differ between exporters.
 */
const RIGHT_HAND_PATTERNS = [/^righthand$/i, /right.?hand/i, /hand.?r$/i, /mixamorig.*righthand/i];

function findRightHand(root: Object3D): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (found) return;
    const name = node.name ?? "";
    if (RIGHT_HAND_PATTERNS.some((pattern) => pattern.test(name))) found = node;
  });
  return found;
}

const IDLE_TIME_SCALE = 0.18;

export function AnimatedCharacter({
  url,
  height,
  speed,
  children,
}: AnimatedCharacterProps) {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(url);

  /**
   * Skinned meshes cannot be cloned with scene.clone the way static ones can:
   * the clone shares the original skeleton and the two fight over bone
   * transforms. Only one of each character exists on screen at a time, so the
   * loaded scene is used directly.
   */
  const fit = useMemo(() => fitCharacter(scene as Group, height), [scene, height]);
  const { actions, names } = useAnimations(animations, root);
  const hand = useMemo(() => findRightHand(scene), [scene]);

  useEffect(() => {
    const first = names[0];
    if (!first) return undefined;
    const action = actions[first];
    if (!action) return undefined;

    action.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, names]);

  useEffect(() => {
    const first = names[0];
    const action = first ? actions[first] : undefined;
    if (!action) return;
    // Standing still still plays the clip, very slowly, so the character is
    // never a statue between steps.
    action.timeScale = speed <= 0.01 ? IDLE_TIME_SCALE : speed;
  }, [actions, names, speed]);

  return (
    <group ref={root}>
      <group position={fit.offset} scale={fit.scale}>
        <primitive object={scene} />
      </group>

      {/*
        Portalled into the hand bone rather than positioned near it. The bone is
        inside the fitted group, so its world transform already carries the
        character's scale; the weapon only has to undo that scale to stay its own
        size.
      */}
      {children && hand
        ? createPortal(<group scale={1 / (fit.scale || 1)}>{children}</group>, hand)
        : children}
    </group>
  );
}
