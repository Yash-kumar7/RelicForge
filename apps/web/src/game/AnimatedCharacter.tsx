import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import {
  Group,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
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
  /**
   * A standing clip, blended against the walk.
   *
   * Optional because it is bought separately: rigging includes walking and
   * running and nothing else, so a character without one falls back to the slow
   * walk rather than to nothing.
   */
  idleUrl?: string | undefined;
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
 * How much of the walk's arm swing the weapon arm keeps.
 *
 * Meshy ships one walk clip and it is an empty-handed walk: both arms swing
 * freely through the whole cycle. Put a sword in one of them and the blade goes
 * back and forth with it, which is what a swinging arm does and not what anyone
 * carrying a weapon does.
 *
 * Every engine solves this with layers, an override on the arm holding the
 * weapon over the locomotion underneath. There is no second clip to layer here,
 * so the arm is damped toward the pose it rests in instead: it keeps a little of
 * the walk, so it is not a mannequin arm bolted to a moving body, and loses the
 * travel that swings a blade around.
 */
const CARRY_DAMPING = 0.82;

/** The chain that swings a hand: shoulder, upper arm, forearm. */
const ARM_PATTERNS: Record<HandBone, RegExp[]> = {
  RightHand: [/^rightshoulder$/i, /^rightarm$/i, /^rightforearm$/i],
  LeftHand: [/^leftshoulder$/i, /^leftarm$/i, /^leftforearm$/i],
};

function findArm(root: Object3D, bone: HandBone): Object3D[] {
  const patterns = ARM_PATTERNS[bone];
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (patterns.some((pattern) => pattern.test(node.name ?? ""))) found.push(node);
  });
  return found;
}

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
 *
 * Cut to roughly a quarter of what it was, because most of it was compensating
 * for a bug rather than for anatomy. While the weapon held a fixed rotation in
 * the character's frame, an upright blade ran parallel to a hanging arm and
 * tracked the whole forearm, and the only way to stop that was to shove it
 * outward until it cleared the limb entirely. It cleared the hand too: the
 * weapon ended up floating a hand's width beside the fist rather than in it.
 *
 * With the rotation inherited from the bone the blade turns with the hand and
 * never runs along the arm, so the clearance only has to cover the thickness of a
 * palm. Some intersection with an open hand is correct: these rigs come back
 * A-posed with the fingers spread, and a shaft passing between spread fingers
 * reads as held, while a shaft floating clear of them reads as dropped.
 */
const HAND_CLEARANCE = 0.008;

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
 *
 * Also cut, for the same reason as the clearance above: at 0.05 of height it was
 * pushing the grip most of a hand's length past the knuckles, which put the
 * pommel where the fingertips are and the hand nowhere near the leather.
 */
const GRIP_REACH = 0.018;

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
    group.position.z += clearance * 0.4;

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
     * A fixed carried pose, in the character's frame. Mirrored per side, so the
     * blade leans away from the body whichever hand holds it.
     *
     * Inheriting the hand bone's rotation was tried, on the correct principle
     * that this is what a socket does in every engine, and it put both blades
     * flat and pointing backwards. The offset that maps the bone to the carried
     * pose has to be solved against a real animated frame, and there is no frame
     * where that is reliable: the first one runs before the mixer has written
     * anything, so it solves against the bind pose, and every frame after that
     * carries the animation's own rotation into the answer.
     *
     * It is also no longer needed. The reason inheritance was worth the risk was
     * that the walk swung the hand through its whole cycle and a fixed blade slid
     * through the fist. The arm is damped against the walk now and the character
     * stands still on its own clip, so the hand barely turns, and a fixed pose
     * holds.
     */
    group.rotation.set(REST_PITCH, 0, outward * REST_ROLL);
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

/**
 * Loads a second rigged GLB purely to lift its clip off it.
 *
 * The idle arrives as a whole animated character, mesh and all, but the mesh is
 * the same one already on screen. Only the clip is wanted, and it drives this
 * skeleton because both come off the same rig, so the bone names match exactly.
 *
 * It is a child component rather than a conditional useGLTF, because a hook
 * cannot be called only when a file happens to exist.
 */
