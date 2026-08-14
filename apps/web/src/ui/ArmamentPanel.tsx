import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { Group, Quaternion, Vector3 } from "three";
import { normalizeRelic, type WeaponClass } from "@relic/core";
import { meshSampleFrom } from "../lib/meshSample";
import { IRON, useLoadout } from "../state/useLoadout";

/**
 * What you are carrying into the fight.
 *
 * The setup screen showed who you are and what you are hunting but never what
 * is in your hands, which is odd for a game about weapons. The iron sword is
 * always here; relics appear beside it as they are earned, and the empty state
 * says plainly that the next slot is filled by fighting rather than by
 * shopping.
 */

const RELIC_FRAME_HEIGHT = 2.1;

function RelicModel({ url, weaponClass }: { url: string; weaponClass: WeaponClass }) {
  const pivot = useRef<Group>(null);
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  // The same canonicalization the game runs at equip time, so this is the
  // weapon as it will actually be held.
  const canonical = useMemo(
    () => normalizeRelic(meshSampleFrom(model), weaponClass),
    [model, weaponClass],
  );

  const quaternion = useMemo(() => {
    const [x, y, z, w] = canonical.quaternion;
    return new Quaternion(x, y, z, w);
  }, [canonical]);

  const gripOffset = useMemo(() => new Vector3(...canonical.gripOffset), [canonical]);

  useFrame(({ clock }) => {
    if (pivot.current) pivot.current.rotation.y = clock.getElapsedTime() * 0.5;
  });

  return (
    <group ref={pivot}>
      {/* Canonical form puts the grip at the origin with the blade above it, so
          the rig drops to centre the weapon on the camera's aim point. */}
      <group position={[0, -RELIC_FRAME_HEIGHT / 2, 0]}>
        <group position={gripOffset}>
          <group quaternion={quaternion} scale={canonical.scale}>
            <primitive object={model} />
          </group>
        </group>
      </group>
    </group>
  );
}

export function ArmamentPanel() {
  const owned = useLoadout((s) => s.owned);
  const armament = useLoadout((s) => s.armament);
  const select = useLoadout((s) => s.select);

  // Nothing is preselected, so both cards start unchosen and the champion
  // starts empty-handed.
  const selected = useMemo(
    () => (armament && armament !== IRON ? owned.find((r) => r.relicId === armament) ?? null : null),
    [owned, armament],
  );
  const ironChosen = armament === IRON;

  const [modelOk, setModelOk] = useState(true);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(selected.modelUrl, { method: "HEAD" })
      .then((res) => !cancelled && setModelOk(res.ok))
      .catch(() => !cancelled && setModelOk(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Your armament</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* The blade you always have. Selecting it unequips the relic. */}
        <button
          type="button"
          onClick={() => select(IRON)}
          className={[
            "border px-4 py-3 text-left transition",
            ironChosen
              ? "border-stone-500 bg-stone-500/5"
              : "border-ash-700 hover:border-stone-600",
          ].join(" ")}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
            {ironChosen ? "in hand" : "common"}
          </p>
          <p className="mt-1 font-display text-base tracking-[0.12em] text-stone-300">
            Iron Arming Sword
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            25 light · 60 heavy · one of eleven million
          </p>
        </button>

        {/* Earned, or an honest empty state. */}
        <button
          type="button"
          disabled={owned.length === 0}
          onClick={() => owned[0] && select(owned[0].relicId)}
          className={[
            "px-4 py-3 text-left transition",
            selected
              ? "border border-ember-500/50 bg-ember-500/5"
              : owned.length > 0
                ? "border border-ash-700 hover:border-ember-500/40"
                : "cursor-not-allowed border border-dashed border-ash-700",
          ].join(" ")}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-700">
            {selected ? "in hand" : "relic"}
          </p>
          {selected ? (
            <>
              <p className="mt-1 font-display text-base tracking-[0.12em] text-ember-300">
                {selected.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                {selected.dna.element} · {selected.dna.temperament} · {selected.dna.condition}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-base tracking-[0.3em] text-stone-700">??????</p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                Won by fighting, not chosen from a list
              </p>
            </>
          )}
        </button>
      </div>

      {/* The relic itself, turning. */}
      {selected && modelOk && (
        <div className="mt-3 h-52 border border-ash-800 bg-ash-950">
          <Canvas camera={{ position: [1.9, 0.1, 1.9], fov: 42 }}>
            <ambientLight intensity={0.55} />
            <directionalLight position={[3, 5, 3]} intensity={2.2} />
            <directionalLight position={[-3, 1, -2]} intensity={0.7} color="#ff8c42" />
            <Suspense fallback={null}>
              <RelicModel url={selected.modelUrl} weaponClass={selected.dna.weaponClass} />
              <Environment preset="night" />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* Switching between relics you have kept. */}
      {owned.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {owned.map((relic) => (
            <button
              key={relic.relicId}
              type="button"
              onClick={() => select(relic.relicId)}
              className={[
                "border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition",
                selected?.relicId === relic.relicId
                  ? "border-ember-500/60 text-ember-300"
                  : "border-ash-800 text-stone-600 hover:border-stone-600",
              ].join(" ")}
            >
              {relic.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
