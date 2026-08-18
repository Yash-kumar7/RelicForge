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
   * This character's own swing, read every frame.
   *
   * A getter rather than a value, because React renders on state changes and a
   * swing changes on frames. Passed as a number it would be sampled once when
   * the component rendered and then held there, so the blade would lift only if
   * a render happened to land mid-swing.
   *
   * Lifts the weapon out of its carried tip-down pose so a cut travels through
   * the target rather than into the floor in front of it.
   */
  swing?: () => number;
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
 * Strips the turn out of a clip.
 *
 * Both of Meshy's clips animate Hips.rotation, which is root motion: the
 * animation decides which way the character is facing. That is fine when one
 * clip plays alone and wrong the moment two do, because the mixer blends the two
 * hips rotations by weight and lands somewhere between them, and each clip is
 * cycling, so the character turns left and right on the spot for as long as it
 * stands there. Both figures did it, which is the tell: it is in the clips, not
 * in either character.
 *
 * Facing belongs to the game. The player's comes from where the camera looks and
 * the boss's from where the player is, and neither is a thing an animation is
 * allowed a vote in. Translation is kept, so the body still rises and falls
 * through a step.
 */
function withoutRootTurn(clip: AnimationClip): AnimationClip {
  const stripped = clip.clone();
  stripped.tracks = stripped.tracks.filter(
    (track) => !/(^|\.)hips\.quaternion$/i.test(track.name),
  );
  return stripped;
}

/**
 * How quickly the weapon arm follows the clip. Low is a steady arm.
 *
 * Meshy ships one walk clip and it is an empty-handed walk: both arms swing
 * freely through the whole cycle. Put a sword in one of them and the blade goes
 * back and forth with it, which is what a swinging arm does and not what anyone
 * carrying a weapon does.
 *
 * Engines solve this by layering an override on the weapon arm over the
 * locomotion underneath. There is no second clip to layer here, so the arm is
 * low-pass filtered instead: each frame it moves a little of the way toward
 * whatever the animation asked for, so the slow content of the pose survives and
 * the fast swing averages out.
 *
 * Expressed as a time constant in seconds rather than a fraction per frame, and
 * sized against the measurement rather than picked. The idle turns the head
 * through 83 degrees on roughly a three second loop, and a first-order filter
 * passes a sway of period T at 1/sqrt(1 + (2*pi*tau/T)^2):
 *
 *   tau 0.2s   92% through   77 degrees of sway left
 *   tau 1.6s   29% through   24 degrees
 *   tau 3s     16% through   13 degrees
 *   tau 5s     10% through    8 degrees
 *
 * Eight degrees over three seconds reads as weight shifting, which is what an
 * idle is for. The first version moved 8% of the way each frame, which at 60fps
 * is a fifth of a second and let 92% of the fidget straight through: it filtered
 * nothing anybody could see. A fraction per frame is also silently frame-rate
 * dependent, so the same code steadies a different amount on a 144Hz monitor.
 *
 * An earlier attempt damped toward a reference pose captured on the first frame,
 * which is worse than doing nothing. That frame runs before the mixer has
 * written anything, so the reference was the bind pose, which for these rigs is
 * an A-pose with the arms out: the weapon arm was being dragged out sideways
 * into a T and fought back against the clip every frame, which is exactly the
 * blade lying flat and swinging through 180 degrees. Filtering needs no
 * reference pose at all, so there is nothing to capture at the wrong time.
 */
const STEADY_SECONDS = 5;

/**
 * Bones the filter holds steady: the weapon arm, and the torso.
 *
 * The arm is here because Meshy's walk is an empty-handed walk and swings a
 * carried blade around.
 *
 * The torso is here because of what the Idle action turned out to be. Measured
 * off the clip, it turns the head through 83 degrees and the hips through 79: it
 * is a character looking around a room, which is a fine idle for someone who is
 * not currently being hit by a boss, and reads as a fighter who cannot stand
 * still. The spine, neck and head are steadied so the fidget averages out and
 * the breathing underneath it survives.
 */
const STEADY_PATTERNS: Record<HandBone, RegExp[]> = {
  RightHand: [
    /^rightshoulder$/i,
    /^rightarm$/i,
    /^rightforearm$/i,
    /^spine/i,
    /^neck$/i,
    /^head$/i,
  ],
  LeftHand: [/^leftshoulder$/i, /^leftarm$/i, /^leftforearm$/i, /^spine/i, /^neck$/i, /^head$/i],
};

