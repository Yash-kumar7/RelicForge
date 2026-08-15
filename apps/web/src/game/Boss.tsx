import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Vector3 } from "three";
import { useGameStore } from "../state/useGameStore";
import { COMBAT, isWithinArc } from "./combat";
import { BOSS_LIMIT, FORGE_POSITION, FORGE_RADIUS } from "./arenaGeometry";
import { glowTexture } from "./arenaFeatures";
import { playerHandle } from "./Player";
import { sfx } from "../audio/sfx";
import { themeForBoss } from "./theme";
import { registerPlayerHurt, registerTelegraph } from "./feedback";
import { setBossAction, BOSS_SPAWN } from "./bossState";
import { bossAt } from "./bosses";
import { BossModel } from "./BossModel";
import { BossWeapon, BossHandWeapon } from "./BossWeapon";
import { BOSS_HEIGHT } from "./BossModel";
import { BossDamagePopups } from "./BossDamagePopups";

/**
 * The Ashen Warden.
 *
 * Still primitives, spending Meshy generations on the boss would blur the one
 * moment that matters, but arranged to read as a hulking armoured figure
 * rather than a capsule: heavy torso, pauldrons, horns, an exposed core, and a
 * ring of broken plates orbiting on their own axis.
 *
 * Behaviour is a three-state loop. Readability beats depth here: the player has
 * to see the wind-up coming for dodging to be a real decision, and surviving at
 * 8% health has to feel earned rather than arbitrary.
 */

type BossState = "APPROACH" | "TELEGRAPH" | "STRIKE" | "RECOVER" | "DYING";

export interface BossHandle {
  position: () => Vector3;
  hit: (kind: "light" | "heavy") => void;
}

