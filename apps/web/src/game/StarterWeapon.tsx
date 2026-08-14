import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { weaponSway } from "@relic/core";
import { playerHandle } from "./Player";
import { attackSpec } from "./combat";
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

    let swing = 0;
    const attack = playerHandle.attacking;
    if (attack) {
      const spec = attackSpec(attack.kind);
      const total = spec.windupMs + spec.activeMs + spec.recoveryMs;
      const t = Math.min(1, (performance.now() - attack.startedAt) / total);
      const windupPortion = spec.windupMs / total;
      // Pull back, then commit. Heavy swings travel further.
      const amplitude = attack.kind === "heavy" ? 2.9 : 2.1;
      swing =
        t < windupPortion
          ? -(t / windupPortion) * 0.6
          : Math.sin(((t - windupPortion) / (1 - windupPortion)) * Math.PI) * amplitude - 0.6;
    }

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