function findSteadied(root: Object3D, bone: HandBone): Object3D[] {
  const patterns = STEADY_PATTERNS[bone];
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
/*
 * Tip down, which is how a weapon is carried when it is not being used.
 *
 * These were -0.3 and 0.5, a blade held upright and leaned out from the body,
 * because the pose was chosen to keep an upright shaft clear of an arm hanging
 * beside it. That was solving the wrong problem: nobody stands holding a sword
 * point-at-the-sky, they let it hang.
 *
 * normalizeRelic returns every weapon blade-up with the grip at the origin, so
 * carrying it means turning it over. Pitch just short of a half turn puts the tip
 * at the ground and tilted a little back, and the roll takes it off the leg
 * rather than through it.
 */
const REST_PITCH = 2.85;
const REST_ROLL = 0.35;

/**
 * Where the blade travels to at the top of a swing, in REST_PITCH's frame.
 *
 * Rest is 2.85, which is tip-down. This was 1.35, a little under horizontal, on
 * the reasoning that a cut travels through a target rather than saluting it —
 * true of the moment of contact and wrong for the top of the arc, which is
 * where this number applies. Levelling out is not lifting: the blade rose from
 * hanging to flat and the swing still looked like it started at the floor.
 *
 * 0.5 carries it well above horizontal, so the wind-up genuinely raises the
 * weapon and the strike has somewhere to fall from. The fall through the target
 * is swingLift's second beat, not this.
 */
const SWING_PITCH = 0.5;

/**
 * Turns the carried pose live, with ?carry, and prints it.
 *
 * These two numbers are the last thing about a held weapon that cannot be
 * derived: everything else is measured off the rig or the mesh, and this is the
 * angle a blade is carried at, which only looks right or wrong. Guessing it and
 * having somebody else look has already cost several rounds, so it is tunable
 * instead. Arrow up and down pitch, left and right roll, shift for fine steps.
 */
const CARRY_TUNING =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("carry") !== null;

function useCarryPose(): { pitch: number; roll: number } {
  const [pose, setPose] = useState({ pitch: REST_PITCH, roll: REST_ROLL });

  useEffect(() => {
    if (!CARRY_TUNING) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.02 : 0.1;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [step, 0],
        ArrowDown: [-step, 0],
        ArrowRight: [0, step],
        ArrowLeft: [0, -step],
      };
      const move = moves[event.code];
      if (!move) return;
      event.preventDefault();
      setPose((current) => {
        const next = {
          pitch: Number((current.pitch + move[0]).toFixed(3)),
          roll: Number((current.roll + move[1]).toFixed(3)),
        };
        console.log(`const REST_PITCH = ${next.pitch};\nconst REST_ROLL = ${next.roll};`);
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return pose;
}

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
  hand,
  height,
  swing,
  children,
}: {
  /** This character's own swing, so a boss does not lift when the player cuts. */
  swing: (() => number) | undefined;
  root: RefObject<Group | null>;
  bone: Object3D;
  /** Which hand this is, which decides which way "away from the body" points. */
  hand: HandBone;
  height: number;
  children: ReactNode;
}) {
  const socket = useRef<Group>(null);
  const carry = useCarryPose();
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
    /*
     * Which side the weapon hand is on, from which hand it is.
     *
     * This was the sign of the hand's live x, read fresh every frame, and that is
     * the 180 degree flip: an arm crosses the middle of the body constantly, in
     * the walk, in the idle, and in every swing. The moment the hand passes x=0
     * the sign flips, the carried roll mirrors, and the blade snaps through a
     * half turn and back. It is not a rotation being animated, it is a constant
     * changing sign under the animation.
     *
     * Which hand a character grips with does not change, so it is read from the
     * bone name and stays put. These rigs put the right hand at negative x, which
     * the measured sockets in handSockets.ts agree on for all eight characters.
     */
    const outward = hand === "RightHand" ? -1 : 1;
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
    /*
     * The blade lifts out of the carry to swing.
     *
     * This set the carried pose unconditionally, every frame, and the carry is
     * tip-down at 163 degrees. The swing arc is applied to a group inside this
     * one, so it was rotating an already-down blade by another few degrees:
     * whatever the arm did, the sword stayed pointing at the floor and wagged
     * there. First person never had this problem, because it has no carry pose
     * to escape, which is exactly why the same swing read correctly there and
     * hit the ground here.
     *
     * So the pose itself gives way during a swing. Pitch travels from the carry
     * toward level, so the weapon comes up out of the hanging position first and
     * the arc happens from there, on a blade that is pointing at the thing being
     * hit rather than at the ground in front of it.
     */
    const lift = Math.min(1, Math.max(0, swing?.() ?? 0));
    const pitch = carry.pitch + (SWING_PITCH - carry.pitch) * lift;
    group.rotation.set(pitch, 0, outward * carry.roll * (1 - lift * 0.6));
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
  swing,
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
  const clips = useMemo(
    () => (idle ? [...animations, idle] : animations).map(withoutRootTurn),
    [animations, idle],
  );
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
   * Seeded from whatever the first frame holds and corrected from there, which
   * costs a few frames of settling and needs no assumption about what any
   * particular frame contains.
   */
  const arm = useMemo(() => findSteadied(scene, handBone), [scene, handBone]);
  const smoothed = useRef<Quaternion[] | null>(null);

  useFrame((_, delta) => {
    if (!arm.length) return;
    if (!smoothed.current) {
      smoothed.current = arm.map((bone) => bone.quaternion.clone());
      return;
    }

    // Exponential, so the amount of steadying is the same at any frame rate.
    const follow = 1 - Math.exp(-delta / STEADY_SECONDS);

    arm.forEach((bone, i) => {
      const filtered = smoothed.current?.[i];
      if (!filtered) return;
      // Follow the clip slowly, then write the followed value back: the bone ends
      // up at the average of the swing rather than anywhere in particular.
      filtered.slerp(bone.quaternion, follow);
      bone.quaternion.copy(filtered);
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
        <HandFollower root={root} bone={hand} hand={handBone} height={height} swing={swing}>
          {children}
        </HandFollower>
      )}
      {children && !hand && children}
    </group>
  );
}
