/**
 * The starter blade, as geometry only.
 *
 * Shared by the first-person view in the arena and by the champion holding it
 * on the setup screen. Selecting a weapon and seeing your champion's hands stay
 * empty made the loadout look broken, and the iron sword is the one weapon with
 * no GLB behind it because it is built from primitives on purpose: spending a
 * Meshy generation on the thing the relic exists to replace would blur the
 * comparison.
 *
 * Modelled grip-at-origin, blade up the +Y axis, matching the canonical form
 * normalizeRelic produces, so both call sites can position it identically.
 */
export function IronSwordMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* grip */}
      <mesh>
        <cylinderGeometry args={[0.028, 0.032, 0.26, 10]} />
        <meshStandardMaterial color="#2a201a" roughness={0.95} />
      </mesh>
      {/* pommel */}
      <mesh position={[0, -0.16, 0]}>
        <sphereGeometry args={[0.045, 12, 12]} />
        <meshStandardMaterial color="#4a4038" roughness={0.6} metalness={0.7} />
      </mesh>
      {/* crossguard */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.32, 0.05, 0.07]} />
        <meshStandardMaterial color="#55493d" roughness={0.55} metalness={0.75} />
      </mesh>
      {/* blade */}
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.1, 0.92, 0.024]} />
        <meshStandardMaterial color="#8d8b86" roughness={0.35} metalness={0.9} />
      </mesh>
      {/* tip */}
      <mesh position={[0, 1.13, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.071, 0.071, 0.024]} />
        <meshStandardMaterial color="#8d8b86" roughness={0.35} metalness={0.9} />
      </mesh>
      {/* Faint affinity glow along the fuller, so even the common blade belongs
          to the run you chose. */}
      <mesh position={[0, 0.62, 0.014]}>
        <boxGeometry args={[0.016, 0.86, 0.004]} />
        <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
