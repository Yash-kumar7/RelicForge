import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Euler, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { WeaponClass } from "@relic/core";
import { attackSpec, type AttackKind } from "./combat";
import { HeldRelicMesh } from "./HeldRelicMesh";
import { IronSwordMesh } from "./IronSwordMesh";
import { IRON_SCALE } from "./weaponScale";
import { playerHandle } from "./Player";
import { equipped } from "./equipped";
import { swingProgress } from "./swing";
import { bossState, bossSwing } from "./bossState";
import { bossWeaponScale } from "./weaponScale";
import { bossWeaponHint } from "./orientationHints";
import type { OrientationHint } from "@relic/core";

/** An empty object rather than `hint: undefined`, for exactOptionalPropertyTypes. */
function hintProps(slug: string): { hint?: OrientationHint } {
  const hint = bossWeaponHint(slug);
  return hint ? { hint } : {};
}

/**
 * A weapon in a rigged character's hand, swinging under its own power.
 *
 * Rigging ships walking and running only, so there is no attack clip to play.
 * The hand supplies where the weapon is; this supplies how it moves, driven by
 * the same swing curve the hit test reads, which is the only reason an attack is
 * visible at all on a rigged character.
 *
 * The rest pose points the blade up and slightly across the body. Inheriting the
 * hand bone's rotation instead would hang it downward along the forearm.
 */

/**
 * Blade leaned out at rest, tipping forward and across as the swing travels.
 *
 * The rest pose leans well clear of vertical on purpose. A weapon is a line
 * through its grip, so an upright one runs parallel to a hanging arm and reads
 * as passing through it however far the socket is pushed out. Leaning it means
 * the shaft departs the body immediately above the hand, which is also how a
 * fighter actually carries a blade at rest.
 *
 * The swing multipliers are deliberately large. The weapon is a child of the body, so
 * it already inherits the body's turn, and a small extra rotation on top of that
 * is indistinguishable from the body moving on its own. To read as a swing
 * rather than as the weapon being carried through a turn, the blade has to
 * travel visibly further than its holder.
 */
/**
 * Light and heavy travel along different arcs, not the same arc at different
 * sizes, and both stay inside roughly a right angle of travel.
 *
 * The multipliers used to be far larger, on the theory that a swing has to
 * out-travel the body turn to read as a swing. That was true and overdone:
 * swingProgress peaks near 2.4, so a multiplier of 2.1 asked for about 150
 * degrees of rotation. The blade swept well past the boss and finished pointing
 * behind the player, which reads as the weapon swinging away from the target
 * rather than into it. Peak travel is now around 80 degrees, which still reads
 * clearly from third person and actually ends up where the hit lands.
 *
 * They used to share one curve scaled up, so a heavy read as a slightly bigger
 * light and the player had no way to tell from the animation which one had come
 * out. A light is a quick lateral cut, mostly yaw. A heavy is an overhead, mostly
 * pitch, and it drops further than it can be mistaken for.
 */
/* Scratch, so a swing does not allocate a Euler every frame. */
const swingEuler = new Euler();

/** Prints where the blade really is, once per swing, with ?probe in the URL. */
const PROBE =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("probe");

/**
 * The swing, applied at the grip.
 *
 * The group sits at the grip, so the blade turns around the hand rather than
 * about its own middle, which is the difference between a swing and a propeller.
 */
/**
 * The arc, tunable from the URL.
 *
 * These numbers decide where a swing actually travels, and the one thing that
 * cannot be checked from the code is whether the blade ends up in the boss or in
 * the floor. The weapon is carried tip-down, a boss stands nearly three metres
 * tall, and its chest is around two: every one of those pulls the right answer in
 * a different direction, and the only reliable way to find it is to watch a swing
 * and change a number.
 *
 * So ?swing=lp,ly,lr,hp,hy,hr overrides all six, live, on reload. Pitch first,
 * then yaw, then roll; light before heavy. Negative pitch drops the tip, positive
 * lifts it, and yaw is what carries the blade across the body.
 *
 *   ?swing=0.16,0.58,-0.3,-0.62,0.1,-0.18   the current values, to start from
 *
 * Absent, the defaults below are used and nothing changes.
 */
const ARC = (() => {
  /*
   * Both arcs lift.
   *
   * These were negative, which drops the tip, and that was correct for a weapon
   * held out in front. This one is carried tip-down at rest — REST_PITCH is 163
   * degrees — and swingProgress has no backswing, so a negative pitch had the
   * blade starting low and travelling lower. It swung into the floor, every
   * time, and the boss it was aimed at is nearly three metres tall with its chest
   * around two.
   *
   * Positive pitch raises the tip through the arc, so the cut now comes up from
   * the carry and across into something standing above the player rather than
   * down into the ground in front of them.
   */
  /*
   * The arc carries the horizontal, and almost nothing else.
   *
   * Height is swingLift's job now: raised through the wind-up, driven down
   * through the strike. When both were lifting, the blade travelled up and only
   * up, and a cut that only rises is a scoop. Pitch here is a small downward
   * follow-through on top of that fall, not the fall itself.
   */
  const light = { pitch: -0.1, yaw: 0.62, roll: -0.3 };
  const heavy = { pitch: -0.2, yaw: 0.24, roll: -0.2 };
  if (typeof window === "undefined") return { light, heavy };

  const raw = new URLSearchParams(window.location.search).get("swing");
  if (!raw) return { light, heavy };

  const n = raw.split(",").map(Number);
  if (n.length !== 6 || n.some((v) => !Number.isFinite(v))) return { light, heavy };

  return {
    light: { pitch: n[0]!, yaw: n[1]!, roll: n[2]! },
    heavy: { pitch: n[3]!, yaw: n[4]!, roll: n[5]! },
  };
})();

