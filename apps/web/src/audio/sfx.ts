/**
 * Sound, synthesized at runtime.
 *
 * Every cue here is generated with oscillators and noise buffers rather than
 * loaded from files. That keeps the repo free of binary assets and licensing
 * questions, and audio matters disproportionately for how finished the forge
 * reveal feels, a silent reveal reads as a tech demo.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();

    /*
     * Everything is louder, and a limiter is what makes that safe.
     *
     * The master sat at 0.5 and every cue was written under it, so the whole
     * game played about a stop below where it should: a hover reached -38 dBFS
     * and a sword landing reached -16, on laptop speakers, against a browser at
     * whatever volume the machine happens to be at. It read as sound that was
     * not working rather than sound that was tasteful.
     *
     * Raising the master alone would clip, because cues overlap constantly: a
     * heavy swing lands while the boss is telegraphing while embers are playing.
     * A compressor on the output catches those peaks instead, which is what a
     * game mix does, so the quiet things can come up without the loud moments
     * distorting.
     */
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;

    master.gain.value = 1;
    master.connect(limiter);
    limiter.connect(context.destination);
  }
  // Browsers start the context suspended until a user gesture.
  if (context.state === "suspended") void context.resume();
  return context;
}

export function unlockAudio(): void {
  void ctx();
}

/**
 * Runs a cue once the context is actually running.
 *
 * Browsers start an AudioContext suspended and resume() is asynchronous, so a
 * sound asked for in the same gesture that unlocks the audio is scheduled
 * against a clock that is not moving yet and is simply lost. On every screen
 * after the first that is invisible, because something has already woken the
 * context. On the first screen it is the whole experience: the title screen has
 * exactly one button, so its click is usually the first gesture of the session,
 * and it was the one press guaranteed to be silent.
 *
 * A resume takes a few milliseconds, which is inside the window where a sound
 * still reads as belonging to the press that caused it.
 */
function whenRunning(play: () => void): void {
  const audio = ctx();
  if (!audio || !master) return;
  if (audio.state === "running") {
    play();
    return;
  }
  void audio.resume().then(play, () => {
    /* An autoplay policy refused it. The interface is silent, not broken. */
  });
}

export function setVolume(value: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, value));
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Sweeps to this frequency across the duration. */
  sweepTo?: number;
  delay?: number;
}

function tone(options: ToneOptions) {
  whenRunning(() => emitTone(options));
}

function emitTone({ frequency, duration, type = "sine", gain = 0.3, sweepTo, delay = 0 }: ToneOptions) {
  const audio = ctx();
  if (!audio || !master) return;

  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);

  // Percussive envelope: fast attack, exponential tail. Linear fades click.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise(duration: number, gain = 0.2, filterHz = 1200, delay = 0) {
  whenRunning(() => emitNoise(duration, gain, filterHz, delay));
}

function emitNoise(duration: number, gain: number, filterHz: number, delay: number) {
  const audio = ctx();
  if (!audio || !master) return;

  const start = audio.currentTime + delay;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = audio.createBufferSource();
  source.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterHz;

  const env = audio.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(master);
  source.start(start);
}

/**
 * Interface sounds, which the game had none of.
 *
 * Every sound in here answered something happening in the arena, and the three
 * screens before it were silent: a champion could be chosen, a weapon equipped
 * and a boss picked without the game acknowledging any of it. A menu that makes
 * no sound reads as a menu that has not registered the click, which is why
 * players press things twice.
 *
 * Quiet, not inaudible, and the first pass got that wrong. Written to be
 * unobtrusive, they came out at a peak amplitude of 0.013 for a hover and 0.035
 * for a select once the master gain was applied: about -38 and -29 dBFS, on blips
 * of forty and seventy milliseconds. That is not restraint, it is silence with a
 * volume control attached, and it reads as sound that does not work.
 *
 * They now sit near the quiet end of the fight rather than far below it. Still
 * the smallest sounds in the game, still out of the way in a tenth of a second,
 * but present on laptop speakers, which is where this will be judged.
 *
 * There is no hover cue. It existed, and it fired on scroll: pointerover does not
 * care whether the cursor moved or the page did, so a column of buttons passing a
 * resting pointer rattled. A press is unambiguous and needs no guarding.
 *
 * They belong to the same family as the rest: struck metal, not a chime. Two
 * partials a fifth apart, low and short, so the interface sounds like the forge
 * it is attached to rather than like an operating system.
 */