export const Boss = forwardRef<BossHandle>(function Boss(_props, ref) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const dangerRing = useRef<Mesh>(null);
  const plates = useRef<Group>(null);
  const dangerEdge = useRef<MeshBasicMaterial>(null);
  const dangerFill = useRef<MeshBasicMaterial>(null);
  const coreMesh = useRef<Mesh>(null);
  const coreLight = useRef<PointLight>(null);
  const position = useRef(new Vector3(BOSS_SPAWN.x, BOSS_SPAWN.y, BOSS_SPAWN.z));
  const state = useRef<BossState>("APPROACH");
  const stateUntil = useRef(0);
  const hitFlash = useRef(0);
  const stagger = useRef(0);
  const knockback = useRef(new Vector3());
  const deathAt = useRef(0);

  const phase = useGameStore((s) => s.phase);
  const bossHp = useGameStore((s) => s.bossHp);
  const combatActive = useGameStore((s) => s.combatActive);
  const bossLevel = useGameStore((s) => s.bossLevel);
  const theme = themeForBoss(bossLevel ?? 1);
  // Resolved once per run rather than recomputed every frame. Faster bosses
  // also telegraph for less time, which is what actually makes them harder.
  const tuning = useMemo(() => {
    const level = bossAt(bossLevel ?? 1);
    return {
      damage: Math.round(COMBAT.boss.damage * level.damage),
      moveSpeed: COMBAT.boss.moveSpeed * level.speed,
      telegraphMs: Math.round(COMBAT.boss.telegraphMs / level.speed),
    };
  }, [bossLevel]);

  useImperativeHandle(ref, () => ({
    position: () => position.current,
    hit: (kind) => {
      hitFlash.current = 1;
      // Heavy hits visibly rock it. Without a reaction the boss absorbs
      // everything silently and the fight feels inert no matter the numbers.
      stagger.current = kind === "heavy" ? 1 : 0.45;
      const away = new Vector3()
        .subVectors(position.current, playerHandle.position)
        .setY(0)
        .normalize();
      knockback.current.addScaledVector(away, kind === "heavy" ? 0.55 : 0.2);
    },
  }));

  // A generated model replaces the primitive body when one exists for this
  // level; the primitives stay as the fallback so a missing generation
  // degrades the look without breaking the fight.
  const [hasModel, setHasModel] = useState(false);
  const [walking, setWalking] = useState(0);
  const onModelLoaded = useCallback((loaded: boolean) => setHasModel(loaded), []);
  const bossSlug = useMemo(
    () => bossAt(bossLevel ?? 1).title.toLowerCase().replace(/^the /, "").replace(/\s+/g, "-"),
    [bossLevel],
  );

  const brokenPlates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        key: i,
        angle: (i / 7) * Math.PI * 2,
        radius: 1.5 + ((i * 13) % 5) / 12,
        height: ((i * 29) % 9) / 7 - 0.3,
        size: 0.22 + ((i * 17) % 7) / 26,
      })),
    [],
  );

  useFrame((_, rawDelta) => {
    // Same ceiling as the player: a backgrounded tab must not let the boss
    // cross the arena in a single frame.
    const delta = Math.min(rawDelta, 0.05);
    const now = performance.now();
    const g = group.current;
    if (!g) return;

    const dead = bossHp <= 0;
    if (dead && state.current !== "DYING") {
      state.current = "DYING";
      deathAt.current = now;
    }

    if (state.current === "DYING") {
      // Collapse rather than a death animation, no rig, no clips.
      const t = Math.min(1, (now - deathAt.current) / 1600);
      g.position.y = -t * 2.4;
      g.rotation.z = t * 0.6;
      g.scale.setScalar(1 - t * 0.3);
      if (plates.current) {
        plates.current.scale.setScalar(1 + t * 2.4);
        plates.current.rotation.y += delta * 2.2;
      }
      const material = coreMesh.current?.material as MeshStandardMaterial | undefined;
      if (material) material.emissiveIntensity = Math.max(0, 5 * (1 - t));
      return;
    }

    // Damage reactions keep resolving even while combat is frozen, so a hit
    // landed on the frame before a pause still plays out.
    if (stagger.current > 0) stagger.current = Math.max(0, stagger.current - delta * 3.4);
    if (hitFlash.current > 0) hitFlash.current = Math.max(0, hitFlash.current - delta * 5);
    knockback.current.multiplyScalar(1 - Math.min(1, delta * 9));
    position.current.add(knockback.current);

    /**
     * The boss needs the same arena bound the player has.
     *
     * Knockback moved it and nothing held it in, so a heavy hit near the edge
     * shoved it through the wall and the fight continued with the boss standing
     * outside the arena. Kept slightly further in than the player's limit,
     * because it is a wider body.
     */
    const bossRadial = Math.hypot(position.current.x, position.current.z);
    const bossLimit = BOSS_LIMIT;
    if (bossRadial > bossLimit) {
      const scale = bossLimit / bossRadial;
      position.current.x *= scale;
      position.current.z *= scale;
      // Kill the outward component too, or it presses against the wall every
      // frame and slides along it.
      knockback.current.multiplyScalar(0.2);
    }

    /*
     * The forge stops the boss too.
     *
     * Only the player was pushed out of it at first, which is worse than nobody
     * being: a solid object one body respects and the other stands inside reads
     * as a bug rather than as scenery. The boss is the wider figure, so it keeps
     * a little more clearance.
     */
    const fromForge = Math.hypot(
      position.current.x - FORGE_POSITION.x,
      position.current.z - FORGE_POSITION.z,
    );
    const bossClearance = FORGE_RADIUS + 0.9;
    if (fromForge < bossClearance && fromForge > 0.0001) {
      const push = bossClearance / fromForge;
      position.current.x = FORGE_POSITION.x + (position.current.x - FORGE_POSITION.x) * push;
      position.current.z = FORGE_POSITION.z + (position.current.z - FORGE_POSITION.z) * push;
      knockback.current.multiplyScalar(0.2);
    }

    if (phase !== "FIGHTING" || !combatActive) return;

    const toPlayer = new Vector3().subVectors(playerHandle.position, position.current);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const forward = toPlayer.clone().normalize();

    switch (state.current) {
      case "APPROACH": {
        // Staggering interrupts the advance, which is what makes a heavy
        // attack worth its slower wind-up.
        const speed = tuning.moveSpeed * (1 - stagger.current * 0.8);
        if (distance > COMBAT.boss.preferredRange) {
          position.current.addScaledVector(forward, speed * delta);
          // Drives the walk clip, so the feet move at the speed the body does.
          setWalking((current) => (current < 0.99 ? 1 : current));
        } else {
          setWalking((current) => (current > 0.01 ? 0 : current));
          state.current = "TELEGRAPH";
          stateUntil.current = now + tuning.telegraphMs;
          sfx.telegraph();
          registerTelegraph();
        }
        break;
      }
      case "TELEGRAPH": {
        position.current.addScaledVector(forward, tuning.moveSpeed * 0.25 * delta);
        if (now >= stateUntil.current) {
          state.current = "STRIKE";
          stateUntil.current = now + COMBAT.boss.activeMs;
          sfx.bossSwing();

          const hit = isWithinArc(
            { x: position.current.x, z: position.current.z },
            { x: forward.x, z: forward.z },
            { x: playerHandle.position.x, z: playerHandle.position.z },
            COMBAT.boss.reach,
            120,
          );
          // i-frames from a dodge are checked here, at the moment of impact.
          if (hit && now >= playerHandle.invulnerableUntil) {
            useGameStore.getState().damagePlayer(tuning.damage);
            sfx.playerHurt();
            registerPlayerHurt(tuning.damage);
          }
        }
        break;
      }
      case "STRIKE": {
        if (now >= stateUntil.current) {
          state.current = "RECOVER";
          stateUntil.current = now + COMBAT.boss.recoveryMs;
        }
        break;
      }
      case "RECOVER": {
        if (now >= stateUntil.current) state.current = "APPROACH";
        break;
      }
    }

    g.position.set(position.current.x, position.current.y, position.current.z);
    g.lookAt(playerHandle.position.x, 0, playerHandle.position.z);

    const lunge = state.current === "STRIKE" ? 0.6 : 0;
    g.position.addScaledVector(forward, lunge);

    /**
     * Published before presentation so the weapon, which renders in its own
     * component, moves on the same frame as the body rather than one behind.
     */
    if (state.current === "TELEGRAPH") {
      setBossAction("telegraph", 1 - (stateUntil.current - now) / tuning.telegraphMs);
    } else if (state.current === "STRIKE") {
      setBossAction("strike", 1 - Math.max(0, (stateUntil.current - now) / COMBAT.boss.activeMs));
    } else if (state.current === "RECOVER") {
      setBossAction("recover", 1 - Math.max(0, (stateUntil.current - now) / COMBAT.boss.recoveryMs));
    } else {
      setBossAction("idle", 0);
    }

    /* -------------------------------------------------------- presentation */
    const charge =
      state.current === "TELEGRAPH"
        ? 1 - (stateUntil.current - now) / tuning.telegraphMs
        : state.current === "STRIKE"
          ? 1
          : 0;

    if (body.current) {
      /**
       * The attack has to be legible from across the arena, and it has to work
       * on a generated mesh that has no rig - so the whole body performs it.
       *
       * Wind-up: rears back and up, growing, like something loading a swing.
       * Strike: slams forward past vertical, hard and fast.
       * Stagger: rocks back independently of either.
       */
      const striking = state.current === "STRIKE";
      const strikeT = striking
        ? 1 - Math.max(0, (stateUntil.current - now) / COMBAT.boss.activeMs)
        : 0;

      body.current.rotation.x =
        (striking ? strikeT * 0.55 : -charge * 0.42) + stagger.current * 0.3;
      body.current.position.y = striking ? -strikeT * 0.5 : charge * 0.35;
      body.current.scale.setScalar(1 + charge * 0.12 - strikeT * 0.05);
      body.current.rotation.z = striking ? Math.sin(strikeT * Math.PI) * 0.22 : charge * -0.12;
      // A shoulder turn, so the swing comes from the body rather than the arm
      // alone. Without it a huge armoured figure appears to flick its wrist.
      body.current.rotation.y = striking ? -strikeT * 0.45 : charge * 0.3;
    }

    /**
     * Ground telegraph. The single clearest signal that something is about to
     * happen: a ring that grows and brightens under the boss during the
     * wind-up, then snaps to full size on the strike. Without it a player
     * simply watches their health drop with no idea what hit them.
     */
    if (dangerRing.current) {
      const striking = state.current === "STRIKE";
      const visible = state.current === "TELEGRAPH" || striking;
      dangerRing.current.visible = visible;
      if (visible) {
        const scale = striking ? 1 : 0.35 + charge * 0.65;
        dangerRing.current.scale.setScalar(scale);
        // Tinted by affinity so an ember fight and a frost fight do not
        // telegraph identically.
        const colour = new Color(striking ? "#ffffff" : theme.bossCore);
        if (dangerEdge.current) {
          dangerEdge.current.opacity = striking ? 0.9 : 0.25 + charge * 0.45;
          dangerEdge.current.color = colour;
        }
        if (dangerFill.current) {
          // The fill stays well under the edge. It is the thing that says the
          // blow is coming; the edge is the thing that says where it stops.
          dangerFill.current.opacity = striking ? 0.5 : 0.08 + charge * 0.26;
          dangerFill.current.color = colour;
        }
      }
    }

    if (plates.current) {
      // The armour agitates before it swings.
      plates.current.rotation.y += delta * (state.current === "TELEGRAPH" ? 2.6 : 0.5);
    }

    const material = coreMesh.current?.material as MeshStandardMaterial | undefined;
    if (material) {
      material.emissiveIntensity = 0.4 + (charge || 0.15) * 5 + hitFlash.current * 4;
      material.emissive = new Color(hitFlash.current > 0.4 ? "#ffffff" : theme.bossCore);
    }

    // The light carries the same signal, which is what keeps a generated boss
    // readable without a sphere bolted to its chest.
    if (coreLight.current) {
      coreLight.current.intensity = 6 + charge * 16 + hitFlash.current * 22;
      coreLight.current.color = new Color(hitFlash.current > 0.4 ? "#ffffff" : theme.bossCore);
    }
  });

  return (
    <group ref={group} position={[0, 0, -4]}>
      <group ref={body}>
        <BossModel slug={bossSlug} walking={walking} onLoaded={onModelLoaded}>
          {/* Position from the hand bone, rotation from the boss's own swing
              curve, since a rig has no attack clip to play. */}
          <BossHandWeapon
            slug={bossSlug}
            weaponClass={bossAt(bossLevel ?? 1).weaponClass}
            height={BOSS_HEIGHT}
          />
        </BossModel>

        {/* Primitive fallback, hidden the moment a generated mesh loads. */}
        <group visible={!hasModel}>
        <mesh position={[0, 1.9, 0]} castShadow>
          <boxGeometry args={[1.5, 1.9, 1.1]} />
          <meshStandardMaterial color="#241c17" roughness={0.85} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[1.05, 1.1, 0.85]} />
          <meshStandardMaterial color="#1b1511" roughness={0.9} metalness={0.2} />
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]}>
            <boxGeometry args={[0.42, 0.9, 0.5]} />
            <meshStandardMaterial color="#181310" roughness={0.95} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`pauldron${side}`} position={[side * 1.05, 2.6, 0]} rotation={[0, 0, side * 0.4]}>
            <boxGeometry args={[0.85, 0.55, 1.15]} />
            <meshStandardMaterial color="#2c231c" roughness={0.75} metalness={0.5} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`arm${side}`} position={[side * 1.0, 1.6, 0.1]}>
            <boxGeometry args={[0.42, 1.5, 0.44]} />
            <meshStandardMaterial color="#1f1913" roughness={0.9} metalness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 3.15, 0]}>
          <boxGeometry args={[0.72, 0.62, 0.72]} />
          <meshStandardMaterial color="#15100d" roughness={0.9} metalness={0.4} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={`horn${side}`}
            position={[side * 0.34, 3.55, -0.05]}
            rotation={[-0.35, 0, side * 0.55]}
          >
            <coneGeometry args={[0.11, 0.75, 6]} />
            <meshStandardMaterial color="#3a2f26" roughness={0.7} metalness={0.4} />
          </mesh>
        ))}
        {[-0.17, 0.17].map((x) => (
          <mesh key={`eye${x}`} position={[x, 3.18, 0.37]}>
            <boxGeometry args={[0.12, 0.05, 0.03]} />
            <meshBasicMaterial color={theme.bossCore} toneMapped={false} />
          </mesh>
        ))}
        </group>

        {/* Estimated socket, used only when the boss has no rig to parent to.
            The weapon a boss swings is made of the same material the relic will
            be forged from, so what hits you foreshadows what you take. */}
        {!hasModel && (
          <BossWeapon
            slug={bossSlug}
            weaponClass={bossAt(bossLevel ?? 1).weaponClass}
            height={2.75}
          />
        )}

        {/*
          The core is only shown on the primitive boss.
          It was built as the hit-feedback surface and as something that reads as
          the thing you are breaking, which works on a box figure. On a generated
          armoured boss it is a glowing ball stuck to the chest with no relation
          to the model, so the generated case keeps the light and drops the
          sphere.
        */}
        <mesh ref={coreMesh} position={[0, 2.0, 0.58]} visible={!hasModel}>
          <sphereGeometry args={[0.34, 20, 20]} />
          <meshStandardMaterial
            color="#3a1a0d"
            emissive={theme.bossCore}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
        {/* Kept in both cases: it carries the wind-up and the hit flash without
            needing a visible object to hang them on. */}
        <pointLight ref={coreLight} position={[0, 2.0, 0.9]} color={theme.bossCore} intensity={6} distance={9} />
      </group>

      {/* Attack telegraph, flat on the floor and scaled to the boss's reach. */}
      {/*
        The telegraph, as light on the floor rather than a painted hoop.

        It was a flat annulus 1.4 metres thick at 0.4 opacity, which is the same
        mistake the arena markings made and louder: a hard-edged orange band
        around the player, bright enough to be the first thing in the frame.

        A telegraph does need an edge, unlike decoration, because the edge is the
        information: it says where the blow stops. So the edge stays and gets
        thin, and the ground inside it is filled with the same soft falloff the
        arena lights use, which is what carries the growing threat.
      */}
      <group ref={dangerRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} visible={false}>
        <mesh>
          <planeGeometry args={[COMBAT.boss.reach * 2, COMBAT.boss.reach * 2]} />
          <meshBasicMaterial
            ref={dangerFill}
            map={glowTexture()}
            color={theme.bossCore}
            transparent
            opacity={0.2}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <ringGeometry args={[COMBAT.boss.reach - 0.16, COMBAT.boss.reach, 64]} />
          <meshBasicMaterial
            ref={dangerEdge}
            color={theme.bossCore}
            transparent
            opacity={0.5}
            toneMapped={false}
            side={2}
          />
        </mesh>
      </group>

      {/* Damage numbers live on the boss, so a bare number cannot be mistaken
          for anything other than damage dealt to it. */}
      <BossDamagePopups />

      <group ref={plates} position={[0, 1.8, 0]} visible={!hasModel}>
        {brokenPlates.map((p) => (
          <mesh
            key={p.key}
            position={[Math.cos(p.angle) * p.radius, p.height, Math.sin(p.angle) * p.radius]}
            rotation={[p.angle, p.angle * 1.7, 0]}
          >
            <boxGeometry args={[p.size, p.size * 1.5, 0.06]} />
            <meshStandardMaterial color="#332a22" roughness={0.8} metalness={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
});
