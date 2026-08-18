import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { ArenaTheme } from "./theme";

/**
 * The floor of each arena, as a material rather than a colour.
 *
 * Every rung's floor was one flat theme tint with a single shared noise map driving
 * roughness. That is enough to stop a surface reading as paint, and not nearly
 * enough to say what the surface *is*: ash, silt, laid tile, wet earth and split
 * obsidian all rendered as the same ground in five colours, which is most of why
 * the arenas felt like one room repainted.
 *
 * Three maps per rung, generated at load rather than shipped:
 *
 *   colour     what the ground is made of, mottled, in the rung's own palette
 *   normal     the relief — cracks, ripples, grout lines, clods, fracture
 *   roughness  which parts of it are polished and which are not
 *
 * The normal map is the one that does the work. Colour variation alone reads as a
 * dirty texture; relief catches the pools of light the arenas are lit by, so the
 * floor picks up a highlight on one side of every ripple and a shadow on the other
 * and finally has a direction to it.
 *
 * Nothing is downloaded and nothing is random. Every value comes from a hash of its
 * own position, so two recordings of the same fight have the same floor — the same
 * rule the sparks and the rubble follow.
 */

/** One texel per centimetre at the tiling below, which is enough for a shin-height view. */
const SIZE = 512;

/**
 * How many times each map repeats across the arena's 28 metres.
 *
 * Fourteen, so a tile is two metres and the features inside it are a hand's width
 * rather than a stride. Six was the first guess, on the theory that a large tile
 * hides its own repeat, and in frame it produced gentle metre-wide undulations that
 * read as terrain rather than as material — invisible from eye height.
 *
 * The scale has to match what the surface is: ash grains, silt ripples and grit in a
 * grout line are all small, and small relief catches the light at a grazing angle,
 * which is exactly how these arenas are lit. The old checkerboard problem came from
 * high contrast under an environment wash, not from tiling as such.
 */
const REPEAT = 14;

/** Deterministic value noise: a hash of the cell, smoothed. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Smoothstep on the cell fraction, so the lattice never shows as diamonds.
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);

  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

/** Several octaves of it, which is the difference between a pattern and a surface. */
function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

/** Distance to the nearest edge of a grid cell, for anything laid or cracked. */
function gridEdge(x: number, y: number, cells: number): number {
  const gx = Math.abs(((x * cells) % 1) - 0.5) * 2;
  const gy = Math.abs(((y * cells) % 1) - 0.5) * 2;
  return Math.max(gx, gy);
}

/**
 * The height field for each rung, in [0, 1]. Everything else is derived from it.
 *
 * These are descriptions of a material, not decorations: what the ground does under
 * a boot. Sand ripples, a floor that has cracked, tiles someone laid, earth that has
 * been walked on, stone that has broken.
 */
