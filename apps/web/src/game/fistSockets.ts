import { DEFAULT_HAND_SOCKET, HAND_SOCKETS, type HandSocketRatios } from "./handSockets";

/*
 * Hand-authored sockets, kept out of the generated file.
 *
 * These used to live in handSockets.ts beside the derived values, and
 * derive-sockets.ts rewrites that file wholesale, so running the generator
 * silently deleted every number that had been placed by eye. A file that is
 * generated cannot also be edited by hand, and the only reliable way to enforce
 * that is for the two to be different files.
 */

/**
 * Where the closed fist is on the *static* mesh, authored by eye.
 *
 * The generated ratios above cannot answer this, and the reason is worth stating
 * because it cost several rounds to find. Meshy's rigging re-poses a character
 * into a neutral A-pose, arms lowered and hands opened. So the rig knows exactly
 * where a hand is, and it is not the hand the concept drew: the static mesh
 * keeps the raised, closed fist the character was generated with, and the rig
 * has neither the raise nor the fist.
 *
 * That leaves two meshes, each holding half the answer. The setup screen shows
 * the static one, because a closed fist is the whole point of regenerating these
 * characters, so its socket has to be authored rather than measured.
 *
 * First read off each character's concept image, then corrected against a
 * screenshot of Ember holding the iron sword. The blade gives a scale reference,
 * 0.765 world units across about 310 pixels, and the fist sat one pommel low and
 * roughly 0.15 units inboard of the hilt. The same correction is applied to all
 * eight, because they were all estimated the same way and therefore carry the
 * same bias.
 *
 * Two screenshots then disagreed about which way x was wrong, because the
 * preview turntable was running: a front-on offset projects differently at every
 * angle and depth reads as horizontal error. x is set between the two readings
 * and the turntable now stops while ?socket is on, so the next judgement is made
 * against something that is holding still.
 *
 * Height came out of both readings agreeing, so y is trusted.
 */
export const FIST_SOCKETS: Record<string, HandSocketRatios> = {
  ember: { x: -0.4, y: 0.71, z: 0.34, bone: "RightHand" },
  frost: { x: -0.48, y: 0.67, z: 0.38, bone: "RightHand" },
  storm: { x: -0.46, y: 0.65, z: 0.38, bone: "RightHand" },
  "ashen-warden": { x: -0.42, y: 0.66, z: 0.32, bone: "RightHand" },
  "drowned-choir": { x: -0.42, y: 0.67, z: 0.32, bone: "RightHand" },
  "gilded-husk": { x: -0.42, y: 0.54, z: 0.28, bone: "RightHand" },
  "rootbound-king": { x: -0.44, y: 0.54, z: 0.28, bone: "RightHand" },
  "hollow-sovereign": { x: -0.42, y: 0.56, z: 0.28, bone: "RightHand" },
};


/**
 * The authored socket when there is one, the derived one otherwise.
 *
 * Authored wins because the derived values describe the rig's pose, and the rig
 * is not the pose the static mesh is in.
 */
export function fistSocketFor(slug: string): HandSocketRatios {
  return FIST_SOCKETS[slug] ?? HAND_SOCKETS[slug] ?? DEFAULT_HAND_SOCKET;
}