function applySwing(group: Group, swing: number, scale = 1, kind: AttackKind = "light"): void {
  const arc = kind === "heavy" ? ARC.heavy : ARC.light;
  swingEuler.set(swing * arc.pitch * scale, swing * arc.yaw * scale, swing * arc.roll * scale);

  /*
   * The socket is aligned with the character, so these axes are already the
   * character's: rotating about Y means sweeping across the body.
   *
   * This briefly had to conjugate by the socket's rotation, back when the socket
   * inherited the hand bone's, because a hand bone points down the forearm and
   * the same rotation came out as a swing going backwards. The socket holds a
   * fixed pose again, so the conversion is gone with it.
   */
  group.quaternion.setFromEuler(swingEuler);
}

export function PlayerHandWeapon({
  held,
  accent,
}: {
  held: { url: string; weaponClass: WeaponClass } | null;
  accent: string;
}) {
  const arm = useRef<Group>(null);
  const slash = useRef<Mesh>(null);

  /*
   * Where the blade actually is, printed once per swing with ?probe.
   *
   * Every number in this file has been tuned by describing what a swing looked
   * like and adjusting a coefficient, which is guessing with extra steps. This
   * reports the only thing that matters: the world position of the weapon's tip
   * at the moment of peak swing, and how far that is from the boss. If the gap
   * is positive the sword cannot reach, and no arc will fix it.
   */
  const probed = useRef(0);

  useFrame(() => {
    if (arm.current) {
      const swing = swingProgress(playerHandle.attacking);
      applySwing(arm.current, swing, 1, playerHandle.attacking?.kind ?? "light");

      /*
       * Visible only while the blow is live.
       *
       * The same window the hit test uses, so the trail appears exactly when the
       * swing can connect and vanishes the instant it cannot. It sweeps through
       * its own rotation as it goes, which is what makes it read as travel
       * rather than as a shape switching on.
       */
      if (slash.current) {
        const attack = playerHandle.attacking;
        const material = slash.current.material as MeshBasicMaterial;

        if (attack) {
          const spec = attackSpec(attack.kind, equipped.traits);
          const since = performance.now() - attack.startedAt;
          const live = since >= spec.windupMs && since <= spec.windupMs + spec.activeMs;

          slash.current.visible = live;
          if (live) {
            const p = (since - spec.windupMs) / spec.activeMs;
            slash.current.rotation.z = -1.0 + p * 2.0;
            material.opacity = Math.sin(p * Math.PI) * 0.8;
          }
        } else {
          slash.current.visible = false;
        }
      }

      if (PROBE && playerHandle.attacking && swing > 1.6) {
        const at = playerHandle.attacking.startedAt;
        if (probed.current !== at) {
          probed.current = at;
          arm.current.updateWorldMatrix(true, true);

          /* The tip, not the grip: the group is the grip, so the blade extends
             along its local +Y by the carried length. */
          const box = new Box3().setFromObject(arm.current);
          const tip = new Vector3();
          box.getCenter(tip);
          tip.y = box.max.y;

          const grip = new Vector3().setFromMatrixPosition(arm.current.matrixWorld);

          console.log("[probe]", {
            swing: swing.toFixed(2),
            grip: `${grip.x.toFixed(2)}, ${grip.y.toFixed(2)}, ${grip.z.toFixed(2)}`,
            tip: `${tip.x.toFixed(2)}, ${tip.y.toFixed(2)}, ${tip.z.toFixed(2)}`,
            player: `${playerHandle.position.x.toFixed(2)}, ${playerHandle.position.z.toFixed(2)}`,
            /* How far the tip travels from the body, which is the number that
               decides whether a sword can touch anything at all. */
            tipFromPlayer: Math.hypot(
              tip.x - playerHandle.position.x,
              tip.z - playerHandle.position.z,
            ).toFixed(2),
            tipHeight: tip.y.toFixed(2),
            bladeSize: `${(box.max.x - box.min.x).toFixed(2)} x ${(box.max.y - box.min.y).toFixed(2)} x ${(box.max.z - box.min.z).toFixed(2)}`,
          });
        }
      }
    }
  });

  return (
    <group ref={arm}>
      {held ? (
        <HeldRelicMesh url={held.url} weaponClass={held.weaponClass} />
      ) : (
        <group scale={IRON_SCALE}>
          <IronSwordMesh accent={accent} />
        </group>
      )}

      {/*
        The trail, which is what a swing is read by.

        The boss has had one of these from the start and the player never did,
        and that is the whole reason its blows are legible and yours are not: a
        rotation competes with the body turn, the camera and everything else
        moving, while an arc that exists for a fifth of a second and at no other
        time can only mean one thing. The weapon went through that space.

        Every arc coefficient in this file was tuned trying to solve by rotation
        what the boss solves by drawing. Sits along the blade, so it sweeps where
        the weapon sweeps.
      */}
      <mesh ref={slash} position={[0, 0.55, 0]} visible={false}>
        <torusGeometry args={[0.75, 0.035, 6, 24, Math.PI * 0.85]} />
        <meshBasicMaterial color="#fff0d8" transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * How the weapon sits in a hanging hand.
 *
 * Measured against the fight camera rather than reasoned about: the hand bone's
 * rest orientation is whatever Meshy's rig produced, so the only way to find the
 * angle that carries a blade clear of the leg and the floor is to look.
 */
const REST_PITCH = -1.62;
const REST_ROLL = -0.25;

export function BossHandWeaponSwing({
  url,
  weaponClass,
  slug,
  height,
}: {
  url: string;
  weaponClass: WeaponClass;
  /** Selects the orientation hint for weapons the heuristic cannot resolve. */
  slug: string;
  /** The boss's own height, which its weapon is sized against. */
  height: number;
}) {
  const arm = useRef<Group>(null);

  const slash = useRef<Mesh>(null);

  useFrame(() => {
    const swing = bossSwing();
    // The boss only has one attack, and it is a heavy one.
    /*
     * A wider arc than the player's.
     *
     * A boss is two and a half times a champion's height and is watched from
     * further away, so the same rotation covers less of the screen and reads as
     * a twitch rather than a blow coming at you.
     */
    /*
     * Its own arc, not the player's heavy scaled up.
     *
     * Sharing the player's numbers at 1.35 against a swing that runs to 3.1 gave
     * roughly fifty degrees of pitch, fifty of roll and sixty of yaw, all at
     * once. Roll turns a sword about its own length, so at that size the blade
     * twirled while it travelled and the whole blow read as the weapon spinning
     * rather than being swung.
     *
     * A boss's blow should be one motion, legible from across an arena: mostly
     * an overhead drop, a little across the body, and almost no roll at all. The
     * player can afford a compound arc because the weapon is close to the camera
     * and small on screen; from ten metres it just reads as tumbling.
     */
    if (arm.current) {
      /* Steeper than the player's, so the blade comes down in front of the boss
         rather than reaching out past whatever it is aimed at. A tall attacker
         with a long weapon has to drop it, not extend it. */
      swingEuler.set(swing * -0.38, swing * 0.1, swing * -0.03);
      arm.current.quaternion.setFromEuler(swingEuler);
    }

    /**
     * A slash that appears only as the blow lands.
     *
     * The rotation alone competes with the boss's own body turn for attention.
     * An arc that exists for a fraction of a second and nowhere else is
     * unambiguous: it means the weapon just travelled through that space.
     */
    if (slash.current) {
      const striking = bossState.action === "strike";
      slash.current.visible = striking;
      if (striking) {
        const t = bossState.progress;
        slash.current.rotation.z = -1.1 + t * 2.2;
        const material = slash.current.material as MeshBasicMaterial;
        material.opacity = Math.sin(Math.min(1, t) * Math.PI) * 0.75;
      }
    }
  });

  return (
    <group ref={arm} scale={bossWeaponScale(weaponClass, height)}>
      {/*
        A rest pose, inside the swing.

        The weapon is parented to the rig's hand bone and canonicalized so the blade
        runs up +Y from the grip — which means it points wherever the hand points,
        and at rest a boss's arms hang at its sides. So the blade hung straight down:
        through its own leg, with the tip below the floor. It only looked right in
        the ladder preview, where the weapon is placed against the body rather than
        in a bone.

        Tipped back so the weapon rides up and away from the body the way anything
        heavy is carried when it is not being swung. It has to be a nested group:
        the swing writes the parent's quaternion outright every frame, so a rotation
        set on that group would be erased on the first frame.
      */}
      <group rotation={[REST_PITCH, 0, REST_ROLL]}>
        {/*
          The hint applies here too.

          This is the third place a boss weapon is drawn, after the ladder preview
          and the unrigged fallback, and it is the one the player actually fights.
          Fixing the other two left the weapon upright everywhere except in combat.
        */}
        <HeldRelicMesh url={url} weaponClass={weaponClass} {...hintProps(slug)} />
      </group>

      {/* Sits along the blade, so the arc sweeps where the weapon sweeps. */}
      <mesh ref={slash} position={[0, 0.9, 0]} rotation={[0, 0, 0]} visible={false}>
        <torusGeometry args={[1.1, 0.05, 6, 24, Math.PI * 0.8]} />
        <meshBasicMaterial color="#ffd9b3" transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