const RELIEF: Record<number, (x: number, y: number) => number> = {
  /*
   * Ashen Warden: burnt ground that has cracked and drifted.
   *
   * Wide soft dunes of ash with a network of cracks cut into them — the cracks are
   * the coals' doing, and they run to the same places the light does.
   */
  1: (x, y) => {
    const drift = fbm(x * 3, y * 3);
    const crack = 1 - Math.pow(Math.abs(fbm(x * 6 + 11, y * 6 + 7) - 0.5) * 2, 0.35);
    return drift * 0.75 - crack * 0.4;
  },

  /*
   * Drowned Choir: silt under standing water.
   *
   * Ripples, because that is what water leaves. Directional rather than isotropic —
   * a current came through here — with fine sediment scattered over the top.
   */
  2: (x, y) => {
    /* Sharpened: a sine is a gradient, and a rippled bed is a series of crests with
       shadowed troughs between them. The power curve pinches the troughs. */
    const wave = Math.sin((x * 26 + fbm(x * 4, y * 4) * 7) * Math.PI) * 0.5 + 0.5;
    const ripple = Math.pow(wave, 1.8);
    const sediment = fbm(x * 14, y * 14, 3);
    return ripple * 0.62 + sediment * 0.38;
  },

  /*
   * Gilded Husk: tile someone laid, and has not swept in a long time.
   *
   * The only rung whose floor was made rather than formed, so it is the only one
   * with a straight line in it. Grout sits low, the tiles bow very slightly, and
   * grit has collected in the joints.
   */
  3: (x, y) => {
    const joint = gridEdge(x, y, 8);
    const grout = joint > 0.86 ? 0 : 1;
    const bow = fbm(x * 8, y * 8, 2) * 0.25;
    return grout * (0.75 + bow) + (1 - grout) * 0.2;
  },

  /*
   * Rootbound King: wet earth, trodden and root-bound.
   *
   * Clods at two scales and a slow swell under them, so it reads as ground that
   * gives underfoot rather than stone that does not.
   */
  4: (x, y) => {
    /*
     * Litter, not loam.
     *
     * The first version was two octaves of smooth noise, and smooth noise on a
     * dark floor under a broad pool of light is a flat wash — measured, this rung
     * came out the most featureless of the five. What a forest floor actually has
     * is edges: fallen matter lying *on* the ground, each piece with a boundary.
     * Thresholding the noise gives those boundaries.
     */
    const swell = fbm(x * 2.5, y * 2.5, 3) * 0.4;
    const litter = fbm(x * 7 + 5, y * 7 + 3, 3);
    const clumps = litter > 0.52 ? 0.85 : 0.25;
    const grit = fbm(x * 22, y * 22, 2) * 0.18;
    return swell + clumps * 0.6 + grit;
  },

  /*
   * Hollow Sovereign: obsidian, fractured.
   *
   * Large flat facets meeting at hard edges, which is why this floor can take a
   * polish while the others cannot: a fracture plane is smooth and the break between
   * two of them is not.
   */
  5: (x, y) => {
    const facet = Math.floor(fbm(x * 3.5, y * 3.5, 2) * 7) / 7;
    const split = 1 - Math.pow(Math.abs(fbm(x * 5 + 21, y * 5 + 13) - 0.5) * 2, 0.5);
    return facet * 0.9 - split * 0.5;
  },
};

/** How each rung turns height into how polished the surface is. */
const ROUGHNESS: Record<number, (h: number) => number> = {
  // Ash is uniformly matt; the cracks are slightly glazed by heat.
  1: (h) => 0.98 - Math.max(0, 0.35 - h) * 0.6,
  // Wet: the troughs hold water and shine, the crests have drained.
  2: (h) => 0.28 + h * 0.5,
  // Lacquer on the tiles, grit in the joints.
  3: (h) => (h > 0.5 ? 0.24 : 0.85),
  // Damp earth, matt everywhere, wetter in the hollows.
  4: (h) => 0.72 + (1 - h) * 0.24,
  // Glass, except where it has broken.
  5: (h) => 0.12 + (1 - h) * 0.6,
};

function heightField(level: number): Float32Array {
  const relief = RELIEF[level] ?? RELIEF[1]!;
  const field = new Float32Array(SIZE * SIZE);

  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const value = relief(x / SIZE, y / SIZE);
      field[y * SIZE + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  // Normalised, so a rung whose formula happens to live in a narrow band still
  // gets the full range of relief rather than a flat one.
  const span = max - min || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i]! - min) / span;
  return field;
}

