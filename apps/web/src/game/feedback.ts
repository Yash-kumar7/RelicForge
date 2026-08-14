/**
 * Hit feedback bus.
 *
 * Landing a hit produced a sound and a number changing in the HUD, which is not
 * enough to feel like you are killing something. Impact needs to arrive on
 * several channels at once, camera, world, and UI, so this is a tiny
 * subscribable store rather than props threaded through the scene graph.
 *
 * Kept out of Zustand deliberately: these fire per hit and are consumed inside
 * useFrame, so pushing them through React state would re-render the tree in the
 * middle of combat.
 */

export interface DamagePop {
  id: number;
  amount: number;
  kind: "light" | "heavy";
  /** Screen-space offset so simultaneous hits do not stack exactly. */
  jitterX: number;
  jitterY: number;
  bornAt: number;
}

let nextId = 1;

const pops: DamagePop[] = [];
const popListeners = new Set<(pops: DamagePop[]) => void>();

/** Camera shake, decayed in useFrame. */
export const shake = { magnitude: 0 };

/** Brief time dilation on impact, the classic "hitstop" weight cue. */
export const hitstop = { until: 0 };

export function registerHit(amount: number, kind: "light" | "heavy"): void {
  pops.push({
    id: nextId++,
    amount,
    kind,
    jitterX: (Math.random() - 0.5) * 90,
    jitterY: (Math.random() - 0.5) * 40,
    bornAt: performance.now(),
  });
  if (pops.length > 12) pops.shift();

  shake.magnitude = Math.min(0.32, shake.magnitude + (kind === "heavy" ? 0.22 : 0.1));
  hitstop.until = performance.now() + (kind === "heavy" ? 90 : 45);

  popListeners.forEach((listener) => listener([...pops]));
}

/**
 * Taking damage had no signal beyond a bar shrinking, so players watched their
 * health fall without knowing what caused it. This drives a red flash, and the
 * amount is surfaced so the cost of a mistake is legible.
 */
export const playerHurt = { at: 0, amount: 0 };
const hurtListeners = new Set<(hit: { at: number; amount: number }) => void>();

export function registerPlayerHurt(amount = 0): void {
  shake.magnitude = Math.min(0.45, shake.magnitude + 0.3);
  playerHurt.at = performance.now();
  playerHurt.amount = amount;
  hurtListeners.forEach((listener) => listener({ ...playerHurt }));
}

export function subscribePlayerHurt(
  listener: (hit: { at: number; amount: number }) => void,
): () => void {
  hurtListeners.add(listener);
  return () => hurtListeners.delete(listener);
}

export function prunePops(now: number, lifetimeMs = 900): void {
  const before = pops.length;
  while (pops.length > 0 && now - pops[0]!.bornAt > lifetimeMs) pops.shift();
  if (pops.length !== before) popListeners.forEach((listener) => listener([...pops]));
}

export function subscribePops(listener: (pops: DamagePop[]) => void): () => void {
  popListeners.add(listener);
  return () => popListeners.delete(listener);
}

export function resetFeedback(): void {
  pops.length = 0;
  playerHurt.at = 0;
  playerHurt.amount = 0;
  shake.magnitude = 0;
  hitstop.until = 0;
  popListeners.forEach((listener) => listener([]));
}
