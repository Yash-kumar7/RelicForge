import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, InstancedMesh, Object3D, PointLight } from "three";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

/**
 * Live backdrop for the title screen.
 *
 * Deliberately independent of the API and of any generated asset: the showcase
 * above it needs relics to exist, and the very first thing a visitor sees
 * cannot be a blank page while a fetch resolves. This always renders.
 *
 * A forge burning in the dark with embers rising off it, which is the entire
 * premise of the game in one image.
 */

const EMBER_COUNT = 220;

function Embers() {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const particles = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, () => ({
        x: (Math.random() - 0.5) * 26,
        y: Math.random() * 16 - 4,
        z: (Math.random() - 0.5) * 14 - 2,
        speed: 0.5 + Math.random() * 1.6,
        drift: 0.3 + Math.random() * 0.9,
        scale: 0.014 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced) return;

    for (let i = 0; i < EMBER_COUNT; i++) {
      const p = particles[i]!;
      p.y += p.speed * delta;
      p.x += Math.sin(p.phase + p.y * 0.4) * p.drift * delta;
      if (p.y > 12) {
        p.y = -5;
        p.x = (Math.random() - 0.5) * 26;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, EMBER_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={new Color("#ff8c42")}
        blending={AdditiveBlending}
        transparent
        opacity={0.85}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function ForgeGlow() {
  const light = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    if (!light.current) return;
    const t = clock.getElapsedTime();
    // Irregular double pulse so it reads as fire rather than a sine wave.
    light.current.intensity = 24 + Math.sin(t * 2.7) * 6 + Math.sin(t * 6.3) * 3;
  });

  /**
   * Light only, no visible geometry.
   *
   * An emissive box read as a stray glowing rectangle rather than as a forge:
   * at this camera distance there is no context to tell you what the shape is,
   * so it looked like a UI defect. The embers and the bloom carry the idea on
   * their own, and a light source with nothing to read as a box cannot be
   * mistaken for one.
   */
  return (
    <group position={[0, -3.4, -4]}>
      <pointLight ref={light} position={[0, 0.6, 2]} color="#ff7a2a" distance={34} decay={2} />
      {/* A second, dimmer source further back gives the glow some depth. */}
      <pointLight position={[0, 1.6, -1]} color="#ff5a12" intensity={8} distance={22} decay={2} />
    </group>
  );
}

function DriftingCamera() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    // Slow parallax so the page is never completely still.
    camera.position.x = Math.sin(t * 0.12) * 0.9;
    camera.position.y = 1 + Math.sin(t * 0.09) * 0.35;
    camera.lookAt(0, -0.5, -4);
  });
  return null;
}

export function TitleBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas camera={{ position: [0, 1, 6], fov: 55 }} gl={{ antialias: true }}>
        <color attach="background" args={["#0a0908"]} />
        <fog attach="fog" args={["#0a0908", 8, 30]} />
        <ambientLight intensity={0.12} />
        <ForgeGlow />
        <Embers />
        <DriftingCamera />
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.6} luminanceSmoothing={0.35} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.9} />
        </EffectComposer>
      </Canvas>
      {/* Keeps the copy readable over a moving image. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ash-950/80 via-ash-950/55 to-ash-950/92" />
    </div>
  );
}
