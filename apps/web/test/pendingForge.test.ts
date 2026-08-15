import { beforeEach, describe, expect, it } from "vitest";
import { usePendingForge, type PendingForge } from "../src/state/usePendingForge";

/**
 * Leaving a forge running.
 *
 * Level one is cached and instant, but every other rung generates for real, and
 * holding a player inside a cinematic for two minutes is the wrong trade for a
 * fight they may want to move on from. Leaving closes the client's event stream;
 * it does not cancel anything, because the forge runs server side keyed by relic
 * id.
 */
/**
 * Minimal localStorage, because these tests run in Node.
 *
 * The store already guards for its absence, since the game has to work where
 * storage is unavailable, and that guard is what makes a stub sufficient here
 * rather than needing a whole DOM.
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
});

const pending: PendingForge = {
  relicId: "abc-123",
  name: "Pyrevow",
  bossLevel: 2,
  startedAt: 1_000,
};

beforeEach(() => {
  localStorage.clear();
  usePendingForge.setState({ pending: null });
});

describe("pending forge", () => {
  it("starts with nothing waiting", () => {
    expect(usePendingForge.getState().pending).toBeNull();
  });

  it("remembers the relic id, which is all that is needed to pick it up again", () => {
    usePendingForge.getState().leave(pending);
    expect(usePendingForge.getState().pending?.relicId).toBe("abc-123");
  });

  it("survives a reload, since a wait outlives a refresh more easily than patience", () => {
    usePendingForge.getState().leave(pending);
    expect(localStorage.getItem("relicforge.pending.v1")).toContain("abc-123");
  });

  it("clears once settled, so a claimed relic is not offered twice", () => {
    usePendingForge.getState().leave(pending);
    usePendingForge.getState().settle();
    expect(usePendingForge.getState().pending).toBeNull();
    expect(localStorage.getItem("relicforge.pending.v1")).toBeNull();
  });

  it("ignores a stored entry that is missing its identity", () => {
    // A stale record from an older build must not break the setup screen on
    // boot, and one with no relic id can never be resolved anyway.
    localStorage.setItem("relicforge.pending.v1", JSON.stringify({ name: "Pyrevow" }));
    usePendingForge.setState({ pending: null });
    expect(usePendingForge.getState().pending).toBeNull();
  });
});
