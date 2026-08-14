import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { weaponSway } from "@relic/core";
import { playerHandle } from "./Player";
import { swingProgress } from "./swing";
import { useGameStore } from "../state/useGameStore";
import { themeFor } from "./theme";
import { IronSwordMesh } from "./IronSwordMesh";

/**
 * The blade you start with.
 *
 * Fighting with empty hands made swings unreadable, there was nothing on
 * screen to connect the click to the damage. It also costs the ending its
 * contrast: a plain, mass-produced iron sword is exactly the thing the
 * generated relic is supposed to replace, so the player should be looking at
 * one for the whole fight.
 *
 * Built from primitives on purpose. Spending a Meshy generation on the starter
 * weapon would blur the one moment that matters.
 */
export function StarterWeapon() {
  const { camera } = useThree();
  const socket = useRef<Group>(null);
  const phase = useGameStore((s) => s.phase);
  const affinity = useGameStore((s) => s.affinity);
  const theme = themeFor(affinity);

  useFrame(({ clock }) => {
    const group = socket.current;
    if (!group) return;

    group.position.copy(camera.position);
    group.quaternion.copy(camera.quaternion);

    const sway = weaponSway(clock.getElapsedTime(), playerHandle.moving);

    const swing = swingProgress(playerHandle.attacking);

    group.translateX(0.32 + sway.x);
    group.translateY(-0.42 + sway.y);
    group.translateZ(-0.6);
    group.rotateX(0.18 - swing * 0.5);
    group.rotateY(-0.26);
    group.rotateZ(-0.34 - swing);
  });

  if (phase !== "FIGHTING") return null;

  return (
    <group ref={socket}>
      <IronSwordMesh accent={theme.forge} />
    </group>
  );
}
