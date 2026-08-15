import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Box3, Group, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Reads the weapon socket out of each rig and writes it into a committed table.
 *
 * Every socket bug this project has had came from estimating where a hand is.
 * The static preview guessed 0.46 of character height, which is mid-thigh, and
 * hung relics at the leg. It guessed the wrong side, and put the weapon in the
 * left hand. Both were guesses about something the rig already knows exactly.
 *
 * The rigs are the answer, but only the arena can query them at runtime: the
 * setup screen renders the unrigged model.glb, which has no skeleton. So the
 * answer is extracted here, once, and shipped as data.
 *
 * Positions are stored as fractions of the fitted character rather than world
 * units, so they survive a change to AVATAR_HEIGHT or BOSS_HEIGHT.
 *
 * Writes handSockets.ts wholesale, which is why nothing hand-authored may live
 * in that file. The sockets placed by eye are in fistSockets.ts for exactly this
 * reason: running this script once deleted them, silently, because a generated
 * file cannot also be edited by hand.
 *
 *   cd apps/web && npx tsx scripts/derive-sockets.ts
 */

/**
 * Which hand holds the weapon, per character.
 *
 * Read off the concept images by eye, because nothing in the mesh distinguishes
 * a closed fist from an open hand. The image model does not reliably honour
 * "the right hand": on the first pass seven of eight put the fist on the
 * character's right and Ember put it on the left.
 *
 * Ember was re-rolled rather than accommodated, because a champion holding its
 * sword in the opposite hand to everyone else reads as a mistake even though the
 * code handles it. Three candidates at nine credits each, two of which landed on
 * the correct side, then one mesh. Generating several cheap images and looking
 * before spending the expensive one is the only reliable way to control a detail
 * the prompt cannot.
 *
 * The table stays because the model can drift again on any future run.
 */
const FIST_HAND: Record<string, "LeftHand" | "RightHand"> = {
  // Ember originally closed its left hand, which is why this table exists. Its
  // concept was re-rolled until the fist landed on the same side as the other
  // seven, so all eight now agree.
  ember: "RightHand",
  frost: "RightHand",
  storm: "RightHand",
  "ashen-warden": "RightHand",
  "drowned-choir": "RightHand",
  "gilded-husk": "RightHand",
  "rootbound-king": "RightHand",
  "hollow-sovereign": "RightHand",
};

const STORAGE = path.resolve("../api/storage");
const OUT = path.resolve("src/game/handSockets.ts");

/** Strips textures so GLTFLoader runs headless. Geometry and skeleton untouched. */
function stripped(buf: Buffer): Buffer {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as Record<
    string,
    unknown
  >;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  delete json.extensionsRequired;
  delete json.extensionsUsed;
  for (const m of (json.materials as Record<string, unknown>[] | undefined) ?? []) {
    const pbr = m.pbrMetallicRoughness as Record<string, unknown> | undefined;
    delete pbr?.baseColorTexture;
    delete pbr?.metallicRoughnessTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    delete m.extensions;
  }
  const jb = Buffer.from(JSON.stringify(json), "utf8");
  const jp = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const bin = buf.subarray(20 + jsonLen);
  const head = Buffer.alloc(20);
  head.write("glTF", 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jp.length + bin.length, 8);
  head.writeUInt32LE(jp.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, jp, bin]);
}

function findBone(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((node) => {
    if (!found && node.name === name) found = node;
  });
  return found;
}

interface Socket {
  slug: string;
  /** Fractions of the fitted character's width, height and depth. */
  x: number;
  y: number;
  z: number;
  /** Which bone the runtime should follow on the rigged path. */
  bone: "LeftHand" | "RightHand";
}

async function socketFor(dir: string, slug: string): Promise<Socket | null> {
  const raw = await readFile(path.join(dir, "rig", "walking.glb")).catch(() => null);
  if (!raw) return null;

  const clean = stripped(raw);
  const gltf = await new GLTFLoader().parseAsync(
    clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength) as ArrayBuffer,
    "",
  );
  const scene = gltf.scene;
  scene.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  const bone = findBone(scene, FIST_HAND[slug] ?? "RightHand");
  if (!bone) return null;

  // Mirror the runtime's own fit so the fractions mean the same thing there.
  const root = new Group();
  const fitted = new Group();
  fitted.position.set(-center.x, -box.min.y, -center.z);
  fitted.add(scene);
  root.add(fitted);
  root.updateWorldMatrix(true, true);

  const local = new Matrix4().multiplyMatrices(
    new Matrix4().copy(root.matrixWorld).invert(),
    bone.matrixWorld,
  );
  const p = new Vector3();
  local.decompose(p, new Quaternion(), new Vector3());

  return {
    slug,
    x: Number((p.x / size.x).toFixed(4)),
    y: Number((p.y / size.y).toFixed(4)),
    z: Number((p.z / size.z).toFixed(4)),
    bone: FIST_HAND[slug] ?? "RightHand",
  };
}

async function main(): Promise<void> {
  const sockets: Socket[] = [];

  for (const kind of ["champions", "bosses"] as const) {
    const root = path.join(STORAGE, kind);
    for (const slug of (await readdir(root).catch(() => [])).filter((d) => !d.includes("."))) {
      const socket = await socketFor(path.join(root, slug), slug);
      if (socket) {
        sockets.push(socket);
        console.log(
          `${slug.padEnd(18)} ${FIST_HAND[slug] ?? "RightHand"}  ` +
            `x ${socket.x.toFixed(3)}  y ${socket.y.toFixed(3)}  z ${socket.z.toFixed(3)}`,
        );
      } else {
        console.log(`${slug.padEnd(18)} no rig yet`);
      }
    }
  }

  const body = sockets
    .map((s) => `  "${s.slug}": { x: ${s.x}, y: ${s.y}, z: ${s.z}, bone: "${s.bone}" },`)
    .join("\n");

  await writeFile(
    OUT,
    `// Generated by apps/web/scripts/derive-sockets.ts. Do not edit by hand.
//
// Where each character's weapon hand actually is, read out of its rig and
// expressed as fractions of the fitted character's own bounding box.
//
// This exists because the setup screen renders the unrigged model.glb, which has
// no skeleton to query, and every estimate of that position has been wrong: 0.46
// of height is mid-thigh and hung relics at the leg, and a fixed sign put the
// weapon in the left hand. The rig knows exactly, so the answer is extracted
// once and shipped rather than guessed at runtime.
//
// Fractions rather than world units, so a change to AVATAR_HEIGHT or
// BOSS_HEIGHT does not silently move every weapon.

export interface HandSocketRatios {
  x: number;
  y: number;
  z: number;
  /**
   * Which hand actually holds the weapon.
   *
   * Not always the right one: the image model does not reliably honour "the
   * right hand", and Ember came back with its fist on the left. Nothing in the
   * mesh distinguishes a closed fist from an open one, so this is recorded from
   * the concept rather than detected.
   */
  bone: "LeftHand" | "RightHand";
}

export const HAND_SOCKETS: Record<string, HandSocketRatios> = {
${body}
};

/**
 * Falls back to the middle of the measured range rather than to nothing, so a
 * character generated after this file was last regenerated still holds its
 * weapon at a plausible height instead of at its feet.
 */
export const DEFAULT_HAND_SOCKET: HandSocketRatios = {
  x: -0.42,
  y: 0.57,
  z: 0.14,
  bone: "RightHand",
};

export function handSocketFor(slug: string): HandSocketRatios {
  return HAND_SOCKETS[slug] ?? DEFAULT_HAND_SOCKET;
}
`,
    "utf8",
  );

  console.log(`\nWrote ${sockets.length} sockets to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
