import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Euler, Group, LoopRepeat, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { fitCharacter } from "../lib/characterFit";
import type { HandSocketRatios } from "./handSockets";

type HandBone = HandSocketRatios["bone"];

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
   * Rendered into the skeleton's weapon hand, so a weapon travels with the hand
   * through the animation instead of hanging in the air beside it.
   */
  children?: ReactNode;
  /** Which hand closed around a weapon when this character was generated. */
  handBone?: HandBone;
}

/**
 * Meshy rigs use standard humanoid bone names, so the hand can be found by name
 * rather than by guessing at an index. Several spellings are checked because a
 * rig is third-party output and naming conventions differ between exporters.
 *
 * Which hand is not assumed. The characters are generated with one fist closed,
 * and the image model does not reliably honour "the right hand": Ember came back
 * holding with its left. Nothing in the mesh tells a closed fist from an open
 * one, so the caller passes the bone recorded in handSockets.ts.
 */
const HAND_PATTERNS: Record<HandBone, RegExp[]> = {
  RightHand: [/^righthand$/i, /right.?hand/i, /hand.?r$/i, /mixamorig.*righthand/i],
  LeftHand: [/^lefthand$/i, /left.?hand/i, /hand.?l$/i, /mixamorig.*lefthand/i],
};

function findHand(root: Object3D, bone: HandBone): Object3D | null {
  const patterns = HAND_PATTERNS[bone];
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (found) return;
    const name = node.name ?? "";
    if (patterns.some((pattern) => pattern.test(name))) found = node;
  });
  return found;
}

const IDLE_TIME_SCALE = 0.18;

/**
 * How far the grip sits outside the hand bone, as a fraction of the character's
 * height.
 *
 * The bone sits at the centre of the wrist, and normalizeRelic puts the grip at
 * the origin, so dropping the weapon straight onto the bone runs its shaft
 * through the hand. Worse, a weapon at rest is roughly upright and a hanging arm
 * is roughly vertical too, so the two are near parallel and the blade tracks the
 * whole length of the forearm rather than merely clipping a palm.
 *
 * Expressed against height rather than in world units because the same socket
 * carries a 1.8-unit champion and a boss half again as large.
 */
const HAND_CLEARANCE = 0.035;

/**
 * How far past the wrist the fist actually closes, as a fraction of height.
 *
 * The hand bone sits at the wrist, but fingers close further along the hand, so
 * a grip placed at the bone hangs behind the fist that is supposed to be holding
 * it: the knuckles end up level with the blade while the whole hilt dangles
 * below them.
 *
 * The direction is taken from the forearm rather than assumed, because the arm
 * moves. Whichever way the hand is pointing, the grip travels a little further
 * that way.
 */
const GRIP_REACH = 0.05;

/**
 * Rest pose of a carried weapon, relative to the hand.
 *
 * Applied on the socket rather than by the caller because only the socket knows
 * which side of the body the hand is on, and the lean has to be mirrored with
 * it. On these rigs the right hand sits at negative x, so a fixed negative roll
 * tips the blade toward positive x, which is straight across the torso: the
 * weapon leaned into the character instead of away from it, and pushing the
 * socket further out only moved the point it passed through.
 *
 * The swing is layered on top of this by the caller, so it reads as a swing
 * from a carried pose rather than replacing the pose.
 */
const REST_PITCH = -0.3;
const REST_ROLL = 0.5;

/**
 * Draws a marker where the weapon is being attached, via ?debug=socket.
 *
 * These rigs are third-party auto-rigs over generated meshes, so "the weapon
 * looks wrong in the hand" has two very different causes: the socket is not on
 * the hand, or the socket is on the hand and the weapon is posed badly around
 * it. They need opposite fixes and are impossible to tell apart by looking at a
 * weapon. A marker at the socket separates them in one glance.
 */
const SHOW_SOCKET =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "socket";

/**
 * Places its children at a bone's position, in the root's space.
 *
 * Position only. Rotation and scale are both discarded, for different reasons.
 *
 * Scale is an artefact of the FBX export pipeline these rigs come through, and
 * inheriting it made the weapon microscopic.
 *
 * Rotation is inherited, with an offset. It was discarded at first, on the
 * grounds that a hand bone points down the forearm so a blade taking its rotation
 * hangs along the arm, and that rigging ships no attack clip for the weapon to
 * take rotation from. Both are true and neither is a reason: the fix for a bone
 * pointing the wrong way is a fixed offset from the bone, which is what a socket
 * is in every engine that has one, and an attack is layered on top by the caller.
 *
 * Discarding it meant the weapon kept one angle in the character's frame while
 * the hand turned through the entire walk cycle, so it visibly slid through the
 * fist that was supposed to be holding it.
 */