const UI = {
  /** Picking one thing out of several. */
  select: () => {
    tone({ frequency: 520, duration: 0.09, type: "triangle", gain: 0.24 });
    tone({ frequency: 780, duration: 0.07, type: "sine", gain: 0.13, delay: 0.012 });
  },

  /** Committing: continue, descend, claim. Lower and longer than a select. */
  confirm: () => {
    tone({ frequency: 300, sweepTo: 450, duration: 0.2, type: "triangle", gain: 0.34 });
    tone({ frequency: 600, duration: 0.14, type: "sine", gain: 0.16, delay: 0.02 });
    noise(0.1, 0.09, 3200);
  },

  /** Going back, or closing something. The confirm, inverted. */
  back: () => {
    tone({ frequency: 420, sweepTo: 260, duration: 0.15, type: "triangle", gain: 0.22 });
  },

  /** Pressing something that cannot be pressed yet. */
  denied: () => {
    tone({ frequency: 150, duration: 0.11, type: "square", gain: 0.27 });
  },
} as const;

export const sfx = {
  ...UI,

  swingLight: () => {
    noise(0.16, 0.21, 2600);
    tone({ frequency: 420, sweepTo: 180, duration: 0.14, type: "triangle", gain: 0.15 });
  },

  swingHeavy: () => {
    noise(0.3, 0.3, 1400);
    tone({ frequency: 180, sweepTo: 60, duration: 0.32, type: "sawtooth", gain: 0.24 });
  },

  /** Wind-up. Rising, so it reads as "about to happen" rather than "happened". */
  telegraph: () => {
    tone({ frequency: 90, sweepTo: 340, duration: 0.75, type: "sawtooth", gain: 0.24 });
    tone({ frequency: 180, sweepTo: 500, duration: 0.7, type: "triangle", gain: 0.12, delay: 0.05 });
  },

  /** The swing itself, distinct from the wind-up. */
  bossSwing: () => {
    noise(0.34, 0.36, 1100);
    tone({ frequency: 150, sweepTo: 46, duration: 0.36, type: "sawtooth", gain: 0.3 });
  },

  hitBoss: () => {
    tone({ frequency: 160, sweepTo: 70, duration: 0.2, type: "square", gain: 0.27 });
    noise(0.12, 0.33, 3200);
  },

  playerHurt: () => {
    tone({ frequency: 110, sweepTo: 48, duration: 0.5, type: "sawtooth", gain: 0.36 });
  },

  dodge: () => {
    noise(0.22, 0.15, 5200);
  },

  bossDeath: () => {
    tone({ frequency: 90, sweepTo: 28, duration: 2.2, type: "sawtooth", gain: 0.45 });
    noise(1.8, 0.24, 700);
  },

  /** Forge ignition, the arena has just gone quiet and dark. */
  forgeIgnite: () => {
    tone({ frequency: 48, sweepTo: 130, duration: 2.4, type: "sine", gain: 0.45 });
    noise(2.2, 0.18, 500);
    tone({ frequency: 320, duration: 1.6, type: "triangle", gain: 0.09, delay: 0.4 });
  },

  /** One hammer strike; the sequence calls this on a loop while forging. */
  hammer: () => {
    tone({ frequency: 240, sweepTo: 90, duration: 0.28, type: "square", gain: 0.24 });
    noise(0.2, 0.24, 2200);
  },

  conceptReveal: () => {
    tone({ frequency: 660, duration: 1.1, type: "sine", gain: 0.18 });
    tone({ frequency: 990, duration: 1.3, type: "sine", gain: 0.12, delay: 0.06 });
  },

  /** The weapon materializes. This is the moment the whole project builds to. */
  relicReveal: () => {
    tone({ frequency: 130, sweepTo: 520, duration: 1.4, type: "sawtooth", gain: 0.33 });
    tone({ frequency: 523, duration: 2.4, type: "sine", gain: 0.24, delay: 0.25 });
    tone({ frequency: 784, duration: 2.2, type: "sine", gain: 0.18, delay: 0.35 });
    tone({ frequency: 1046, duration: 2.0, type: "sine", gain: 0.135, delay: 0.45 });
    noise(0.5, 0.3, 4000);
  },

  equip: () => {
    tone({ frequency: 300, sweepTo: 140, duration: 0.24, type: "square", gain: 0.18 });
    noise(0.16, 0.14, 2800);
  },

  defeat: () => {
    tone({ frequency: 140, sweepTo: 40, duration: 2.6, type: "sine", gain: 0.26 });
  },
};
