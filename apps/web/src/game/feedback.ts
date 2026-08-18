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

/**
 * Brief time dilation on impact, the classic "hitstop" weight cue.
 *
 * `from` is the instant contact happened, and it is what makes this a hitstop
 * rather than a pause on a decay curve. The swing pose is evaluated at `from`
 * for as long as the freeze lasts, so the blade stops dead inside the thing it
 * hit instead of sweeping through at constant speed. That constant speed is the
 * whole reason a landed hit looked like a miss: nothing in the world
 * acknowledged the moment of contact.
 */
export const hitstop = { from: 0, until: 0 };

/** True while the world should be held on the frame of impact. */
export function frozenAt(now: number): number | null {
  return now < hitstop.until ? hitstop.from : null;
}

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
  /* Long enough to read as a stop rather than a stutter. Fighting games sit
     around 60-150ms for exactly this, and a light hit wants less than a heavy
     one or every jab feels like a hammer. */
  const at = performance.now();
  hitstop.from = at;
  hitstop.until = at + (kind === "heavy" ? 120 : 65);

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
  /* Taking one has weight too. Without this only the blows you land stop the
     world, so the boss connecting reads as lighter than your own jab. */
  const at = performance.now();
  hitstop.from = at;
  hitstop.until = at + 90;
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

/** Dodge, so the HUD can confirm it registered. */
export const lastDodge = { at: 0 };

export function registerDodge(): void {
  lastDodge.at = performance.now();
}

/** Boss wind-up, so the UI can warn even when the boss is off screen. */
const telegraphListeners = new Set<(at: number) => void>();

export function registerTelegraph(): void {
  telegraphListeners.forEach((listener) => listener(performance.now()));
}

export function subscribeTelegraph(listener: (at: number) => void): () => void {
  telegraphListeners.add(listener);
  return () => telegraphListeners.delete(listener);
}

export function resetFeedback(): void {
  pops.length = 0;
  playerHurt.at = 0;
  playerHurt.amount = 0;
  shake.magnitude = 0;
  hitstop.from = 0;
  hitstop.until = 0;
  // Otherwise the dodge bar opens a fight showing a recharge from the last one.
  lastDodge.at = 0;
  popListeners.forEach((listener) => listener([]));
}