function textureFrom(canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(REPEAT, REPEAT);
  /* Colour is the only one of the three that is a colour. Normals and roughness are
     data, and tagging them sRGB would put a gamma curve through numbers that are not
     brightnesses — the mistake that made the sky glow. */
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface GroundMaps {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

const cache = new Map<number, GroundMaps>();

export function groundMaps(level: number, theme: ArenaTheme): GroundMaps {
  const hit = cache.get(level);
  if (hit) return hit;

  const field = heightField(level);
  const roughnessFor = ROUGHNESS[level] ?? ROUGHNESS[1]!;

  const colourCanvas = document.createElement("canvas");
  const normalCanvas = document.createElement("canvas");
  const roughCanvas = document.createElement("canvas");
  for (const canvas of [colourCanvas, normalCanvas, roughCanvas]) {
    canvas.width = SIZE;
    canvas.height = SIZE;
  }

  const colourCtx = colourCanvas.getContext("2d")!;
  const normalCtx = normalCanvas.getContext("2d")!;
  const roughCtx = roughCanvas.getContext("2d")!;

  const colourData = colourCtx.createImageData(SIZE, SIZE);
  const normalData = normalCtx.createImageData(SIZE, SIZE);
  const roughData = roughCtx.createImageData(SIZE, SIZE);

  /*
   * Two colours, mixed by height.
   *
   * The rung's ground colour is the low end and its wall colour the high end, which
   * keeps every floor inside the palette its arena was designed around while giving
   * the eye two values to separate. Inventing a third colour per rung would look
   * better in isolation and wrong in the room.
   */
  /*
   * Colour has to do most of the work, and that is a lighting fact rather than a
   * preference.
   *
   * These arenas are lit almost entirely by glow quads on the floor — unlit
   * geometry, which a normal map cannot respond to — plus one weak directional and
   * two point lights. So relief alone is nearly invisible at fight distance:
   * measured, the first version's ripples and cracks read as a smooth plane from
   * anywhere but standing on top of a lit pool.
   *
   * What always reads is albedo. The two tints below are pushed further apart than
   * looks sensible in isolation, and the creases carry a baked darkening on top,
   * because contrast in the texture survives lighting that contrast in the geometry
   * does not.
   */
  const low = new Color(theme.ground);
  /*
   * The high end is the pillar tint pulled a little toward the ambient.
   *
   * The wall colour was the obvious pick and it is the wrong one: on every rung it
   * is *darker* than the ground, so height and brightness ran in opposite directions
   * and the relief showed up as a stain rather than as raised material. Pillar is
   * the lightest stone in each palette, and a third of the ambient on top of it is
   * what a raised edge picks up from the room.
   */
  const high = new Color(theme.pillar).lerp(new Color(theme.ambient), 0.75);
  const mixed = new Color();

  /** How strongly the relief bends the light. Steeper than it looks: these are
      metre-scale features seen from eye height. */
  const RELIEF_STRENGTH = 5;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const h = field[i]!;

      // Wrapped, so the normal is continuous across the tile seam.
      const left = field[y * SIZE + ((x - 1 + SIZE) % SIZE)]!;
      const right = field[y * SIZE + ((x + 1) % SIZE)]!;
      const up = field[((y - 1 + SIZE) % SIZE) * SIZE + x]!;
      const down = field[((y + 1) % SIZE) * SIZE + x]!;

      // Central differences, then normalise the resulting surface normal.
      const nx = (left - right) * RELIEF_STRENGTH;
      const ny = (up - down) * RELIEF_STRENGTH;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);

      const p = i * 4;
      normalData.data[p] = ((nx / length) * 0.5 + 0.5) * 255;
      normalData.data[p + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      normalData.data[p + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      normalData.data[p + 3] = 255;

      /* Colour follows height, but only part of the way: at full strength the
         relief showed up twice, once as shading and once as a stain. */
      /*
       * Height into colour, then a crease darkening on top.
       *
       * The second term is doing the job ambient occlusion would do if this scene
       * had any: the low parts of a surface see less of the room and are darker for
       * it, and faking that in the texture is what makes a grout line look recessed
       * rather than painted on.
       */
      mixed.copy(low).lerp(high, h);
      const crease = 0.55 + 0.45 * h;
      mixed.multiplyScalar(crease);
      /*
       * Converted back to sRGB on the way into the canvas.
       *
       * three's Color holds linear light — a hex string is converted on the way in —
       * and a canvas holds sRGB bytes. Writing the linear numbers straight out meant
       * every value was encoded a second time by the renderer reading the texture,
       * and a floor that should have sat around (41,22,15) came out at (21,11,6).
       * This is the same mistake the sky dome had, run the other way: there an sRGB
       * image was read as linear, here linear values were written as an image.
       */
      mixed.convertLinearToSRGB();
      colourData.data[p] = mixed.r * 255;
      colourData.data[p + 1] = mixed.g * 255;
      colourData.data[p + 2] = mixed.b * 255;
      colourData.data[p + 3] = 255;

      const rough = Math.max(0, Math.min(1, roughnessFor(h)));
      roughData.data[p] = rough * 255;
      roughData.data[p + 1] = rough * 255;
      roughData.data[p + 2] = rough * 255;
      roughData.data[p + 3] = 255;
    }
  }

  colourCtx.putImageData(colourData, 0, 0);
  normalCtx.putImageData(normalData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);

  const maps: GroundMaps = {
    map: textureFrom(colourCanvas, true),
    normalMap: textureFrom(normalCanvas, false),
    roughnessMap: textureFrom(roughCanvas, false),
  };
  cache.set(level, maps);
  return maps;
}