function IdleClip({ url, onLoad }: { url: string; onLoad: (clip: AnimationClip) => void }) {
  const { animations } = useGLTF(url);

  useEffect(() => {
    const clip = animations[0];
    if (clip) onLoad(clip);
  }, [animations, onLoad]);

  return null;
}

export function AnimatedCharacter({
  url,
  height,
  speed,
  children,
  idleUrl,
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

  /*
   * Walk and stand, mixed rather than switched.
   *
   * Rigging ships walking and running and nothing else, so a character standing
   * still had no pose to hold: the walk was run at 18% instead, on the theory
   * that a very slow walk reads as breathing. It does not. It reads as a boss
   * marching on the spot, which is what it is, and a boss spends most of a fight
   * standing inside its own reach.
   */
  const [idle, setIdle] = useState<AnimationClip | null>(null);
  const clips = useMemo(() => (idle ? [...animations, idle] : animations), [animations, idle]);
  const { actions, names } = useAnimations(clips, root);
  const hand = useMemo(() => findHand(scene, handBone), [scene, handBone]);

  /*
   * The weapon arm, damped against the walk clip.
   *
   * It has to run after the mixer has written this frame's pose, or it corrects a
   * pose that is about to be overwritten and does nothing at all.
   *
   * Not by frame priority, which was the obvious way and is a trap. R3F treats
   * any priority above zero as "this subscription is taking over rendering" and
   * switches automatic rendering off entirely:
   *
   *   if (!state.internal.priority && state.gl.render) state.gl.render(...)
   *
   * One damping callback at priority 1 would therefore have frozen the canvas the
   * moment a rigged character loaded.
   *
   * Ordering comes from subscription order instead. Equal priorities keep the
   * order they were registered in, and useAnimations subscribes above this hook,
   * so the mixer has always written before this runs.
   *
   * The rest pose is captured on the first frame rather than read from the bind
   * pose, because these rigs arrive through an FBX pipeline whose bind pose is
   * not always the pose the clip returns to.
   */
  const arm = useMemo(() => findArm(scene, handBone), [scene, handBone]);
  const rest = useRef<Quaternion[] | null>(null);

  useFrame(() => {
    if (!arm.length) return;
    if (!rest.current) {
      rest.current = arm.map((bone) => bone.quaternion.clone());
      return;
    }
    arm.forEach((bone, i) => {
      const target = rest.current?.[i];
      if (target) bone.quaternion.slerp(target, CARRY_DAMPING);
    });
  });

  /* Both clips run at once and are balanced by weight, so a boss stepping toward
     you crossfades into a walk rather than snapping into one. */
  useEffect(() => {
    const running = names
      .map((name) => actions[name])
      .filter((action): action is NonNullable<typeof action> => Boolean(action));
    if (!running.length) return undefined;

    running.forEach((action, i) => {
      action.reset().setLoop(LoopRepeat, Infinity).play();
      // Standing is the safer opening pose: a character that arrives mid-stride
      // and then settles looks like it was interrupted.
      action.weight = i === 0 && running.length > 1 ? 0 : 1;
    });

    return () => {
      running.forEach((action) => action.fadeOut(0.2));
    };
  }, [actions, names]);

  useFrame((_, delta) => {
    const walk = names[0] ? actions[names[0]] : undefined;
    if (!walk) return;

    const standing = names[1] ? actions[names[1]] : undefined;
    if (!standing) {
      // No idle bought for this character, so the old behaviour stands: a very
      // slow walk is still better than a statue.
      walk.timeScale = speed <= 0.01 ? IDLE_TIME_SCALE : speed;
      return;
    }

    // Roughly a fifth of a second to change stance, either way.
    const rate = Math.min(1, delta * 5);
    const moving = speed > 0.01;
    walk.timeScale = Math.max(speed, 0.35);
    walk.weight += ((moving ? 1 : 0) - walk.weight) * rate;
    standing.weight += ((moving ? 0 : 1) - standing.weight) * rate;
  });

  return (
    <group ref={root}>
      <group position={fit.offset} scale={fit.scale}>
        <primitive object={scene} />
      </group>

      {idleUrl && <IdleClip url={idleUrl} onLoad={setIdle} />}

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
