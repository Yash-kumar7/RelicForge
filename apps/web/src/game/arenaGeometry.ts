/**
 * Arena geometry, in one place.
 *
 * These four numbers are related, and when they lived as separate literals in
 * three files nothing expressed that. The boss shipped with no bound at all and
 * knockback pushed it through the wall; the camera boom was set independently and
 * clipped through the same wall. Both were the same mistake: a value that only
 * makes sense relative to the others being chosen in isolation.
 *
 * The relationships that must hold:
 *
 *   BOSS_LIMIT  <  PLAYER_LIMIT   the boss cannot retreat past where the player
 *                                 can stand, or a fight at the edge stalls
 *   PLAYER_LIMIT < CAMERA_LIMIT   the camera sits behind the player, so it needs
 *                                 room outside the player's limit
 *   CAMERA_LIMIT < RADIUS         but still inside the wall, or the shot shows
 *                                 the outside of the arena
 *
 * PLAYER_LIMIT - BOSS_LIMIT must also stay under the shortest attack reach, or
 * a boss pinned at the wall becomes unreachable.
 */
export const ARENA_RADIUS = 14;

/** How far from the centre the player can walk. */
export const PLAYER_LIMIT = ARENA_RADIUS - 1;

/** The boss is a wider body, so it stops further in. */
export const BOSS_LIMIT = ARENA_RADIUS - 1.8;

/** The third-person camera may sit outside the player, but not outside the wall. */
export const CAMERA_LIMIT = ARENA_RADIUS - 0.6;

/**
 * The forge, which is solid.
 *
 * It is the only object inside the arena a body can meet, and until now it was
 * not one: the player walked straight through the furnace the entire game is
 * built around, which is the same thing that made the old pillars worthless. A
 * thing you pass through is scenery no matter how good the mesh is.
 *
 * Kept here rather than in Arena.tsx because the position is now load-bearing:
 * the renderer draws it there and the player is pushed out of it there, and those
 * two agreeing is the whole point of this file.
 */
export const FORGE_POSITION = { x: 0, z: -ARENA_RADIUS + 2.5 } as const;

/**
 * A little wider than the mesh, as a collision radius should be.
 *
 * The forge is roughly 2 units across at the base. Standing flush against a
 * generated model looks like clipping into it, because the silhouette is uneven
 * and the eye reads the widest part as the surface.
 */
export const FORGE_RADIUS = 1.9;