function HandFollower({
  root,
  bone,
  height,
  children,
}: {
  root: RefObject<Group | null>;
  bone: Object3D;
  height: number;
  children: ReactNode;
}) {
  const socket = useRef<Group>(null);
  const inverse = useMemo(() => new Matrix4(), []);
  const local = useMemo(() => new Matrix4(), []);
  const position = useMemo(() => new Vector3(), []);
  const quaternion = useMemo(() => new Quaternion(), []);
  const scale = useMemo(() => new Vector3(), []);
  const forearmWorld = useMemo(() => new Vector3(), []);
  const handWorld = useMemo(() => new Vector3(), []);
  const reach = useMemo(() => new Vector3(), []);

  /*
   * The offset from the hand bone to the carried pose, solved once.
   *
   * The weapon used to take the bone's position and a fixed rotation, which is
   * why it slid through the hand while walking: the arm swings and the hand
   * turns through the whole cycle, and a blade that keeps one angle in the
   * character's frame has to pass through the fist that is supposedly holding
   * it. Every engine does this the other way round. The socket inherits the
   * hand's full transform and carries a fixed offset relative to it, so the
   * weapon is welded to the hand and the animation moves both.
   *
   * The offset is derived rather than authored: on the first frame the hand's
   * rotation is measured and the offset that takes it to the pose the blade
   * should rest in is solved for. That keeps the carried pose exactly what it
   * was, which was already tuned by eye, while making it hold through the
   * animation instead of only at one frame of it.
   */
  const restOffset = useRef<Quaternion | null>(null);
  const desired = useMemo(() => new Quaternion(), []);
  const boneRest = useMemo(() => new Quaternion(), []);

  useFrame(() => {
    const group = socket.current;
    const parent = root.current;
    if (!group || !parent) return;

    // Bone world transform, expressed relative to the character root so the
    // socket can live outside the scaled hierarchy.
    inverse.copy(parent.matrixWorld).invert();
    local.multiplyMatrices(inverse, bone.matrixWorld);
    local.decompose(position, quaternion, scale);

    group.position.copy(position);

    /*
     * Out of the limb, in the character's own frame.
     *
     * Which way is "out" is read from the bone rather than assumed, so a rig
     * that mirrors its skeleton pushes the weapon away from the body instead of
     * into it. The forward component keeps the shaft in front of the fingers,
     * which is where a hand closed around a grip would put it.
     */
    const outward = Math.sign(position.x) || 1;
    const clearance = height * HAND_CLEARANCE;
    group.position.x += outward * clearance;
    group.position.z += clearance * 0.8;

    /*
     * Along the forearm, out past the wrist, to where the fingers close.
     *
     * Falls back to doing nothing if the bone has no parent to measure against,
     * which is better than guessing a direction on a rig that does not have the
     * shape this assumes.
     */
    const forearm = bone.parent;
    if (forearm) {
      forearmWorld.setFromMatrixPosition(forearm.matrixWorld);
      handWorld.setFromMatrixPosition(bone.matrixWorld);
      reach.subVectors(handWorld, forearmWorld);
      if (reach.lengthSq() > 1e-8) {
        group.position.addScaledVector(reach.normalize(), height * GRIP_REACH);
      }
    }

    /*
     * Rotation inherited from the hand, plus the solved offset.
     *
     * The rest pose is still mirrored per side, so the blade leans away from the
     * body whichever hand holds it, and it is still the pose that was tuned by
     * eye. The difference is that it is now expressed relative to the hand
     * rather than to the character, so the arm can move.
     */
    if (!restOffset.current) {
      desired.setFromEuler(new Euler(REST_PITCH, 0, outward * REST_ROLL));
      boneRest.copy(quaternion).invert();
      restOffset.current = boneRest.multiply(desired);
    }
    group.quaternion.copy(quaternion).multiply(restOffset.current);
  });

  return (
    <group ref={socket}>
      {SHOW_SOCKET && (
        <mesh>
          <sphereGeometry args={[height * 0.03, 8, 8]} />
          <meshBasicMaterial color="#00ff88" toneMapped={false} depthTest={false} />
        </mesh>
      )}
      {children}
    </group>
  );
}

export function AnimatedCharacter({
  url,
  height,
  speed,
  children,
  handBone = "RightHand",
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
  const hand = useMemo(() => findHand(scene, handBone), [scene, handBone]);

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
        The weapon follows the hand rather than being parented to it.

        Parenting looked correct and rendered nothing: these rigs come through an
        FBX pipeline whose armature carries its own scale, so a child of a bone
        inherits that scale and ends up either microscopic or flung out of frame.
        Copying the bone's position and rotation each frame, and deliberately
        discarding its scale, gives the weapon the hand's motion while keeping
        its own size.
      */}
      {children && hand && (
        <HandFollower root={root} bone={hand} height={height}>
          {children}
        </HandFollower>
      )}
      {children && !hand && children}
    </group>
  );
}
