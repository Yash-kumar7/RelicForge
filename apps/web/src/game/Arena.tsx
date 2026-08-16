import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PointLight } from "three";
import { useGameStore } from "../state/useGameStore";
import { themeForBoss } from "./theme";
import { ARENA_RADIUS, FORGE_POSITION } from "./arenaGeometry";
import { ArenaFeatures } from "./arenaFeatures";
import { Forge } from "./Forge";
import { Backdrop } from "./Backdrop";
import { ArenaScenery } from "./ArenaScenery";

export { ARENA_RADIUS } from "./arenaGeometry";

/**
 * The arena exists to frame two things: the boss, and the forge behind it.
 * Everything is built from primitives, a downloaded environment would add
 * megabytes and pull attention away from the one asset that matters.
 *
 * Its palette and layout both key off the player's affinity, so an ember run
 * and a frost run do not read as the same footage twice.
 */
export function Arena() {
  const phase = useGameStore((s) => s.phase);
  const bossLevel = useGameStore((s) => s.bossLevel) ?? 1;
  // The arena is the boss's domain, so it wears the boss's colours.
  const theme = themeForBoss(bossLevel);
  const forgeLight = useRef<PointLight>(null);

  /*
   * No pillars.
   *
   * A ring of them stood at the edge of every arena and nothing ever touched
   * one: they could not be hidden behind, they did not block the boss's line,
   * and they did not stop a swing. Ten boxes of scenery per fight, varied by
   * count and height per rung, doing the work of a background image. The rungs
   * are told apart by their floors and their light now, which the player is
   * actually looking at.
   */
  // The forge wakes when the boss dies: the arena dims and the only warm light
  // left in the scene is the thing about to make your weapon.
  const forgeActive = phase !== "FIGHTING" && phase !== "TITLE" && phase !== "CHOOSE_AFFINITY";

  useFrame(({ clock }) => {
    if (!forgeLight.current) return;
    const t = clock.getElapsedTime();
    const base = forgeActive ? 26 : 6;
    // Storm flickers rather than breathes.
    const pulse =
      bossLevel === 5
        ? Math.sin(t * 13) * 4 + Math.sin(t * 31) * 2
        : Math.sin(t * 3.1) * 3 + Math.sin(t * 7.7) * 1.5;
    forgeLight.current.intensity = base + pulse;
  });

  return (
    <group>
      <fog attach="fog" args={[theme.fog, 12, 44]} />

      {/*
        Something behind everything.

        Past the wall the scene ended in flat clear colour, so the horizon was
        wherever the wall stopped and every rung's background was one value of
        near-black. A dome with the rung's own colour bleeding up from the
        horizon gives the scenery something to stand against, which is what makes
        a silhouette read as a silhouette. It costs nothing: one gradient built in
        a canvas at load.
      */}
      <Backdrop level={bossLevel} theme={theme} />
      <ambientLight intensity={forgeActive ? 0.12 : 0.28} color={theme.ambient} />
      <hemisphereLight args={[theme.ambient, theme.fog, forgeActive ? 0.15 : 0.4]} />
      <directionalLight
        position={[6, 14, 4]}
        intensity={forgeActive ? 0.15 : 0.9}
        color={theme.keyLight}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS, 64]} />
        {/*
          The last rung's floor is polished, and every other one is not.

          Stone that takes a shine is the cheapest way to make a room feel built
          rather than poured, and it is the only surface in the game with anything
          above it worth reflecting: the Sovereign's debris hangs over this arena
          and lands on the floor as light. Everywhere else, rough stone is
          correct, and a mirror would read as ice.
        */}
        <meshStandardMaterial
          color={theme.ground}
          roughness={bossLevel === 5 ? 0.28 : 0.95}
          metalness={bossLevel === 5 ? 0.55 : 0.05}
        />
      </mesh>

      {/*
        No markings on the floor.

        There were rings, arcs and fissures, redrawn per rung, and every version
        of them looked like paint: flat unlit geometry lying on a dark surface
        reads as a road marking however thin it is drawn, because nothing in a
        3D scene lights it or casts on it. What tells one of these rooms from
        another is light, which is in arenaFeatures.
      */}

      {/*
        No cylinder wall on any rung now.

        It was a six-metre tube of flat colour standing where the horizon should
        be, and it had to go for two reasons. It looked like what it was, and it
        would have hidden every piece of scenery behind it: the set pieces stand
        outside the old wall line, which is the only place they can stand without
        being something a player walks into.

        What bounds the arena instead is what bounds a real place: the ground runs
        out, the fog closes, and there are large things standing in the distance.
      */}
      <ArenaScenery level={bossLevel} />

      {/*
        What actually makes this rung a different place.

        Ten colours and a pillar count is a reskin, and it read as one room five
        times over. Each level now has one structural idea: a cracked floor, a
        flood, a laid-out hall, roots and a canopy, or no walls at all.
      */}
      <ArenaFeatures level={bossLevel} theme={theme} />

      {/* The forge. Dormant during the fight, the focal point afterwards. */}
      <group position={[FORGE_POSITION.x, 0, FORGE_POSITION.z]}>
        <Forge active={forgeActive} stone={theme.pillar} glow={theme.forge} />
        <pointLight
          ref={forgeLight}
          position={[0, 1.6, 1.6]}
          color={theme.forge}
          distance={30}
          decay={2}
        />
      </group>
    </group>
  );
}
