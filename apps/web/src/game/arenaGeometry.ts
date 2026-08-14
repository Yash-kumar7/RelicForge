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
